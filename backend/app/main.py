"""FastAPI entrypoint for Flowport backend."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import inference, knowledge_bases


settings = get_settings()

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    """Perform application startup tasks."""

    settings.storage_dir.mkdir(parents=True, exist_ok=True)


@app.get("/api/health", tags=["meta"])
async def health_check() -> dict[str, str]:
    """Simple health check endpoint."""

    return {"status": "ok", "app": settings.app_name}


app.include_router(knowledge_bases.router, prefix="/api")
app.include_router(inference.router, prefix="/api")
