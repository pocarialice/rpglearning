-- =========================================================
-- V005__study_time.sql  学習時間（冒険ごとの時間と、利用者ごとの累計）
-- 1問ぶんの時間＝前の解答（冒険の最初の問題は冒険の開始）からその解答まで。放置しても増えすぎないよう1問10分までにする
-- 解答のたびに足すので、途中でやめた冒険の時間も累計に入る
-- =========================================================
-- T-13 冒険
ALTER TABLE adventures ADD COLUMN IF NOT EXISTS study_seconds    integer     NOT NULL DEFAULT 0 CHECK (study_seconds >= 0);
ALTER TABLE adventures ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now();  -- 開始または最後の解答
-- T-02 利用者
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_study_seconds integer NOT NULL DEFAULT 0 CHECK (total_study_seconds >= 0);
-- これまでの冒険は解答履歴から同じ決まりで数え直す（説明の解答時刻は採点が終わった時刻なので、少し長めに出る）
WITH steps AS (
  SELECT l.adventure_id,
         LEAST(GREATEST(EXTRACT(EPOCH FROM (l.answered_at - COALESCE(
           LAG(l.answered_at) OVER (PARTITION BY l.adventure_id ORDER BY l.answered_at, l.answer_id), a.started_at))), 0), 600) AS sec
  FROM answer_logs l JOIN adventures a ON a.adventure_id = l.adventure_id
), per AS (
  SELECT adventure_id, round(sum(sec))::int AS sec FROM steps GROUP BY adventure_id
)
UPDATE adventures a SET study_seconds = per.sec FROM per WHERE a.adventure_id = per.adventure_id;
UPDATE adventures a SET last_activity_at = COALESCE(
  (SELECT max(l.answered_at) FROM answer_logs l WHERE l.adventure_id = a.adventure_id), a.started_at);
UPDATE users u SET total_study_seconds = s.sec
FROM (SELECT user_id, sum(study_seconds)::int AS sec FROM adventures GROUP BY user_id) s
WHERE u.user_id = s.user_id;

INSERT INTO schema_migrations (version, description) VALUES ('V005', 'study time') ON CONFLICT DO NOTHING;
