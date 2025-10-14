"""Lightweight wrapper around Hugging Face Inference API."""

from __future__ import annotations

from typing import Any

import httpx


class HuggingFaceClient:
    """Client for interacting with Hugging Face hosted models."""

    base_url = "https://api-inference.huggingface.co/models"

    def __init__(self, api_key: str, *, timeout: float = 60.0) -> None:
        if not api_key:
            raise ValueError("Hugging Face API key is required")
        self.api_key = api_key
        self.timeout = timeout

    async def text_inference(self, model: str, inputs: str, parameters: dict[str, Any] | None = None) -> Any:
        """Execute a text inference call."""

        payload: dict[str, Any] = {"inputs": inputs}
        if parameters:
            payload["parameters"] = parameters
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/{model}",
                headers=self._headers,
                json=payload,
            )
        response.raise_for_status()
        return response.json()

    async def image_caption(
        self,
        image_bytes: bytes,
        *,
        model: str = "Salesforce/blip-image-captioning-large",
    ) -> Any:
        """Generate a caption for an image using a hosted model."""

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/{model}",
                headers={**self._headers, "Content-Type": "application/octet-stream"},
                content=image_bytes,
            )
        response.raise_for_status()
        return response.json()

    @property
    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}"}
