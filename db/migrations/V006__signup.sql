-- =========================================================
-- V006__signup.sql  利用者が自分でアカウントを作る（詳細設計書 5.4 A-36・A-37）
-- 入力を確認待ちとして置き、メールのリンクを開いたら users を作る
-- =========================================================
-- T-29 アカウント作成の確認待ち（メールのリンクの値の SHA-256。1回だけ使える）
CREATE TABLE IF NOT EXISTS signup_requests (
  token_hash     text        PRIMARY KEY,
  email          text        NOT NULL CHECK (char_length(email) <= 254),
  full_name      text        NOT NULL CHECK (char_length(full_name) BETWEEN 1 AND 50),
  password_hash  text,                                   -- scrypt。登録済みのメールアドレスへの案内のときは NULL
  expires_at     timestamptz NOT NULL,                   -- 発行から24時間
  used_at        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS signup_requests_email_idx ON signup_requests (lower(email), created_at DESC);
-- T-23 操作記録（自分でのアカウント作成を追加）
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_check;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_check CHECK (action IN (
  'question.update', 'question.publish', 'question.delete',
  'user.create', 'user.role', 'user.delete', 'user.restore', 'user.purge', 'user.reinvite', 'user.signup',
  'course.create', 'course.update', 'course.assign',
  'partner.image', 'dashboard.csv'));

INSERT INTO schema_migrations (version, description) VALUES ('V006', 'signup') ON CONFLICT DO NOTHING;
