-- =========================================================
-- V004__grading_prompt.sql  キーワード説明の問いかけ（詳細設計書 5.3 A-07b・7.6）
-- =========================================================
-- T-16 採点ジョブ（パートナーの問いかけ {"text":"...","angles":["しくみ","目的"]}。問いかけなしの採点は NULL）
ALTER TABLE grading_jobs ADD COLUMN IF NOT EXISTS prompt jsonb;
INSERT INTO schema_migrations (version, description) VALUES ('V004', 'grading prompt') ON CONFLICT DO NOTHING;
