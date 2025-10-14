# Flowport Backend

The Flowport backend provides a FastAPI-powered service that connects Flowtomic applications to any Hugging Face model while offering simple knowledge base management for retrieval augmented generation (RAG).

## Features

- Hugging Face inference proxy that accepts a user-supplied API key and model name.
- File and text ingestion for building knowledge bases (TXT, CSV, PDF, and common image formats).
- Automatic knowledge base creation from structured knowledge items.
- Optional image captioning via Hugging Face for richer RAG context.
- Prebuilt starter knowledge packs shipped with the repository.
- TF-IDF powered retrieval to surface the most relevant content at inference time.

## Getting Started

1. Create a virtual environment and install dependencies:

   ```bash
   cd flowport/backend
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. Launch the development server:

   ```bash
   uvicorn app.main:app --reload
   ```

3. The API will be available at <http://localhost:8000>. Interactive Swagger documentation lives at <http://localhost:8000/docs>.

## Running Tests

```bash
pytest
```

## Environment Variables

You can override defaults using environment variables (prefixed with `FLOWPORT_`). Create a `.env` file in `flowport/backend` if you need to customize paths.

| Variable | Description | Default |
| --- | --- | --- |
| `FLOWPORT_STORAGE_DIR` | Directory beneath which knowledge bases are stored | `data/knowledge_bases` |
| `FLOWPORT_PREBUILT_DIR` | Directory containing packaged knowledge base JSON files | `app/data/prebuilt` |
| `FLOWPORT_DEFAULT_TOP_K` | Default number of knowledge chunks to retrieve | `4` |
