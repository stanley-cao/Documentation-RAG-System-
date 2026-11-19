-- Module 6: hybrid search (keyword + vector) combined with Reciprocal Rank Fusion.

-- 1. Full-text search column, generated from content (existing rows are back-filled)
ALTER TABLE chunks
    ADD COLUMN IF NOT EXISTS fts tsvector
    GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

CREATE INDEX IF NOT EXISTS idx_chunks_fts ON chunks USING gin (fts);

-- 2. Hybrid retrieval
--    * vector branch: cosine similarity above match_threshold
--    * keyword branch: OR of the query's lexemes, so a query listing several names/numbers
--      matches chunks containing ANY of them (websearch/plainto would require ALL)
--    * fused with RRF: score = 1/(k + vector_rank) + 1/(k + keyword_rank)
CREATE OR REPLACE FUNCTION hybrid_match_chunks(
    query_text text,
    query_embedding vector,
    match_count int,
    p_user_id uuid,
    match_threshold float DEFAULT 0.1,
    rrf_k int DEFAULT 60
) RETURNS TABLE (
    id uuid,
    document_id uuid,
    content text,
    chunk_index int,
    metadata jsonb,
    similarity float,
    vector_rank bigint,
    keyword_rank bigint,
    rrf_score float
) LANGUAGE plpgsql STABLE AS $$
DECLARE
    or_query tsquery;
BEGIN
    -- Build "lexeme1 | lexeme2 | ..." from the query's own normalized lexemes (safe: no raw user syntax)
    SELECT string_agg(quote_literal(lexeme), ' | ')::tsquery
      INTO or_query
      FROM unnest(to_tsvector('english', coalesce(query_text, '')));

    RETURN QUERY
    WITH vec AS (
        SELECT c.id,
               row_number() OVER (ORDER BY c.embedding <=> query_embedding) AS rnk
        FROM chunks c
        WHERE c.user_id = p_user_id
          AND 1 - (c.embedding <=> query_embedding) > match_threshold
        ORDER BY c.embedding <=> query_embedding
        LIMIT match_count * 2
    ),
    kw AS (
        SELECT c.id,
               row_number() OVER (ORDER BY ts_rank_cd(c.fts, or_query) DESC) AS rnk
        FROM chunks c
        WHERE or_query IS NOT NULL
          AND c.user_id = p_user_id
          AND c.fts @@ or_query
        ORDER BY ts_rank_cd(c.fts, or_query) DESC
        LIMIT match_count * 2
    ),
    fused AS (
        SELECT coalesce(vec.id, kw.id) AS id,
               vec.rnk AS v_rank,
               kw.rnk AS k_rank,
               coalesce(1.0 / (rrf_k + vec.rnk), 0) + coalesce(1.0 / (rrf_k + kw.rnk), 0) AS score
        FROM vec
        FULL OUTER JOIN kw ON vec.id = kw.id
    )
    SELECT c.id, c.document_id, c.content, c.chunk_index, c.metadata,
           (1 - (c.embedding <=> query_embedding))::float AS similarity,
           f.v_rank, f.k_rank, f.score::float
    FROM fused f
    JOIN chunks c ON c.id = f.id
    ORDER BY f.score DESC
    LIMIT match_count;
END;
$$;
