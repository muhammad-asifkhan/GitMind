import hashlib
import logging
from pathlib import Path

import diskcache

logger = logging.getLogger(__name__)

# Absolute path relative to this file — safe regardless of where uvicorn is launched from
_CACHE_DIR = Path(__file__).parent / ".llm_cache"
_cache = diskcache.Cache(str(_CACHE_DIR))   # diskcache.Cache is thread-safe


def get_cached(model: str, prompt: str) -> str | None:
    value = _cache.get(_key(model, prompt))
    if value is not None:
        logger.debug("LLM cache hit  model=%s", model)
    return value


def set_cached(model: str, prompt: str, response: str, ttl: int = 86_400) -> None:
    _cache.set(_key(model, prompt), response, expire=ttl)


def _key(model: str, prompt: str) -> str:
    return hashlib.sha256(f"{model}::{prompt}".encode()).hexdigest()
