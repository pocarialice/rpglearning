-- =========================================================
-- V007__daily_message_slot.sql  ホームのひとことを時間帯（朝・昼・夜）ごとに作り直す（詳細設計書 5.2 A-05）
-- =========================================================
-- T-02 利用者（ひとことを作った時間帯。daily_message_on と組で使う）
ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_message_slot text CHECK (daily_message_slot IN ('morning', 'day', 'night'));

INSERT INTO schema_migrations (version, description) VALUES ('V007', 'daily message slot') ON CONFLICT DO NOTHING;
