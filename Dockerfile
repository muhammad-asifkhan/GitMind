# Backend Dockerfile for free-tier deployments (Hugging Face Spaces, Cloud Run,
# Fly.io). Frontend should be deployed separately on Vercel — see README.
#
# Build: docker build -t gitmind-backend .
# Run:   docker run -p 8001:8001 -e OPENAI_API_KEY=sk-... gitmind-backend

FROM python:3.12-slim

# semgrep needs git, build-essential is required for some chromadb deps
RUN apt-get update && apt-get install -y --no-install-recommends \
        git \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY backend/ ./

# Persistent ChromaDB store — mount a volume here for cross-restart durability.
ENV CHROMA_DIR=/app/chroma_db
RUN mkdir -p /app/chroma_db

# Most platforms inject $PORT (Cloud Run, HF Spaces, Render, Fly).
ENV PORT=8001
EXPOSE 8001

# CORS_ORIGINS is the comma-separated list of frontend origins allowed to call
# this backend in addition to localhost. Set this to your Vercel URL on deploy.
# Example:  CORS_ORIGINS=https://gitmind.vercel.app

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8001}"]
