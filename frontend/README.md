# Flowport Frontend

The Flowport frontend is a Vite + React application that mirrors the Flowtomic design language and surfaces key capabilities of the Flowport platform:

- Launch the Hugging Face inference gateway with optional RAG context.
- Create, upload, and auto-generate knowledge bases that Flowport can query.
- Browse lightweight documentation for the REST API.

## Development

```bash
cd flowport/frontend
npm install
npm run dev
```

The dev server listens on <http://localhost:5173> by default. Ensure the backend (FastAPI) is running at <http://localhost:8000> or set `VITE_API_BASE_URL` to match your environment.

## Build

```bash
npm run build
```

The resulting static assets live in the `dist` directory and can be deployed alongside the backend or through any static hosting provider.
