-- =========================================================
-- V008__google_login.sql  Googleでログイン（詳細設計書 5.4 A-38・A-39）
-- Google の ID トークンの sub を利用者に結びつける。Google だけで登録した人は password_hash が NULL
-- =========================================================
-- T-02 利用者（Google アカウントの sub。1つの Google アカウントは1人の利用者にだけ結びつく）
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub text;
CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_uq ON users (google_sub) WHERE google_sub IS NOT NULL;
-- メールアドレスの重複禁止に、検証用の例外を設ける（functions/shared/auth/google.js の DUPLICATE_EMAILS と同じ値にする）
-- 例外のアドレスは、パスワードの利用者と Google の利用者を別々に持てる
DROP INDEX IF EXISTS users_email_uq;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users (lower(email))
  WHERE lower(email) NOT IN ('pocarialice7148@gmail.com');

INSERT INTO schema_migrations (version, description) VALUES ('V008', 'google login') ON CONFLICT DO NOTHING;
