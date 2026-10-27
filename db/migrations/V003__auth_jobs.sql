-- =========================================================
-- V003__auth_jobs.sql  さくら版の基盤（ログイン・ジョブキュー・定期処理の記録）
-- Cognito・SQS・EventBridge Scheduler の代わりにアプリと DB で持つ（詳細設計書 3.7・3.8）
-- =========================================================
-- T-02 利用者（ログイン用の列を追加）
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash            text;                          -- scrypt。招待前はNULL
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password     boolean     NOT NULL DEFAULT true;  -- 仮パスワードのとき true
ALTER TABLE users ADD COLUMN IF NOT EXISTS temp_password_expires_at timestamptz;                   -- 仮パスワードの期限（7日）
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count       integer     NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0);
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until             timestamptz;                   -- 5回続けて失敗したら15分
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at      timestamptz;
-- T-23 操作記録（再招待を追加。名前のない CHECK は PostgreSQL が audit_logs_action_check と名づける）
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_check;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_check CHECK (action IN (
  'question.update', 'question.publish', 'question.delete',
  'user.create', 'user.role', 'user.delete', 'user.restore', 'user.purge', 'user.reinvite',
  'course.create', 'course.update', 'course.assign',
  'partner.image', 'dashboard.csv'));
-- T-25 リフレッシュトークン（値そのものは保存せず SHA-256 だけを持つ）
CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  token_hash   text        PRIMARY KEY,
  user_id      bigint      NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
  expires_at   timestamptz NOT NULL,                     -- 発行から7日
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_refresh_tokens_user_idx ON auth_refresh_tokens (user_id);
-- T-26 パスワード再設定（メールのリンクの値の SHA-256。1回だけ使える）
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash   text        PRIMARY KEY,
  user_id      bigint      NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
  expires_at   timestamptz NOT NULL,                     -- 発行から1時間
  used_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
-- T-27 ジョブキュー（採点・取り込み）。ワーカーが FOR UPDATE SKIP LOCKED で1件ずつ取り出す
CREATE TABLE IF NOT EXISTS jobs (
  job_id        bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind          text        NOT NULL CHECK (kind IN ('grading', 'import')),
  payload       jsonb       NOT NULL,                    -- {"gradingId":1} / {"importId":1}
  status        text        NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  attempts      integer     NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts  integer     NOT NULL DEFAULT 1 CHECK (max_attempts >= 1),   -- 採点1回、取り込み3回
  run_after     timestamptz NOT NULL DEFAULT now(),       -- やり直しの待ち
  locked_until  timestamptz,                              -- 処理中のワーカーが落ちたときに取り戻す期限
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_ready_idx ON jobs (run_after, job_id) WHERE status IN ('queued', 'running');
-- T-28 定期処理の実行記録（同じ枠を二重に動かさない）
CREATE TABLE IF NOT EXISTS schedule_runs (
  name         text        NOT NULL,                     -- daily / mail
  slot         text        NOT NULL,                     -- 例: 2026-11-05 / 2026-11-05T0730
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  result       jsonb,
  PRIMARY KEY (name, slot)
);

INSERT INTO schema_migrations (version, description) VALUES ('V003', 'auth jobs') ON CONFLICT DO NOTHING;
