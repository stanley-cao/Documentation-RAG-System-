"""Vector search via match_chunks RPC."""
from app.db.supabase import get_supabase_client
from app.routers.settings import DEFAULT_SIMILARITY_THRESHOLD, DEFAULT_TOP_K
from app.services.embedding_service import get_embeddings


def get_retrieval_settings() -> tuple[float, int]:
    """Read the admin-configured similarity threshold and top-k from global_settings."""
    supabase = get_supabase_client()
    result = supabase.table("global_settings").select(
        "retrieval_similarity_threshold, retrieval_top_k"
    ).limit(1).execute()
    row = result.data[0] if result and result.data else {}
    threshold = row.get("retrieval_similarity_threshold")
    top_k = row.get("retrieval_top_k")
    return (
        DEFAULT_SIMILARITY_THRESHOLD if threshold is None else float(threshold),
        DEFAULT_TOP_K if top_k is None else int(top_k),
    )


async def search_documents(
    query: str,
    user_id: str,
    top_k: int | None = None,
    threshold: float | None = None,
    keywords: list[str] | None = None,
) -> list[dict]:
    """
    Search user's documents with hybrid (vector + keyword) retrieval.

    Args:
        query: Search query text
        user_id: The user's ID; match_chunks only searches this user's chunks
        top_k: Maximum number of results (None = use global setting)
        threshold: Minimum cosine similarity, 0-1 (None = use global setting)
        keywords: Exact terms for the keyword branch; if omitted, the query text is used

    Returns:
        List of matching chunks with similarity scores
    """
    # Fall back to the admin-configured values when the caller doesn't override them
    if top_k is None or threshold is None:
        configured_threshold, configured_top_k = get_retrieval_settings()
        threshold = configured_threshold if threshold is None else threshold
        top_k = configured_top_k if top_k is None else top_k

    query_embedding = await get_embeddings([query], user_id=user_id)

    # Hybrid retrieval: vector similarity + full-text keyword match, fused with RRF
    # (see migration 20260123000009). Results are ordered by rrf_score.
    supabase = get_supabase_client()
    result = supabase.rpc("hybrid_match_chunks", {
        # Keyword branch: explicit keywords if given, otherwise the query's own words
        "query_text": " ".join(keywords) if keywords else query,
        "query_embedding": query_embedding[0],
        "match_threshold": threshold,
        "match_count": top_k,
        "p_user_id": user_id,
    }).execute()

    return result.data or []
