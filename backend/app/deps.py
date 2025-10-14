"""Dependency injection helpers for FastAPI routes."""

from collections.abc import Generator

from .config import get_settings
from .services.knowledge_base import KnowledgeBaseManager


def get_knowledge_base_manager() -> Generator[KnowledgeBaseManager, None, None]:
    """Yield a shared knowledge base manager instance."""

    settings = get_settings()
    manager = KnowledgeBaseManager(settings.storage_dir, settings.prebuilt_dir)
    try:
        yield manager
    finally:
        manager.close()
