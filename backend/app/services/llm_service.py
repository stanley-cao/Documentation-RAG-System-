"""LLM service using ChatCompletions API with provider abstraction."""
from typing import AsyncGenerator, Any

from fastapi import HTTPException, status

from app.db.supabase import get_supabase_client
from app.services.langsmith import get_traced_async_openai_client
from app.routers.settings import decrypt_value

SYSTEM_PROMPT = """You are a helpful assistant with access to a search_documents tool.

When users ask about their documents or uploaded files, use search_documents to find relevant content.
For follow-up questions about previous search results, you can answer directly from what was already retrieved without searching again.

Grounding rules for answers about the user's documents:
- State only facts that appear in the retrieved text. Quote names, numbers, and dates exactly as written there.
- Do not present your own knowledge as if it came from the document.
- You MAY use general knowledge to decide what to look up. Example: if asked for "the first item of each group" and you know where groups start, search for those exact numbers or names. Pass them together in the `keywords` list of ONE search_documents call (e.g. ["252", "387", "494"]); do not search for them one at a time.
- When an answer combines the two, you MUST say which part is general knowledge (e.g. "where each group starts is general knowledge") and which part comes from the document (e.g. the names found there). Never claim general knowledge came from the document.
- Search results are excerpts, not the whole file. Never guess at content you did not see, never invent entries, ranges, or sections, and never write "if present". If the excerpts don't cover something, say so plainly.
- If the search returns nothing relevant, say the documents don't appear to contain that information.
- Keep answers concise. If a complete answer would be a very long list (dozens of items), do not enumerate everything: describe what the document is, give a few exact examples from the excerpts, and offer to look up specific items."""

RAG_TOOLS = [{
    "type": "function",
    "function": {
        "name": "search_documents",
        "description": (
            "Search the user's uploaded documents. Hybrid search: matches by meaning AND by exact "
            "keywords (names, numbers, IDs). To look up several specific items, list them all as "
            "keywords in one query."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "What you are looking for, in natural language"
                },
                "keywords": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": (
                        "Optional exact terms to match (names, numbers, IDs). Put ALL the specific "
                        "items you need in this one list, e.g. [\"252\", \"387\", \"494\"], rather than "
                        "searching for them one at a time."
                    )
                }
            },
            "required": ["query"]
        }
    }
}]


def get_global_llm_settings() -> dict[str, Any]:
    """Get global LLM settings from the global_settings table."""
    supabase = get_supabase_client()
    result = supabase.table("global_settings").select(
        "llm_model, llm_base_url, llm_api_key"
    ).limit(1).execute()

    data = result.data[0] if result and result.data else None

    api_key = decrypt_value(data.get("llm_api_key")) if data else None
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="LLM not configured. An admin must configure LLM settings."
        )

    return {
        "model": data.get("llm_model") or "gpt-4o",
        "base_url": data.get("llm_base_url") or None,
        "api_key": api_key,
    }


async def astream_chat_response(
    messages: list[dict],
    tools: list[dict] | None = None,
    user_id: str | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    """Stream a chat response using the ChatCompletions API."""
    llm_settings = get_global_llm_settings()
    model = llm_settings["model"]
    client = get_traced_async_openai_client(
        base_url=llm_settings["base_url"],
        api_key=llm_settings["api_key"],
    )

    # Pass messages through unchanged. Stored history is already user/assistant text only
    # (see chat.get_thread_messages); the only tool_calls / tool messages here are from the
    # current turn's tool loop, and the model MUST see them, or it never gets the search
    # results and keeps re-calling the tool until the round limit (empty reply).
    request_kwargs: dict[str, Any] = {
        "model": model,
        "messages": [{"role": "system", "content": SYSTEM_PROMPT}, *messages],
        "stream": True,
    }
    if tools:
        request_kwargs["tools"] = tools
        request_kwargs["tool_choice"] = "auto"
    if "gpt-oss" in model:
        # gpt-oss spends output tokens on hidden reasoning; on low token-per-minute tiers that
        # can exhaust the budget before any visible text. Low effort keeps room for the answer.
        request_kwargs["extra_body"] = {"reasoning_effort": "low"}

    try:
        stream = await client.chat.completions.create(**request_kwargs)

        full_response = ""
        tool_calls_buffer: dict[int, dict] = {}
        finish_reason: str | None = None

        async for chunk in stream:
            if not chunk.choices:
                continue
            finish_reason = chunk.choices[0].finish_reason or finish_reason
            delta = chunk.choices[0].delta

            if delta and delta.content:
                full_response += delta.content
                yield {"type": "text_delta", "content": delta.content}

            if delta and delta.tool_calls:
                for tc in delta.tool_calls:
                    idx = tc.index
                    if idx is None:
                        # Gemini sends each call whole with index=null: a new id means a new call,
                        # otherwise it continues the most recent one
                        known_ids = {b["id"] for b in tool_calls_buffer.values()}
                        if tc.id and tc.id not in known_ids:
                            idx = len(tool_calls_buffer)
                        else:
                            idx = max(tool_calls_buffer, default=0)
                    if idx not in tool_calls_buffer:
                        tool_calls_buffer[idx] = {
                            "id": tc.id or "",
                            "name": tc.function.name if tc.function else "",
                            "arguments": "",
                            "extra_content": None,
                        }
                    else:
                        if tc.id:
                            tool_calls_buffer[idx]["id"] = tc.id
                        if tc.function and tc.function.name:
                            tool_calls_buffer[idx]["name"] = tc.function.name
                    if tc.function and tc.function.arguments:
                        tool_calls_buffer[idx]["arguments"] += tc.function.arguments
                    # Provider-specific data that must be echoed back, e.g. Gemini's
                    # extra_content.google.thought_signature (requests fail with 400 without it)
                    extra = (tc.model_extra or {}).get("extra_content")
                    if extra:
                        tool_calls_buffer[idx]["extra_content"] = extra

        # Strip Qwen3 thinking blocks from response
        import re
        if tool_calls_buffer:
            yield {"type": "tool_calls", "tool_calls": list(tool_calls_buffer.values())}
        else:
            clean_response = re.sub(r'<think>.*?</think>', '', full_response, flags=re.DOTALL).strip()
            yield {
                "type": "response_completed",
                "content": clean_response or full_response,
                # "length" = provider cut the output off at its token limit
                "truncated": finish_reason == "length",
            }

    except HTTPException:
        raise
    except Exception as e:
        yield {"type": "error", "error": _friendly_error(e)}


def _friendly_error(e: Exception) -> str:
    """Turn common provider limit errors into actionable messages; pass others through."""
    status_code = getattr(e, "status_code", None)
    if status_code == 413:
        return ("This question pulled in more document text than the model's plan allows per request. "
                "Try a narrower question, or lower Max Results in Settings.")
    if status_code == 429:
        return "The model's rate limit was reached. Wait about 20 seconds and try again."
    return str(e)