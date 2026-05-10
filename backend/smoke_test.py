#!/usr/bin/env python3
"""
Pre-demo environment validator.
Run this from the backend/ directory before every demo session:

    python smoke_test.py

All checks must pass. Fix any failure before going on stage.
"""
import os
import shutil
import sys
import tempfile

# Force UTF-8 stdout on Windows so the box-drawing banner doesn't crash with
# UnicodeEncodeError under the default cp1252 console encoding.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from dotenv import load_dotenv

load_dotenv()

# CI mode: skip checks that need a real OpenAI key or live network. Set via
#   python smoke_test.py --ci   OR   SMOKE_CI=1
_CI = "--ci" in sys.argv or os.getenv("SMOKE_CI") == "1"

_PASS  = "[PASS]"
_FAIL  = "[FAIL]"
_errors: list[str] = []


def check(label: str, ok: bool, hint: str = "") -> None:
    if ok:
        print(f"  {_PASS}  {label}")
    else:
        detail = f"  →  {hint}" if hint else ""
        print(f"  {_FAIL}  {label}{detail}")
        _errors.append(label)


print("\n══════════════════════════════════════════")
print("   GitMind — Pre-Demo Smoke Test")
print("══════════════════════════════════════════\n")

# ── 1. Environment ─────────────────────────────────────────────────────────────
print("[ Environment ]")

api_key = os.getenv("OPENAI_API_KEY", "")
if _CI:
    print(f"  [SKIP]  OPENAI_API_KEY is set (CI mode)")
    print(f"  [SKIP]  OPENAI_API_KEY format (CI mode)")
else:
    check("OPENAI_API_KEY is set",         bool(api_key),               "Add to backend/.env")
    check("OPENAI_API_KEY format (sk-...)", api_key.startswith("sk-"),  f"Got prefix: {api_key[:6]!r}")
check("semgrep in PATH",               shutil.which("semgrep") is not None, "pip install semgrep")

# ── 2. ChromaDB ────────────────────────────────────────────────────────────────
print("\n[ ChromaDB ]")
try:
    import chromadb
    client = chromadb.Client()
    col    = client.create_collection("smoketest", get_or_create=True)
    col.add(documents=["hello world"], ids=["t1"])
    result = col.query(query_texts=["hello"], n_results=1)
    check("ChromaDB in-memory create + query", "hello world" in result["documents"][0])
    client.delete_collection("smoketest")
except Exception as exc:
    check("ChromaDB in-memory create + query", False, str(exc))

# ── 3. LLM cache ───────────────────────────────────────────────────────────────
print("\n[ LLM Cache ]")
try:
    from llm_cache import get_cached, set_cached
    set_cached("_smoke", "ping", "pong")
    check("diskcache write + read", get_cached("_smoke", "ping") == "pong")
except Exception as exc:
    check("diskcache write + read", False, str(exc))

# ── 4. tiktoken ────────────────────────────────────────────────────────────────
print("\n[ tiktoken ]")
try:
    import tiktoken
    enc    = tiktoken.encoding_for_model("gpt-4o-mini")
    tokens = enc.encode("Hello, world!")
    check("tiktoken encodes gpt-4o-mini", len(tokens) > 0)
except Exception as exc:
    check("tiktoken encodes gpt-4o-mini", False, str(exc))

# ── 5. OpenAI API reachability ─────────────────────────────────────────────────
print("\n[ OpenAI API ]")
if _CI:
    print(f"  [SKIP]  OpenAI API reachable (CI mode — no live network call)")
elif api_key:
    try:
        from langchain_openai import ChatOpenAI
        llm  = ChatOpenAI(model="gpt-4o-mini", temperature=0, max_tokens=5)
        resp = llm.invoke("Reply with the single word: OK")
        check("OpenAI API reachable", len(resp.content) > 0, resp.content)
    except Exception as exc:
        check("OpenAI API reachable", False, str(exc))
else:
    check("OpenAI API reachable", False, "Skipped — OPENAI_API_KEY not set")

# ── 6. GitPython clone ─────────────────────────────────────────────────────────
print("\n[ GitPython ]")
if _CI:
    print(f"  [SKIP]  GitPython shallow clone (CI mode — no live network call)")
else:
    try:
        import git
        dest = tempfile.mkdtemp(prefix="gitmind_smoke_")
        repo = git.Repo.clone_from(
            "https://github.com/octocat/Hello-World", dest, depth=1
        )
        repo.close()
        shutil.rmtree(dest, ignore_errors=True)
        check("GitPython shallow clone (octocat/Hello-World)", True)
    except Exception as exc:
        check("GitPython shallow clone", False, str(exc))

# ── 7. LangGraph graph compiles ────────────────────────────────────────────────
print("\n[ LangGraph ]")
try:
    from orchestrator import graph
    check("LangGraph analysis graph compiles", graph is not None)
except Exception as exc:
    check("LangGraph analysis graph compiles", False, str(exc))

# ── Summary ────────────────────────────────────────────────────────────────────
print("\n══════════════════════════════════════════")
if not _errors:
    print("  ALL CHECKS PASSED — ready for demo.\n")
    sys.exit(0)
else:
    print(f"  {len(_errors)} CHECK(S) FAILED:\n")
    for e in _errors:
        print(f"    ✗  {e}")
    print("\n  Fix all failures before going on stage.\n")
    sys.exit(1)
