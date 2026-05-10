import time
import logging

from langchain_openai import ChatOpenAI

from chroma_utils import search_codebase

logger = logging.getLogger(__name__)

_MODEL = "gpt-4o-mini"
_LLM_TIMEOUT = 30.0   # seconds — keeps a stuck call from blocking the reporter loop
_CODE_CHUNKS = 4
_MAX_CODE_CHARS = 600   # per chunk — keep prompt small

_LEAK_TRIGGER_WORDS = ["breach", "leaked", "exposed", "customers affected", "data exposed"]


def _fetch_code_context(state: dict, finding: dict) -> str:
    """
    Pull the actual offending file's code from the RAG collection so the agent
    can cite real symbols, line numbers, and patterns instead of inventing
    structure from the finding title alone. Returns '' if anything goes wrong
    or there's no collection (e.g. crisis triggered from a synthetic finding).
    """
    collection = state.get("chroma_collection_name")
    file_path  = finding.get("file") or ""
    if not collection or not file_path:
        return ""

    try:
        # Two queries: one targeted at the file path, one semantic on the title.
        # Merge + dedup so we get both the right file AND topically related chunks.
        path_hits  = search_codebase(collection, file_path, n_results=_CODE_CHUNKS)
        topic_hits = search_codebase(
            collection,
            f"{finding.get('title', '')} {file_path}",
            n_results=_CODE_CHUNKS,
        )
    except Exception as exc:
        logger.warning("crisis: code-context lookup failed for %s: %s", file_path, exc)
        return ""

    seen: set[str] = set()
    chunks: list[dict] = []
    for c in path_hits + topic_hits:
        key = f"{c['filepath']}::{c['content'][:80]}"
        if key in seen:
            continue
        seen.add(key)
        chunks.append(c)
        if len(chunks) >= _CODE_CHUNKS:
            break

    if not chunks:
        return ""

    rendered = "\n\n".join(
        f"--- {c['filepath']} ---\n{c['content'][:_MAX_CODE_CHARS]}"
        for c in chunks
    )
    return f"\n\nRELEVANT CODE FROM THE REPO (use this to ground your response — cite real symbols, do not invent):\n{rendered}"


def make_crisis_agent(
    name: str,
    system_prompt: str,
    leaks: bool = True,
    with_code_context: bool = False,
):
    """
    Factory: returns an async LangGraph node function for a crisis role-play agent.

    Async + ainvoke is required: the crisis graph runs concurrently with
    reporter_loop, and a sync .invoke() blocks the event loop for the full LLM
    round-trip (3-5 s) — long enough that the reporter never gets its 45 s tick.

    Each node consumes shared CrisisState:
      - selected_finding_id, security_findings: source of incident facts
      - crisis_messages: rolling transcript
      - crisis_turn: turn counter
      - public_signals: messages a Reporter could leak (filled when leaks=True)
      - chroma_collection_name (when with_code_context=True): RAG store to
        query for the offending file's actual source.
    """

    async def node(state: dict) -> dict:
        # Build conversation history (last 12 turns to bound prompt size)
        history_msgs = state.get("crisis_messages", [])[-12:]
        history = "\n".join(
            f"{m['agent']}: {m['content']}" for m in history_msgs
        ) or "No prior messages."

        # Find the active incident
        finding = next(
            (f for f in state.get("security_findings", [])
             if f.get("id") == state.get("selected_finding_id")),
            None,
        )
        if not finding and state.get("security_findings"):
            finding = state["security_findings"][0]
        finding = finding or {
            "title": "Unknown vulnerability",
            "severity": "high",
            "exploit_story": "Details pending engineering review.",
        }

        code_context = _fetch_code_context(state, finding) if with_code_context else ""

        prompt = (
            f"{system_prompt}\n\n"
            f"INCIDENT: {finding.get('title','')} ({finding.get('severity','')})\n"
            f"FILE: {finding.get('file','')}:{finding.get('line_start','')}\n"
            f"EXPLOIT: {finding.get('exploit_story','')}"
            f"{code_context}\n\n"
            f"CONVERSATION SO FAR:\n{history}\n\n"
            f"Respond as {name} in 2-4 sentences. Do not break character."
        )

        try:
            llm = ChatOpenAI(model=_MODEL, temperature=0.7, timeout=_LLM_TIMEOUT)
            response = await llm.ainvoke(prompt)
            text = response.content
        except Exception as exc:
            logger.error("crisis agent %s failed: %s", name, exc)
            text = f"[{name} unavailable — investigating]"

        ts = time.time()
        update: dict = {
            "crisis_messages": [{"agent": name, "content": text, "turn": state.get("crisis_turn", 0)}],
            "crisis_turn":     state.get("crisis_turn", 0) + 1,
            "events":          [{"agent": name, "kind": "message", "content": text, "ts": ts}],
        }

        # Leak heuristic — Engineering / CEO statements containing breach keywords
        # become public_signals the Reporter can pick up
        if leaks and any(k in text.lower() for k in _LEAK_TRIGGER_WORDS):
            update["public_signals"] = [text]

        logger.info("crisis agent %s spoke (turn %d)", name, state.get("crisis_turn", 0))
        return update

    return node
