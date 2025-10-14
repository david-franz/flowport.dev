"""Client for interacting with Google Gemini (Generative Language) API."""

from __future__ import annotations

from typing import Any, Iterable, Mapping

import httpx


class GeminiClient:
    """Wrapper around the Gemini generateContent endpoint."""

    base_url = "https://generativelanguage.googleapis.com/v1beta"

    def __init__(self, api_key: str, *, timeout: float = 60.0) -> None:
        if not api_key:
            raise ValueError("Gemini API key is required")
        self.api_key = api_key
        self.timeout = timeout

    async def generate_content(
        self,
        model: str,
        contents: Iterable[Mapping[str, Any]],
        *,
        system_instruction: Mapping[str, Any] | None = None,
        parameters: Mapping[str, Any] | None = None,
    ) -> Any:
        """Execute a generateContent call."""

        payload: dict[str, Any] = {
            "contents": [dict(content) for content in contents],
        }
        if system_instruction:
            payload["systemInstruction"] = dict(system_instruction)

        if parameters:
            recognised_keys = {"generationConfig", "safetySettings", "tools", "toolConfig", "candidateCount"}
            if any(key in recognised_keys for key in parameters):
                for key, value in parameters.items():
                    if key in recognised_keys:
                        payload[key] = value
                    else:
                        payload.setdefault("generationConfig", {})[key] = value
            else:
                payload["generationConfig"] = dict(parameters)

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/models/{model}:generateContent",
                params={"key": self.api_key},
                json=payload,
            )
        response.raise_for_status()
        return response.json()
