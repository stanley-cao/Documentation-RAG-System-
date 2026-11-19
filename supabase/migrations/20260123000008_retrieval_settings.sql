-- Admin-configurable retrieval parameters for the search_documents tool.
-- Defaults match the previous hardcoded values in retrieval_service.py.
ALTER TABLE global_settings
    ADD COLUMN IF NOT EXISTS retrieval_similarity_threshold DOUBLE PRECISION NOT NULL DEFAULT 0.1
        CHECK (retrieval_similarity_threshold >= 0 AND retrieval_similarity_threshold <= 1),
    ADD COLUMN IF NOT EXISTS retrieval_top_k INTEGER NOT NULL DEFAULT 15
        CHECK (retrieval_top_k BETWEEN 1 AND 50);
