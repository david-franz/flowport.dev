# Flowport

Flowport is the Flowtomic gateway that connects any Hugging Face model to the rest of the Flowgraph, Flowform, and Flowlang ecosystem. It pairs a FastAPI backend for inference and knowledge management with a React frontend that matches the Flowtomic design system.

## Structure

- `backend/` — FastAPI service providing inference proxying and knowledge base management.
- `frontend/` — React (Vite) single-page application showcasing Flowport capabilities.

## Quick start

1. **Backend**

   ```bash
   cd flowport/backend
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   uvicorn app.main:app --reload
   ```

2. **Frontend**

   ```bash
   cd flowport/frontend
   npm install
   npm run dev
   ```

By default, the frontend expects the backend at <http://localhost:8000>. Adjust `VITE_API_BASE_URL` in a `.env` file under `flowport/frontend` if needed.

## Key capabilities

- Forward prompts to any Hugging Face model using a user-supplied API key and model name.
- Upload files (TXT, CSV, PDF, PNG, JPEG) or raw text to augment model responses with retrieval augmented generation (RAG).
- Spin up production-ready knowledge bases automatically from structured knowledge entries.
- Access prebuilt Flowtomic knowledge packs to jump-start new projects.

## Testing

```bash
cd flowport/backend
pytest
```

## Environment variables

Refer to `backend/README.md` for tunable environment variables controlling storage paths and retrieval defaults. Frontend environment variables begin with `VITE_`.
