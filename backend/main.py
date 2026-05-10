import logging
import os
import uuid
from contextlib import asynccontextmanager

from dotenv import load_dotenv

# load_dotenv MUST run before any LangChain / OpenAI import
load_dotenv()

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import asyncio

from agents.chat import run_chat_agent
from agents.crisis.reporter import reporter_loop
from orchestrator import graph, crisis_graph

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)-30s  %(levelname)s  %(message)s",
)
logger = logging.getLogger(__name__)


# ── Startup validation ─────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError(
            "OPENAI_API_KEY is not set.\n"
            "Create backend/.env with:  OPENAI_API_KEY=sk-..."
        )
    logger.info("GitMind backend starting — OPENAI_API_KEY present")
    yield
    logger.info("GitMind backend shutting down")


# ── App ────────────────────────────────────────────────────────────────────────

app = FastAPI(title="GitMind API", lifespan=lifespan)

_DEV_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
_EXTRA_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
_CLOUDSHELL_REGEX = r"https?://3000-[\w.-]+\.cloudshell\.dev"

app.add_middleware(
    CORSMiddleware,
    allow_origins=_DEV_ORIGINS + _EXTRA_ORIGINS,
    allow_origin_regex=_CLOUDSHELL_REGEX,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# In-memory session store — keyed by session_id UUID
# Shape: {repo_name, chroma_collection_name, security_findings, chat_history}
sessions: dict[str, dict] = {}


# ── Request models ─────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    session_id: str
    question:   str


# ── State initialiser (single source of truth for initial RepoState) ──────────

def _initial_state(repo_url: str) -> dict:
    return {
        "repo_url":               repo_url,
        "local_path":             None,
        "file_tree":              [],
        "file_contents":          {},
        "repo_name":              "",
        "architecture_diagram":   None,
        "api_docs":               [],
        "security_findings":      [],
        "chroma_collection_name": None,
        "chat_history":           [],
        "selected_finding_id":    None,
        "crisis_messages":        [],
        "crisis_turn":            0,
        "public_signals":         [],
        "reporter_published":     False,
        "crisis_resolved":        False,
        "events":                 [],
    }


# ── Agent → frontend status mapping ───────────────────────────────────────────

_STATUS_MAP: dict[str, dict[str, str]] = {
    "scanner":      {
        "scanner": "done", "architecture": "running",
        "api_docs": "running", "security": "running", "chat": "running",
    },
    "architecture": {"architecture": "done"},
    "api_docs":     {"api_docs": "done"},
    "security":     {"security": "done"},
    "rag_setup":    {"chat": "done"},
}


# ── WebSocket endpoint ─────────────────────────────────────────────────────────

@app.websocket("/ws/analyze")
async def ws_analyze(ws: WebSocket):
    await ws.accept()

    try:
        payload = await ws.receive_json()
    except Exception:
        await ws.close(code=1003)
        return

    repo_url   = (payload.get("repo_url") or "").strip()
    session_id = payload.get("session_id") or str(uuid.uuid4())

    if not repo_url:
        await ws.send_json({"error": "repo_url is required"})
        await ws.close()
        return

    logger.info("Analysis started  session=%s  repo=%s", session_id, repo_url)
    initial    = _initial_state(repo_url)
    final_state = dict(initial)

    async def safe_send(msg: dict) -> bool:
        """Send to ws; return False if client is gone so caller can stop."""
        try:
            await ws.send_json(msg)
            return True
        except (WebSocketDisconnect, RuntimeError):
            return False

    if not await safe_send({"agent_status": {"scanner": "running"}}):
        return

    try:
        async for chunk in graph.astream(initial, stream_mode="updates"):
            for node, update in chunk.items():
                msg: dict = {"agent_status": _STATUS_MAP.get(node, {})}

                # Relay result payloads to the frontend as they arrive
                for key in (
                    "architecture_diagram",
                    "api_docs",
                    "security_findings",
                    "chroma_collection_name",
                ):
                    if key in update:
                        msg[key]           = update[key]
                        final_state[key]   = update[key]

                if "repo_name" in update:
                    final_state["repo_name"] = update["repo_name"]

                # Surface agent errors to the frontend without crashing the stream
                for ev in update.get("events", []):
                    if ev.get("status") == "error":
                        msg["agent_error"] = ev
                        logger.warning("Agent error surfaced: %s", ev)

                if not await safe_send(msg):
                    logger.info("Client disconnected mid-analysis  session=%s", session_id)
                    return

    except WebSocketDisconnect:
        logger.info("Client disconnected mid-analysis  session=%s", session_id)
        return
    except Exception as exc:
        logger.error("Analysis pipeline error  session=%s: %s", session_id, exc)
        await safe_send({"error": str(exc)})
        try:
            await ws.close()
        except RuntimeError:
            pass
        return

    sessions[session_id] = {
        "repo_name":              final_state["repo_name"],
        "chroma_collection_name": final_state["chroma_collection_name"],
        "security_findings":      final_state["security_findings"],
        "chat_history":           [],
    }

    await safe_send({"done": True, "session_id": session_id})
    logger.info("Analysis complete  session=%s  repo=%s", session_id, final_state["repo_name"])


# ── Chat endpoint ──────────────────────────────────────────────────────────────

@app.post("/chat")
async def chat_endpoint(req: ChatRequest):
    session = sessions.get(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found. Run /ws/analyze first.")

    if not session.get("chroma_collection_name"):
        raise HTTPException(status_code=409, detail="Knowledge base not ready — RAG setup may have failed.")

    try:
        answer = run_chat_agent(
            question=req.question,
            collection_name=session["chroma_collection_name"],
            chat_history=session["chat_history"],
            repo_name=session["repo_name"],
        )
    except Exception as exc:
        logger.exception("Chat agent failed")
        raise HTTPException(status_code=502, detail=f"Chat agent failed: {exc}") from exc

    session["chat_history"].extend([
        {"role": "user",      "content": req.question},
        {"role": "assistant", "content": answer},
    ])

    return {"answer": answer}


# ── Crisis WebSocket (Section 9 stretch) ──────────────────────────────────────

@app.websocket("/ws/crisis")
async def ws_crisis(ws: WebSocket):
    """
    Frontend opens this with {session_id, finding_id}. Engineering briefs first,
    then router rotates CEO/Legal/Engineering. A separate asyncio task runs the
    Reporter on a 45s timer reading public_signals.

    End conditions: reporter publishes (lost) | crisis_resolved (won) | 10 turns.
    """
    await ws.accept()

    try:
        payload = await ws.receive_json()
    except Exception:
        await ws.close(code=1003)
        return

    session_id = payload.get("session_id")
    finding_id = payload.get("finding_id")
    session    = sessions.get(session_id)

    if not session:
        await ws.send_json({"error": "Session not found. Run /ws/analyze first."})
        await ws.close()
        return

    findings = session.get("security_findings", [])
    if not findings:
        await ws.send_json({"error": "No security findings to dramatise."})
        await ws.close()
        return

    # Pick the active finding; fall back to first if none specified
    active = next(
        (f for f in findings if f.get("id") == finding_id),
        findings[0],
    )

    initial = {
        **_initial_state(""),
        "security_findings":   findings,
        "selected_finding_id": active.get("id"),
        "crisis_messages":     [],
        "crisis_turn":         0,
        # Seed reporter with the exploit story so it always has a signal — without
        # this, the leak heuristic in _base.py only fires ~70% of runs and the UI
        # silently falls back to "Crisis contained" at the 10-turn cap.
        "public_signals":      [active.get("exploit_story", "")] if active.get("exploit_story") else [],
        "reporter_published":  False,
        "crisis_resolved":     False,
    }

    logger.info("Crisis started session=%s finding=%s", session_id, finding_id)

    # Shared state ref the reporter loop reads concurrently
    state_ref: dict = dict(initial)

    async def ws_send(msg: dict):
        try:
            await ws.send_json(msg)
        except Exception:
            pass

    reporter_task = asyncio.create_task(reporter_loop(state_ref, ws_send))

    try:
        async for chunk in crisis_graph.astream(initial, stream_mode="updates"):
            for node, update in chunk.items():
                # Persist into shared state for reporter
                for k in ("crisis_messages", "crisis_turn", "public_signals"):
                    if k in update:
                        if isinstance(update[k], list):
                            state_ref.setdefault(k, [])
                            state_ref[k] = state_ref[k] + update[k]
                        else:
                            state_ref[k] = update[k]

                # Stream each new agent message to frontend
                for msg in update.get("crisis_messages", []):
                    await ws_send({
                        "agent":     msg.get("agent"),
                        "kind":      "message",
                        "content":   msg.get("content"),
                        "turn":      msg.get("turn"),
                        "timestamp": __import__("time").time(),
                    })

                if state_ref.get("reporter_published"):
                    break
            if state_ref.get("reporter_published"):
                break

        if not state_ref.get("reporter_published"):
            state_ref["crisis_resolved"] = True
            await ws_send({"kind": "resolved", "content": "Crisis contained — Legal-approved statement issued."})

    except WebSocketDisconnect:
        logger.info("Crisis client disconnected session=%s", session_id)
    except Exception as exc:
        logger.error("Crisis pipeline error: %s", exc)
        await ws_send({"error": str(exc)})
    finally:
        reporter_task.cancel()
        try:
            await reporter_task
        except (asyncio.CancelledError, Exception):
            pass
        await ws_send({"kind": "end"})
        await ws.close()


# ── Health check ───────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "running", "sessions_active": len(sessions)}
