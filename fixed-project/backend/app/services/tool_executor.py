"""Tool execution dispatcher."""
import json
import logging
import re
from app.services.retrieval_service import search_documents

logger = logging.getLogger(__name__)

# Max characters of excerpt text returned by one search (~1.7k tokens). Keeps a 3-search
# turn under small provider limits (e.g. Groq free tier: 8k tokens/minute per request).
MAX_TOOL_RESULT_CHARS: int = 6000


def _keyword_snippet(content: str, keywords: list[str], context_lines: int = 1) -> str | None:
    """
    Return only the lines that contain a keyword (whole word, case-insensitive), plus
    `context_lines` around each, joined with "…" gaps. Returns None if no line matches
    (e.g. the full-text match came from stemming), so the caller can fall back to the full chunk.
    """
    lines = content.splitlines()
    patterns = [re.compile(rf"(?<!\w){re.escape(k)}(?!\w)", re.IGNORECASE) for k in keywords]
    hits = [i for i, line in enumerate(lines) if any(p.search(line) for p in patterns)]
    if not hits:
        return None
    keep: set[int] = set()
    for i in hits:
        keep.update(range(max(0, i - context_lines), min(len(lines), i + context_lines + 1)))
    out: list[str] = []
    prev = -2
    for i in sorted(keep):
        if i != prev + 1:
            out.append("…")
        out.append(lines[i])
        prev = i
    if prev != len(lines) - 1:
        out.append("…")
    return "\n".join(out)


def _match_label(vector_rank: int | None, keyword_rank: int | None) -> str:
    """Describe which retrieval branch(es) found a chunk."""
    if vector_rank and keyword_rank:
        return "meaning + keyword"
    if keyword_rank:
        return "keyword"
    return "meaning"


async def execute_tool_call(
    tool_call: dict,
    user_id: str,
    seen_chunk_ids: set[str] | None = None,
) -> str:
    """
    Execute a tool call and return the result as a string.

    Args:
        tool_call: Dict with 'name' and 'arguments' keys
        user_id: The user's ID for context
        seen_chunk_ids: Chunk IDs already sent to the model earlier in this turn.
            They are skipped (not resent) and new ones are added to the set.

    Returns:
        Tool result as a string
    """
    name = tool_call["name"]
    arguments = json.loads(tool_call["arguments"])
    seen = seen_chunk_ids if seen_chunk_ids is not None else set()

    if name == "search_documents":
        query = arguments.get("query", "")
        # Optional exact terms; ignore anything that isn't a non-empty string
        keywords = [str(k).strip() for k in arguments.get("keywords") or [] if str(k).strip()]
        results = await search_documents(query, user_id, keywords=keywords or None)
        logger.warning(f"search_documents query={query!r} keywords={keywords} -> {len(results)} result(s)")

        if keywords:
            # Exact-keyword hits first (stable sort keeps RRF order within each group),
            # so the size budget below never cuts the items that were explicitly asked for
            results = sorted(results, key=lambda r: r.get("keyword_rank") is None)

        if not results:
            return "No relevant documents found."

        # Drop chunks the model already has from an earlier search this turn
        fresh = [r for r in results if r["id"] not in seen]
        repeated = len(results) - len(fresh)

        # Add excerpts in relevance (RRF) order until the size budget is used
        formatted: list[str] = []
        used_chars = 0
        for r in fresh:
            # For explicit keyword lookups, send only the matching lines (much smaller than the chunk)
            text = r["content"]
            excerpt_kind = ""
            if keywords and r.get("keyword_rank"):
                snippet = _keyword_snippet(text, keywords)
                if snippet:
                    text, excerpt_kind = snippet, "; lines matching keywords only"
            if formatted and used_chars + len(text) > MAX_TOOL_RESULT_CHARS:
                break
            matched_by = _match_label(r.get("vector_rank"), r.get("keyword_rank"))
            formatted.append(
                f"[Source: {r.get('metadata', {}).get('filename', 'unknown')}] "
                f"(matched by {matched_by}; similarity: {r['similarity']:.2f}{excerpt_kind})\n{text}"
            )
            used_chars += len(text)
            seen.add(r["id"])
        omitted = len(fresh) - len(formatted)

        notes: list[str] = []
        if repeated:
            notes.append(f"{repeated} matching excerpt(s) were already shown earlier in this turn and are not repeated.")
        if omitted:
            notes.append(f"{omitted} lower-ranked excerpt(s) were omitted to save space; search with more specific keywords to see them.")
        if not formatted:
            return " ".join(notes) or "No new excerpts found."

        # Grounding reminder placed next to the data (models weight this more than the system prompt)
        header = (
            f"{len(formatted)} excerpt(s) retrieved; these may not be the whole document. "
            "Facts in your answer must come from this text; do not guess at content you did not see. "
            "If you used general knowledge to decide what to search for, say which parts of the answer "
            "come from general knowledge and which from the document. If an item you searched for "
            "is not in these excerpts, search again with that exact keyword before saying it is missing."
        )
        if notes:
            header += " " + " ".join(notes)
        return header + "\n\n" + "\n\n---\n\n".join(formatted)

    logger.warning(f"Unknown tool: {name}")
    return f"Error: Unknown tool '{name}'"
