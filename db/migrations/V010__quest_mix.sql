-- =========================================================
-- V010__quest_mix.sql  出題の見直し（2026-11）
-- ・デイリークエスト Q-04（今日の復習をすべて終える）をやめ、Q-06〜Q-08 を足す
--   Q-04 の定義は過去の割り当て（user_quests）が参照しているので消さず、is_active を false にする
-- ・冒険（T-13）に、説明問題を出すかどうか（include_explain）を持たせる。既存の冒険は出す（true）
-- =========================================================
UPDATE quest_defs SET is_active = false WHERE quest_code = 'Q-04';
INSERT INTO quest_defs (quest_code, title, target, reward_exp, sort_order) VALUES
  ('Q-06', '冒険を1回やりとげる',           1, 30, 6),
  ('Q-07', 'まちがえた問題を正解し直す',       1, 20, 7),
  ('Q-08', 'キーワード説明で80点以上をとる',    1, 30, 8)
ON CONFLICT (quest_code) DO NOTHING;
-- 今日まだ達成していない Q-04 は、もう進まないので取り下げる
DELETE FROM user_quests WHERE quest_code = 'Q-04' AND achieved_at IS NULL AND quest_on >= (now() AT TIME ZONE 'Asia/Tokyo')::date;
ALTER TABLE adventures ADD COLUMN IF NOT EXISTS include_explain boolean NOT NULL DEFAULT true;
INSERT INTO schema_migrations (version, description) VALUES ('V010', 'quest mix') ON CONFLICT DO NOTHING;
