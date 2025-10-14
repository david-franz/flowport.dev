"""Client for interacting with the OpenAI API."""

from __future__ import annotations

from typing import Any, Iterable, Mapping

import httpx


class OpenAIClient:
    """Lightweight wrapper around OpenAI's chat completions endpoint."""

    base_url = "https://api.openai.com/v1"

    def __init__(self, api_key: str, *, timeout: float = 60.0) -> None:
        if not api_key:
            raise ValueError("OpenAI API key is required")
        self.api_key = api_key
        self.timeout = timeout

    async def chat_completion(
        self,
        model: str,
        messages: Iterable[Mapping[str, Any]],
        parameters: Mapping[str, Any] | None = None,
    ) -> Any:
        """Execute a chat completion request."""

        payload: dict[str, Any] = {
            "model": model,
            "messages": [dict(message) for message in messages],
        }
        if parameters:
            for key, value in parameters.items():
                if key in {"model", "messages"}:
                    continue
                payload[key] = value

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers=self._headers,
                json=payload,
            )
        response.raise_for_status()
        return response.json()

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
