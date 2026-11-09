-- =========================================================
-- V009__drop_notify_settings.sql  通知メール（S-10 通知設定・B-03 メール送信）を機能ごと削除した（2026-11）
-- 送信時刻などの設定は消え、戻せない（dev のテスト用のデータだけだったため）
-- =========================================================
-- T-04 通知設定
DROP TABLE IF EXISTS notify_settings;

INSERT INTO schema_migrations (version, description) VALUES ('V009', 'drop notify settings') ON CONFLICT DO NOTHING;
