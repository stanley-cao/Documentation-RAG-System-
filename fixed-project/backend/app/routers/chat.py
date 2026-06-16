import json
from fastapi import APIRouter, Depends, HTTPException, status
from starlette.responses import StreamingResponse
from datetime import datetime

from app.dependencies import get_current_user, User
from app.db.supabase import get_supabase_client
from app.models.schemas import MessageCreate, MessageResponse
from app.services.llm_service import astream_chat_response, RAG_TOOLS
from app.services.tool_executor import execute_tool_call

router = APIRouter(prefix="/threads/{thread_id}", tags=["chat"])

MAX_TOOL_ROUNDS = 3


async def verify_thread_access(thread_id: str, user_id: str) -> dict:
    supabase = get_supabase_client()
    result = supabase.table("threads").select("*").eq(
        "id", thread_id
    ).eq("user_id", user_id).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")
    return result.data[0]


def get_thread_messages(thread_id: str) -> list[dict]:
    """Get only user/assistant text messages — no tool messages."""
    supabase = get_supabase_client()
    result = supabase.table("messages").select("role, content").eq(
        "thread_id", thread_id
    ).order("created_at").execute()
    return [
        {"role": msg["role"], "content": msg["content"]}
        for msg in result.data
        if msg["role"] in ("user", "assistant") and msg.get("content")
    ]


def user_has_documents(user_id: str) -> bool:
    supabase = get_supabase_client()
    result = supabase.table("documents").select("id", count="exact").eq(
        "user_id", user_id
    ).eq("status", "completed").execute()
    return (result.count or 0) > 0


@router.get("/messages", response_model=list[MessageResponse])
async def get_messages(thread_id: str, current_user: User = Depends(get_current_user)):
    await verify_thread_access(thread_id, current_user.id)
    supabase = get_supabase_client()
    result = supabase.table("messages").select("*").eq(
        "thread_id", thread_id
    ).order("created_at").execute()
    return result.data


@router.post("/messages")
async def send_message(
    thread_id: str,
    message_data: MessageCreate,
    current_user: User = Depends(get_current_user)
):
    await verify_thread_access(thread_id, current_user.id)
    supabase = get_supabase_client()

    now = datetime.utcnow().isoformat()
    user_message_result = supabase.table("messages").insert({
        "thread_id": thread_id,
        "user_id": current_user.id,
        "role": "user",
        "content": message_data.content,
        "created_at": now,
    }).execute()

    if not user_message_result.data:
        raise HTTPException(status_code=500, detail="Failed to save user message")

    # Load clean history (user + assistant text only)
    messages = get_thread_messages(thread_id)
    has_docs = user_has_documents(current_user.id)
    tools = RAG_TOOLS if has_docs else None

    async def generate():
        full_response = ""
        # Working messages for tool loop — kept in memory only, not persisted
        working_messages = list(messages)
        rounds = 0

        try:
            while rounds < MAX_TOOL_ROUNDS:
                rounds += 1

                async for event in astream_chat_response(
                    working_messages,
                    tools=tools,
                    user_id=current_user.id,
                ):
                    if event["type"] == "text_delta":
                        full_response += event["content"]
                        yield f"event: text_delta\ndata: {json.dumps({'content': event['content']})}\n\n"

                    elif event["type"] == "tool_calls":
                        tool_calls = event["tool_calls"]

                        # Add assistant tool call to working messages
                        working_messages.append({
                            "role": "assistant",
                            "content": None,
                            "tool_calls": [
                                {
                                    "id": tc["id"],
                                    "type": "function",
                                    "function": {
                                        "name": tc["name"],
                                        "arguments": tc["arguments"],
                                    }
                                }
                                for tc in tool_calls
                            ],
                        })

                        # Execute each tool and add results to working messages
                        for tc in tool_calls:
                            result = await execute_tool_call(tc, current_user.id)
                            working_messages.append({
                                "role": "tool",
                                "tool_call_id": tc["id"],
                                "content": result,
                            })

                        break  # Go back to top of loop for LLM to respond

                    elif event["type"] == "response_completed":
                        if full_response:
                            supabase.table("messages").insert({
                                "thread_id": thread_id,
                                "user_id": current_user.id,
                                "role": "assistant",
                                "content": full_response,
                                "created_at": datetime.utcnow().isoformat(),
                            }).execute()
                            supabase.table("threads").update({
                                "updated_at": datetime.utcnow().isoformat()
                            }).eq("id", thread_id).execute()

                        yield f"event: done\ndata: {{}}\n\n"
                        return

                    elif event["type"] == "error":
                        yield f"event: error\ndata: {json.dumps({'error': event['error']})}\n\n"
                        return

            # Max rounds reached — save whatever we have
            if full_response:
                supabase.table("messages").insert({
                    "thread_id": thread_id,
                    "user_id": current_user.id,
                    "role": "assistant",
                    "content": full_response,
                    "created_at": datetime.utcnow().isoformat(),
                }).execute()
            yield f"event: done\ndata: {{}}\n\n"

        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )