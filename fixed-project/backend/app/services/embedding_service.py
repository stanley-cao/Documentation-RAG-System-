"""Embedding service using configured provider."""
from typing import Any
import httpx

from fastapi import HTTPException, status

from app.db.supabase import get_supabase_client
from app.services.langsmith import get_traced_async_openai_client
from app.routers.settings import decrypt_value


def get_global_embedding_settings() -> dict[str, Any]:
    """Get global embedding settings from the global_settings table."""
    supabase = get_supabase_client()
    result = supabase.table("global_settings").select(
        "embedding_model, embedding_base_url, embedding_api_key, embedding_dimensions"
    ).limit(1).execute()

    data = result.data[0] if result and result.data else None

    api_key = decrypt_value(data.get("embedding_api_key")) if data else None
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Embedding not configured. An admin must configure embedding settings."
        )

    return {
        "model": data.get("embedding_model") or "text-embedding-3-small",
        "base_url": data.get("embedding_base_url") or None,
        "api_key": api_key,
        "dimensions": data.get("embedding_dimensions") or 1536,
    }


def _is_gemini(base_url: str | None) -> bool:
    if not base_url:
        return False
    return "generativelanguage.googleapis.com" in base_url


def _is_openai(base_url: str | None) -> bool:
    """Only native OpenAI supports the dimensions parameter."""
    return not base_url or "api.openai.com" in (base_url or "")


async def _get_embeddings_gemini(texts: list[str], model: str, api_key: str) -> list[list[float]]:
    """Call Gemini's native batchEmbedContents API."""
    clean_model = model.replace("models/", "")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{clean_model}:batchEmbedContents"

    requests_payload = [
        {"model": f"models/{clean_model}", "content": {"parts": [{"text": t}]}}
        for t in texts
    ]

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            url,
            headers={"Content-Type": "application/json"},
            params={"key": api_key},
            json={"requests": requests_payload},
        )

    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Gemini embedding API error {response.status_code}: {response.text}"
        )

    data = response.json()
    embeddings = [item["values"] for item in data.get("embeddings", [])]

    if not embeddings:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Gemini returned no embeddings."
        )

    return embeddings


async def get_embeddings(texts: list[str], user_id: str | None = None) -> list[list[float]]:
    """Generate embeddings for a list of texts using global settings."""
    emb_settings = get_global_embedding_settings()
    model = emb_settings["model"]
    base_url = emb_settings["base_url"]
    api_key = emb_settings["api_key"]
    dimensions = emb_settings["dimensions"]

    # Gemini needs its own native API
    if _is_gemini(base_url):
        return await _get_embeddings_gemini(texts, model, api_key)

    # All other providers via OpenAI-compatible SDK
    client = get_traced_async_openai_client(
        base_url=base_url,
        api_key=api_key,
    )

    # Only OpenAI supports the dimensions parameter — skip it for Groq and others
    if _is_openai(base_url):
        response = await client.embeddings.create(
            model=model,
            input=texts,
            dimensions=dimensions,
        )
    else:
        response = await client.embeddings.create(
            model=model,
            input=texts,
        )

    return [item.embedding for item in response.data]