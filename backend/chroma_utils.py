import logging
import os
import threading
from pathlib import Path

import chromadb
from langchain_text_splitters import RecursiveCharacterTextSplitter

logger = logging.getLogger(__name__)

# Persist embeddings to disk so collections survive uvicorn --reload restarts.
# Without this, every backend reload silently wipes the user's RAG state and
# subsequent /chat calls return "I don't see that" for everything because the
# query hits a collection with zero documents.
_PERSIST_DIR = Path(os.getenv("CHROMA_DIR", Path(__file__).parent / "chroma_db"))
_PERSIST_DIR.mkdir(parents=True, exist_ok=True)

_client = chromadb.PersistentClient(path=str(_PERSIST_DIR))
_collections: dict[str, chromadb.Collection] = {}
_lock = threading.Lock()   # guards _collections under concurrent WebSocket sessions


def embed_codebase(file_contents: dict[str, str], collection_name: str) -> str:
    # Hold the lock across the whole embed so two concurrent /ws/analyze sessions
    # for the same repo can't both try to add() the same IDs (which raises
    # IDAlreadyExistsError on newer ChromaDB versions).
    with _lock:
        if collection_name in _collections:
            logger.debug("Collection '%s' already embedded — skipping", collection_name)
            return collection_name

        collection = _client.create_collection(name=collection_name, get_or_create=True)

        splitter = RecursiveCharacterTextSplitter(
            chunk_size=800,
            chunk_overlap=80,
            separators=["\nclass ", "\ndef ", "\n\n", "\n", " "],
        )

        docs: list[str] = []
        metas: list[dict] = []
        ids: list[str] = []

        for fp, content in file_contents.items():
            for i, chunk in enumerate(splitter.split_text(content)):
                docs.append(chunk)
                metas.append({"filepath": fp, "chunk_index": i})
                ids.append(f"{fp}::{i}")

        # ChromaDB add() has a soft limit of ~100 items per batch
        for i in range(0, len(docs), 100):
            collection.add(
                documents=docs[i : i + 100],
                metadatas=metas[i : i + 100],
                ids=ids[i : i + 100],
            )

        _collections[collection_name] = collection

    logger.info("Embedded %d chunks into collection '%s'", len(docs), collection_name)
    return collection_name


def search_codebase(collection_name: str, query: str, n_results: int = 5) -> list[dict]:
    with _lock:
        collection = _collections.get(collection_name)

    if collection is None:
        try:
            collection = _client.get_collection(collection_name)
        except Exception as exc:
            logger.warning("Collection '%s' not found on disk: %s", collection_name, exc)
            return []
        with _lock:
            _collections[collection_name] = collection

    if collection.count() == 0:
        logger.warning("Collection '%s' exists but is empty", collection_name)
        return []

    result = collection.query(query_texts=[query], n_results=n_results)
    docs  = (result.get("documents")  or [[]])[0]
    metas = (result.get("metadatas") or [[]])[0]
    return [
        {"filepath": m.get("filepath", "unknown"), "content": d}
        for d, m in zip(docs, metas)
    ]
