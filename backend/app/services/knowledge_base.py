"""Knowledge base management services for Flowport."""

from __future__ import annotations

import json
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import joblib
import numpy as np
from fastapi import UploadFile
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from ..models.knowledge_base import (
    KnowledgeBaseAutoBuildRequest,
    KnowledgeBaseCreateRequest,
    KnowledgeBaseDetail,
    KnowledgeBaseQueryResponse,
    KnowledgeBaseSource,
    KnowledgeBaseSummary,
    KnowledgeChunkMatch,
    KnowledgeDocument,
    KnowledgeDocumentDetail,
    KnowledgeDocumentChunk,
    TextIngestRequest,
)
from ..utils.text import chunk_text, normalize_text, truncate
from .huggingface import HuggingFaceClient


class KnowledgeBaseManager:
    """Manage knowledge bases stored on disk."""

    def __init__(self, storage_dir: Path, prebuilt_dir: Path) -> None:
        app_dir = Path(__file__).resolve().parents[1]
        backend_root = app_dir.parent

        self.storage_dir = storage_dir if storage_dir.is_absolute() else backend_root / storage_dir
        self.prebuilt_dir = prebuilt_dir if prebuilt_dir.is_absolute() else backend_root / prebuilt_dir

        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.prebuilt_dir.mkdir(parents=True, exist_ok=True)

        self._locks: dict[str, threading.Lock] = {}

        self._bootstrap_prebuilt_knowledge_bases()

    # ------------------------------------------------------------------
    # public API

    def close(self) -> None:  # pragma: no cover - hook for future resources
        """Close resources held by the manager."""

    # ------------------------------------------------------------------

    def list_knowledge_bases(self) -> list[KnowledgeBaseSummary]:
        return [self._hydrate_summary(kb_id) for kb_id in self._iter_kb_dirs()]

    def get_knowledge_base(self, kb_id: str) -> KnowledgeBaseDetail:
        metadata = self._load_metadata(kb_id)
        documents = [self._document_from_metadata_entry(entry) for entry in metadata.get("documents", [])]
        return KnowledgeBaseDetail(
            id=metadata["id"],
            name=metadata["name"],
            description=metadata.get("description"),
            source=KnowledgeBaseSource(metadata.get("source", KnowledgeBaseSource.USER.value)),
            document_count=len(documents),
            chunk_count=metadata.get("chunk_count", 0),
            created_at=self._parse_datetime(metadata["created_at"]),
            updated_at=self._parse_datetime(metadata["updated_at"]),
            ready=metadata.get("ready", False),
            documents=documents,
        )

    def get_document(self, kb_id: str, doc_id: str) -> KnowledgeDocumentDetail:
        metadata = self._load_metadata(kb_id)
        document_entry = None
        for entry in metadata.get("documents", []):
            if entry.get("id") == doc_id:
                document_entry = entry
                break
        if not document_entry:
            raise FileNotFoundError(f"Document '{doc_id}' not found in knowledge base '{kb_id}'")

        base_document = self._document_from_metadata_entry(document_entry)
        chunk_ids = document_entry.get("chunk_ids", [])
        chunks: list[KnowledgeDocumentChunk] = []
        for chunk_id in chunk_ids:
            try:
                content = self._read_chunk(kb_id, chunk_id)
            except FileNotFoundError:
                continue
            chunks.append(KnowledgeDocumentChunk(id=chunk_id, content=content))

        return KnowledgeDocumentDetail(**base_document.model_dump(), chunks=chunks)

    def create_knowledge_base(
        self,
        payload: KnowledgeBaseCreateRequest,
        *,
        kb_id: str | None = None,
        source: KnowledgeBaseSource = KnowledgeBaseSource.USER,
    ) -> KnowledgeBaseDetail:
        kb_id = kb_id or str(uuid.uuid4())
        kb_dir = self.storage_dir / kb_id
        if kb_dir.exists():
            raise ValueError(f"Knowledge base '{kb_id}' already exists")
        kb_dir.mkdir(parents=True, exist_ok=False)
        (kb_dir / "chunks").mkdir(exist_ok=True)
        (kb_dir / "files").mkdir(exist_ok=True)

        now = datetime.now(timezone.utc)
        metadata = {
            "id": kb_id,
            "name": payload.name,
            "description": payload.description,
            "source": source.value,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
            "documents": [],
            "chunk_count": 0,
            "ready": False,
        }
        self._write_metadata(kb_id, metadata)
        return self.get_knowledge_base(kb_id)

    async def ingest_text(self, kb_id: str, payload: TextIngestRequest) -> KnowledgeDocument:
        chunks = chunk_text(payload.content, payload.chunk_size, payload.chunk_overlap)
        if not chunks:
            raise ValueError("Unable to chunk empty content")
        return self._persist_document(
            kb_id,
            title=payload.title,
            original_filename=None,
            media_type="text/plain",
            raw_bytes=payload.content.encode("utf-8"),
            chunks=chunks,
            metadata={},
        )

    async def ingest_file(
        self,
        kb_id: str,
        upload: UploadFile,
        *,
        chunk_size: int = 750,
        chunk_overlap: int = 50,
        extracted_text: str | None = None,
        hf_api_key: str | None = None,
    ) -> KnowledgeDocument:
        data = await upload.read()
        if not data:
            raise ValueError("Uploaded file is empty")

        media_type = upload.content_type or "application/octet-stream"
        title = Path(upload.filename or "document").stem or "Document"

        filename = upload.filename or "document"
        text = extracted_text if extracted_text is not None else self._extract_text_from_file(
            filename,
            media_type,
            data,
        )
        caption_text: str | None = None
        if hf_api_key and self._is_image_file(filename):
            caption = await self._generate_image_caption(hf_api_key, data)
            if caption:
                caption_text = caption
                text = f"{caption}\n\n[Image: {filename}]"
        chunks = chunk_text(text, chunk_size, chunk_overlap) or [f"Summary for {filename}: {truncate(text, 200)}"]

        return self._persist_document(
            kb_id,
            title=title,
            original_filename=upload.filename,
            media_type=media_type,
            raw_bytes=data,
            chunks=chunks,
            metadata={
                "generated_from_upload": True,
                "image_caption": caption_text,
            },
        )

    async def auto_build(self, payload: KnowledgeBaseAutoBuildRequest) -> KnowledgeBaseDetail:
        if not payload.knowledge_items:
            raise ValueError("Provide at least one knowledge item to auto-build a knowledge base")
        kb = self.create_knowledge_base(
            KnowledgeBaseCreateRequest(name=payload.name, description=payload.description),
            source=KnowledgeBaseSource.USER,
        )
        for item in payload.knowledge_items:
            await self.ingest_text(
                kb.id,
                TextIngestRequest(
                    title=item.title,
                    content=item.content,
                    chunk_size=payload.chunk_size,
                    chunk_overlap=payload.chunk_overlap,
                ),
            )
        return self.get_knowledge_base(kb.id)

    def query(self, kb_id: str, query: str, top_k: int) -> KnowledgeBaseQueryResponse:
        metadata = self._load_metadata(kb_id)
        if not metadata.get("ready"):
            raise ValueError("Knowledge base index is not ready yet")

        index_path = self._index_path(kb_id)
        if not index_path.exists():
            raise FileNotFoundError("Knowledge base index missing; please rebuild")

        index_data = joblib.load(index_path)
        vectorizer: TfidfVectorizer = index_data["vectorizer"]
        matrix = index_data["matrix"]
        chunk_ids: list[str] = index_data["chunk_ids"]

        query_vec = vectorizer.transform([query])
        scores = cosine_similarity(query_vec, matrix).flatten()
        if np.count_nonzero(scores) == 0:
            return KnowledgeBaseQueryResponse(knowledge_base_id=kb_id, query=query, matches=[])

        top_indices = scores.argsort()[::-1][:top_k]
        matches: list[KnowledgeChunkMatch] = []
        for idx in top_indices:
            chunk_id = chunk_ids[int(idx)]
            chunk_content = self._read_chunk(kb_id, chunk_id)
            doc = self._find_document_by_chunk(metadata, chunk_id)
            matches.append(
                KnowledgeChunkMatch(
                    chunk_id=chunk_id,
                    score=float(scores[int(idx)]),
                    content=chunk_content,
                    document_id=doc.get("id") if doc else "",
                    document_title=doc.get("title") if doc else None,
                )
            )

        return KnowledgeBaseQueryResponse(knowledge_base_id=kb_id, query=query, matches=matches)

    # ------------------------------------------------------------------
    # internal helpers

    def _persist_document(
        self,
        kb_id: str,
        *,
        title: str,
        original_filename: str | None,
        media_type: str,
        raw_bytes: bytes,
        chunks: Iterable[str],
        metadata: dict[str, Any],
    ) -> KnowledgeDocument:
        doc_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)

        chunk_ids: list[str] = []
        chunks_dir = self._chunks_dir(kb_id)
        chunks_dir.mkdir(exist_ok=True)

        for chunk in chunks:
            normalized = normalize_text(chunk)
            if not normalized:
                continue
            chunk_id = str(uuid.uuid4())
            chunk_ids.append(chunk_id)
            (chunks_dir / f"{chunk_id}.txt").write_text(normalized, encoding="utf-8")

        if not chunk_ids:
            raise ValueError("No textual content was extracted from the provided data")

        files_dir = self._files_dir(kb_id)
        files_dir.mkdir(exist_ok=True)
        if original_filename:
            safe_name = f"{doc_id}_{Path(original_filename).name}"
            (files_dir / safe_name).write_bytes(raw_bytes)

        metadata_entry = {
            "id": doc_id,
            "title": title,
            "original_filename": original_filename,
            "media_type": media_type,
            "size_bytes": len(raw_bytes),
            "chunk_ids": chunk_ids,
            "chunk_count": len(chunk_ids),
            "created_at": now.isoformat(),
            "metadata": metadata,
        }

        self._update_metadata(kb_id, metadata_entry)
        self._build_index(kb_id)

        return self._document_from_metadata_entry(metadata_entry)

    def _build_index(self, kb_id: str) -> None:
        metadata = self._load_metadata(kb_id)
        chunks_dir = self._chunks_dir(kb_id)
        chunk_files = sorted(chunks_dir.glob("*.txt"))
        if not chunk_files:
            metadata["ready"] = False
            self._write_metadata(kb_id, metadata)
            return

        chunk_texts: list[str] = []
        chunk_ids: list[str] = []
        for file_path in chunk_files:
            content = file_path.read_text(encoding="utf-8")
            chunk_texts.append(content)
            chunk_ids.append(file_path.stem)

        vectorizer = TfidfVectorizer(max_features=4096, stop_words="english")
        matrix = vectorizer.fit_transform(chunk_texts)
        joblib.dump({"vectorizer": vectorizer, "matrix": matrix, "chunk_ids": chunk_ids}, self._index_path(kb_id))

        metadata["chunk_count"] = len(chunk_ids)
        metadata["ready"] = True
        metadata["updated_at"] = datetime.now(timezone.utc).isoformat()
        self._write_metadata(kb_id, metadata)

    async def _generate_image_caption(self, api_key: str, data: bytes) -> str | None:
        try:
            client = HuggingFaceClient(api_key, timeout=90.0)
            result = await client.image_caption(data)
        except Exception:  # pragma: no cover - network errors vary
            return None
        if isinstance(result, list) and result:
            candidate = result[0]
            if isinstance(candidate, dict):
                caption = candidate.get("generated_text") or candidate.get("caption")
                if isinstance(caption, str) and caption.strip():
                    return caption.strip()
        if isinstance(result, dict):
            caption = result.get("generated_text") or result.get("caption")
            if isinstance(caption, str) and caption.strip():
                return caption.strip()
        return None

    def _update_metadata(self, kb_id: str, document_entry: dict[str, Any]) -> None:
        lock = self._get_lock(kb_id)
        with lock:
            metadata = self._load_metadata(kb_id)
            documents: list[dict[str, Any]] = metadata.setdefault("documents", [])
            documents.append(document_entry)
            metadata["document_count"] = len(documents)
            metadata["chunk_count"] = metadata.get("chunk_count", 0) + document_entry.get("chunk_count", 0)
            metadata["updated_at"] = datetime.now(timezone.utc).isoformat()
            metadata["ready"] = False
            self._write_metadata(kb_id, metadata)

    def _load_metadata(self, kb_id: str) -> dict[str, Any]:
        metadata_path = self._metadata_path(kb_id)
        if not metadata_path.exists():
            raise FileNotFoundError(f"Knowledge base '{kb_id}' not found")
        return json.loads(metadata_path.read_text(encoding="utf-8"))

    def _write_metadata(self, kb_id: str, metadata: dict[str, Any]) -> None:
        metadata_path = self._metadata_path(kb_id)
        metadata_path.parent.mkdir(parents=True, exist_ok=True)
        metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    def _document_from_metadata_entry(self, entry: dict[str, Any]) -> KnowledgeDocument:
        return KnowledgeDocument(
            id=entry["id"],
            title=entry.get("title", entry["id"]),
            original_filename=entry.get("original_filename"),
            media_type=entry.get("media_type", "text/plain"),
            size_bytes=int(entry.get("size_bytes", 0)),
            chunk_count=int(entry.get("chunk_count", 0)),
            created_at=self._parse_datetime(entry.get("created_at")),
            metadata=entry.get("metadata", {}),
        )

    def _hydrate_summary(self, kb_id: str) -> KnowledgeBaseSummary:
        metadata = self._load_metadata(kb_id)
        return KnowledgeBaseSummary(
            id=metadata["id"],
            name=metadata.get("name", metadata["id"]),
            description=metadata.get("description"),
            source=KnowledgeBaseSource(metadata.get("source", KnowledgeBaseSource.USER.value)),
            document_count=len(metadata.get("documents", [])),
            chunk_count=metadata.get("chunk_count", 0),
            created_at=self._parse_datetime(metadata.get("created_at")),
            updated_at=self._parse_datetime(metadata.get("updated_at")),
            ready=metadata.get("ready", False),
        )

    def _iter_kb_dirs(self) -> list[str]:
        return sorted(p.name for p in self.storage_dir.iterdir() if p.is_dir() and (p / "metadata.json").exists())

    def _metadata_path(self, kb_id: str) -> Path:
        return self.storage_dir / kb_id / "metadata.json"

    def _index_path(self, kb_id: str) -> Path:
        return self.storage_dir / kb_id / "index.joblib"

    def _chunks_dir(self, kb_id: str) -> Path:
        return self.storage_dir / kb_id / "chunks"

    def _files_dir(self, kb_id: str) -> Path:
        return self.storage_dir / kb_id / "files"

    def _parse_datetime(self, value: str | None) -> datetime:
        if not value:
            return datetime.now(timezone.utc)
        return datetime.fromisoformat(value)

    def _read_chunk(self, kb_id: str, chunk_id: str) -> str:
        path = self._chunks_dir(kb_id) / f"{chunk_id}.txt"
        return path.read_text(encoding="utf-8")

    def _find_document_by_chunk(self, metadata: dict[str, Any], chunk_id: str) -> dict[str, Any]:
        for doc in metadata.get("documents", []):
            if chunk_id in doc.get("chunk_ids", []):
                return doc
        return {}

    def _get_lock(self, kb_id: str) -> threading.Lock:
        if kb_id not in self._locks:
            self._locks[kb_id] = threading.Lock()
        return self._locks[kb_id]

    def _bootstrap_prebuilt_knowledge_bases(self) -> None:
        for json_path in sorted(self.prebuilt_dir.glob("*.json")):
            data = json.loads(json_path.read_text(encoding="utf-8"))
            kb_id = data.get("id") or json_path.stem
            kb_dir = self.storage_dir / kb_id
            if kb_dir.exists():
                continue
            request = KnowledgeBaseCreateRequest(
                name=data.get("name", kb_id.replace("-", " ").title()),
                description=data.get("description"),
            )
            kb = self.create_knowledge_base(request, kb_id=kb_id, source=KnowledgeBaseSource.PREBUILT)
            for item in data.get("knowledge_items", []):
                content = item.get("content", "")
                title = item.get("title", "Entry")
                if not content:
                    continue
                chunks = chunk_text(content, item.get("chunk_size", 750), item.get("chunk_overlap", 50))
                self._persist_document(
                    kb.id,
                    title=title,
                    original_filename=None,
                    media_type="text/plain",
                    raw_bytes=content.encode("utf-8"),
                    chunks=chunks,
                    metadata={"prebuilt": True, "source_file": json_path.name},
                )
            self._build_index(kb.id)

    def _extract_text_from_file(self, filename: str, media_type: str, data: bytes) -> str:
        import io

        suffix = Path(filename or "").suffix.lower()
        if suffix in {".txt", ".md", ".json", ".log"}:
            return data.decode("utf-8", errors="ignore")
        if suffix in {".csv"}:
            try:
                import pandas as pd

                df = pd.read_csv(io.BytesIO(data))
                return df.to_markdown(index=False)
            except Exception as exc:  # pragma: no cover - dependent on pandas internals
                raise ValueError(f"Unable to parse CSV file: {exc}") from exc
        if suffix in {".pdf"}:
            try:
                from PyPDF2 import PdfReader

                reader = PdfReader(io.BytesIO(data))
                pages = [normalize_text(page.extract_text() or "") for page in reader.pages]
                return "\n".join(page for page in pages if page)
            except Exception as exc:  # pragma: no cover
                raise ValueError(f"Unable to parse PDF file: {exc}") from exc
        if suffix in {".png", ".jpg", ".jpeg"}:
            return (
                f"Image file {filename or ''} (MIME: {media_type}) - add a caption or text summary to enhance retrieval."
            )
        return data.decode("utf-8", errors="ignore")
