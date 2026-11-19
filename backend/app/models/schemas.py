from typing import Annotated

from pydantic import BaseModel, StringConstraints
from datetime import datetime


class ThreadCreate(BaseModel):
    title: str | None = "New Chat"


class ThreadResponse(BaseModel):
    id: str
    user_id: str
    title: str
    created_at: datetime
    updated_at: datetime


class ThreadUpdate(BaseModel):
    title: str


class MessageCreate(BaseModel):
    # Reject empty / whitespace-only messages with a 422
    content: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class MessageResponse(BaseModel):
    id: str
    thread_id: str
    user_id: str
    role: str
    content: str
    created_at: datetime


class DocumentResponse(BaseModel):
    id: str
    user_id: str
    filename: str
    file_type: str
    file_size: int
    storage_path: str
    status: str
    error_message: str | None = None
    chunk_count: int = 0
    created_at: datetime
    updated_at: datetime
