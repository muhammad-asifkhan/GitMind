import logging

from langchain_openai import ChatOpenAI

from chroma_utils import search_codebase

logger = logging.getLogger(__name__)

_MODEL = "gpt-4o-mini"
_N_RESULTS = 8

_SYSTEM_TEMPLATE = """\
You are a senior software engineer who has read every file in the '{repo_name}' codebase.

How to answer:
- Use the retrieved code excerpts below as your primary source of truth.
- When code is shown, cite it: e.g. "In auth/middleware.py line 42, ...".
- If the excerpts only partially cover the question, answer what you can and
  call out what's unclear. Do not fabricate function names or file paths.
- If the excerpts have nothing relevant at all, say so plainly and suggest
  what the user could ask instead — don't pretend you have no information when
  partial context is available.
- Keep answers under 200 words.
- Write as if you built this system yourself.

Relevant code from the codebase:
{context}

Previous conversation:
{history}\
"""

_NO_CONTEXT_REPLY = (
    "I don't have any indexed code for this repo right now — the knowledge base "
    "is empty. This usually means the backend was restarted after analysis. "
    "Click **⚡ Analyze** again to re-embed the repo, then retry your question."
)


def run_chat_agent(
    question: str,
    collection_name: str,
    chat_history: list[dict],
    repo_name: str,
) -> str:
    chunks = search_codebase(collection_name, question, n_results=_N_RESULTS)
    if not chunks:
        logger.warning(
            "Chat agent: zero chunks retrieved for collection '%s' — returning re-analyze hint",
            collection_name,
        )
        return _NO_CONTEXT_REPLY

    context = "\n\n".join(f"--- {c['filepath']} ---\n{c['content']}" for c in chunks)
    history = (
        "\n".join(f"{m['role'].upper()}: {m['content']}" for m in chat_history[-4:])
        or "None."
    )
    system = _SYSTEM_TEMPLATE.format(
        repo_name=repo_name,
        context=context,
        history=history,
    )

    llm    = ChatOpenAI(model=_MODEL, temperature=0.2)
    answer = llm.invoke([
        {"role": "system",  "content": system},
        {"role": "user",    "content": question},
    ]).content

    logger.info(
        "Chat agent: answered question (q_len=%d, chunks=%d, ans_len=%d)",
        len(question), len(chunks), len(answer),
    )
    return answer
