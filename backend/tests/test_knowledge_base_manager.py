"""Unit tests for the Flowport knowledge base manager."""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from app.models.knowledge_base import (
    KnowledgeBaseAutoBuildRequest,
    KnowledgeBaseCreateRequest,
    TextIngestRequest,
)
from app.services.knowledge_base import KnowledgeBaseManager


@pytest.fixture()
def manager(tmp_path: Path) -> KnowledgeBaseManager:
    storage = tmp_path / "storage"
    prebuilt = tmp_path / "prebuilt"
    storage.mkdir()
    prebuilt.mkdir()
    kb_manager = KnowledgeBaseManager(storage, prebuilt)
    yield kb_manager
    kb_manager.close()


def test_create_ingest_and_query(manager: KnowledgeBaseManager) -> None:
    created = manager.create_knowledge_base(KnowledgeBaseCreateRequest(name="Test KB", description=None))
    assert created.name == "Test KB"

    document = asyncio.run(
        manager.ingest_text(
            created.id,
            TextIngestRequest(
                title="Doc",
                content="Flowport routes requests to Hugging Face models.",
                chunk_size=200,
                chunk_overlap=20,
            ),
        )
    )
    assert document.title == "Doc"

    response = manager.query(created.id, "How does Flowport work?", top_k=3)
    assert response.matches, "Expected at least one match from the knowledge base"
    assert any("Flowport" in match.content for match in response.matches)


def test_auto_build_requires_items(manager: KnowledgeBaseManager) -> None:
    from app.models.knowledge_base import KnowledgeBaseAutoBuildRequest

    with pytest.raises(ValueError):
        asyncio.run(
            manager.auto_build(
                KnowledgeBaseAutoBuildRequest(name="Invalid", description=None, knowledge_items=[])
            )
        )