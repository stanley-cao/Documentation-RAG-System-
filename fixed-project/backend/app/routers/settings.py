"""Global settings router for LLM and embedding configuration."""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from cryptography.fernet import Fernet, InvalidToken

from app.dependencies import get_current_user, get_admin_user, User
from app.db.supabase import get_supabase_client
from app.config import get_settings as get_app_settings

router = APIRouter(prefix="/settings", tags=["settings"])

# Retrieval defaults, used if the DB row lacks values (match the migration defaults)
DEFAULT_SIMILARITY_THRESHOLD: float = 0.1
DEFAULT_TOP_K: int = 15


def get_fernet() -> Fernet | None:
    """Get Fernet instance if encryption key is configured."""
    key = get_app_settings().settings_encryption_key
    if not key:
        return None
    return Fernet(key.encode())


def encrypt_value(value: str | None) -> str | None:
    """Encrypt a value if encryption key is configured."""
    if not value:
        return None
    f = get_fernet()
    if not f:
        return value
    return f.encrypt(value.encode()).decode()


def decrypt_value(value: str | None) -> str | None:
    """Decrypt a value if encryption key is configured."""
    if not value:
        return None
    f = get_fernet()
    if not f:
        return value
    try:
        return f.decrypt(value.encode()).decode()
    except (InvalidToken, Exception):
        return value  # Legacy plaintext or corrupted - return as-is


class GlobalSettingsResponse(BaseModel):
    llm_model: str | None = None
    llm_base_url: str | None = None
    llm_api_key: str | None = None
    embedding_model: str | None = None
    embedding_base_url: str | None = None
    embedding_api_key: str | None = None
    embedding_dimensions: int | None = None
    retrieval_similarity_threshold: float = DEFAULT_SIMILARITY_THRESHOLD
    retrieval_top_k: int = DEFAULT_TOP_K
    has_chunks: bool = False


class GlobalSettingsUpdate(BaseModel):
    llm_model: str | None = None
    llm_base_url: str | None = None
    llm_api_key: str | None = None
    embedding_model: str | None = None
    embedding_base_url: str | None = None
    embedding_api_key: str | None = None
    embedding_dimensions: int | None = None
    # Retrieval tuning; None = leave unchanged. Bounds mirror the DB CHECK constraints.
    retrieval_similarity_threshold: float | None = Field(default=None, ge=0.0, le=1.0)
    retrieval_top_k: int | None = Field(default=None, ge=1, le=50)


def build_settings_response(data: dict | None, has_chunks: bool) -> GlobalSettingsResponse:
    """Convert a global_settings row into the API response, masking API keys."""
    if not data:
        return GlobalSettingsResponse(has_chunks=has_chunks)
    return GlobalSettingsResponse(
        llm_model=data.get("llm_model"),
        llm_base_url=data.get("llm_base_url"),
        llm_api_key=mask_api_key(decrypt_value(data.get("llm_api_key"))),
        embedding_model=data.get("embedding_model"),
        embedding_base_url=data.get("embedding_base_url"),
        embedding_api_key=mask_api_key(decrypt_value(data.get("embedding_api_key"))),
        embedding_dimensions=data.get("embedding_dimensions"),
        retrieval_similarity_threshold=data.get("retrieval_similarity_threshold", DEFAULT_SIMILARITY_THRESHOLD),
        retrieval_top_k=data.get("retrieval_top_k", DEFAULT_TOP_K),
        has_chunks=has_chunks,
    )


def mask_api_key(key: str | None) -> str | None:
    """Mask API key, showing only last 4 characters."""
    if not key:
        return None
    if len(key) <= 4:
        return "***"
    return f"***{key[-4:]}"


def is_masked_value(value: str | None) -> bool:
    """Check if a value is a masked API key (contains ***)."""
    if not value:
        return False
    return "***" in value


def system_has_chunks() -> bool:
    """Check if any chunks exist in the system."""
    supabase = get_supabase_client()
    result = supabase.table("chunks").select("id", count="exact").limit(1).execute()
    return (result.count or 0) > 0


def get_global_settings_row() -> dict | None:
    """Get the single global settings row."""
    supabase = get_supabase_client()
    result = supabase.table("global_settings").select("*").limit(1).execute()
    return result.data[0] if result and result.data else None


@router.get("", response_model=GlobalSettingsResponse)
async def get_settings(current_user: User = Depends(get_current_user)):
    """Get global settings with masked API keys."""
    return build_settings_response(get_global_settings_row(), system_has_chunks())


@router.put("", response_model=GlobalSettingsResponse)
async def update_settings(
    settings_data: GlobalSettingsUpdate,
    current_user: User = Depends(get_admin_user),
):
    """Update global settings. Admin only."""
    supabase = get_supabase_client()
    has_chunks = system_has_chunks()

    # If chunks exist, check if embedding fields are being changed
    if has_chunks:
        current = get_global_settings_row()

        if current:
            embedding_changed = False

            if (settings_data.embedding_model is not None and
                    settings_data.embedding_model != current.get("embedding_model")):
                embedding_changed = True
            if (settings_data.embedding_base_url is not None and
                    settings_data.embedding_base_url != current.get("embedding_base_url")):
                embedding_changed = True
            if (settings_data.embedding_dimensions is not None and
                    settings_data.embedding_dimensions != current.get("embedding_dimensions")):
                embedding_changed = True
            if (settings_data.embedding_api_key is not None and
                    not is_masked_value(settings_data.embedding_api_key) and
                    settings_data.embedding_api_key != decrypt_value(current.get("embedding_api_key"))):
                embedding_changed = True

            if embedding_changed:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot change embedding settings while chunks exist. Delete all documents first."
                )

    # Build update dict, skipping masked API key values
    update_data: dict = {}

    if settings_data.llm_model is not None:
        update_data["llm_model"] = settings_data.llm_model or None
    if settings_data.llm_base_url is not None:
        update_data["llm_base_url"] = settings_data.llm_base_url or None
    if settings_data.llm_api_key is not None and not is_masked_value(settings_data.llm_api_key):
        update_data["llm_api_key"] = encrypt_value(settings_data.llm_api_key) if settings_data.llm_api_key else None
    if settings_data.embedding_model is not None:
        update_data["embedding_model"] = settings_data.embedding_model or None
    if settings_data.embedding_base_url is not None:
        update_data["embedding_base_url"] = settings_data.embedding_base_url or None
    if settings_data.embedding_api_key is not None and not is_masked_value(settings_data.embedding_api_key):
        update_data["embedding_api_key"] = encrypt_value(settings_data.embedding_api_key) if settings_data.embedding_api_key else None
    if settings_data.embedding_dimensions is not None:
        update_data["embedding_dimensions"] = settings_data.embedding_dimensions or None
    # Retrieval settings are not locked by existing chunks; 0.0 is a valid threshold, so no `or None`
    if settings_data.retrieval_similarity_threshold is not None:
        update_data["retrieval_similarity_threshold"] = settings_data.retrieval_similarity_threshold
    if settings_data.retrieval_top_k is not None:
        update_data["retrieval_top_k"] = settings_data.retrieval_top_k

    if not update_data:
        # Nothing to update, return current state
        return build_settings_response(get_global_settings_row(), has_chunks)

    # Get the existing row ID
    existing = get_global_settings_row()
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Global settings row not found"
        )

    result = supabase.table("global_settings").update(
        update_data
    ).eq("id", existing["id"]).execute()

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save settings"
        )

    return build_settings_response(result.data[0], has_chunks)
