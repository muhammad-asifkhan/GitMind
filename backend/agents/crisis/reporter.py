import asyncio
import logging
import os
import time

from langchain_openai import ChatOpenAI

logger = logging.getLogger(__name__)

INTERVAL_SEC = int(os.getenv("REPORTER_INTERVAL_SEC", "45"))
_MODEL = "gpt-4o-mini"

REPORTER_PROMPT = """You are a senior reporter at a major tech publication. A source has tipped you
off about a possible security incident at a company. You have partial information.

Draft a 3-sentence breaking-news story using only the signals provided. Use
cautious language ('appears to', 'sources say') where facts are uncertain. Do
not invent specifics. Make it feel real — quote a hypothetical security expert
if useful.

End with: "We have reached out to [Company] for comment.\""""


_MIN_TURNS_BEFORE_PUBLISH = 3   # Give team at least 3 agent turns to respond


async def reporter_loop(state_ref: dict, ws_send) -> None:
    """
    Section 9.3 reporter loop. Runs in parallel with the crisis graph.

    Behavior: Reporter SLEEPS first (giving the team a grace window to talk),
    then checks for leaked signals. Even with signals, the Reporter waits for
    at least _MIN_TURNS_BEFORE_PUBLISH agent turns so the user sees real
    crisis-room dialogue before the breaking-news story drops. Without this,
    seeded signals would cause the Reporter to publish on tick 0 — before any
    agent has spoken.
    """
    while not state_ref.get("crisis_resolved") and not state_ref.get("reporter_published"):
        # Sleep FIRST — gives team a grace window to talk and possibly resolve
        await asyncio.sleep(INTERVAL_SEC)

        if state_ref.get("crisis_resolved") or state_ref.get("reporter_published"):
            return

        signals = state_ref.get("public_signals", [])
        turn    = state_ref.get("crisis_turn", 0)

        if not signals or turn < _MIN_TURNS_BEFORE_PUBLISH:
            await ws_send({
                "agent": "Reporter",
                "kind":  "tick",
                "content": (
                    f"Watching for {INTERVAL_SEC}s more. "
                    f"({len(signals)} tip(s), team has spoken {turn} time(s))"
                ),
                "ts": time.time(),
            })
            continue

        signals_text = "\n".join(f"- {s}" for s in signals[-5:])
        prompt = f"{REPORTER_PROMPT}\n\nSIGNALS:\n{signals_text}"

        try:
            llm = ChatOpenAI(model=_MODEL, temperature=0.5, timeout=30.0)
            response = await llm.ainvoke(prompt)
            story = response.content
        except Exception as exc:
            logger.error("reporter LLM failed: %s", exc)
            return

        await ws_send({
            "agent":     "Reporter",
            "kind":      "leak",
            "content":   story,
            "timestamp": time.time(),
        })
        state_ref["reporter_published"] = True
        logger.info("reporter published — crisis lost (turn=%d)", turn)
        return
