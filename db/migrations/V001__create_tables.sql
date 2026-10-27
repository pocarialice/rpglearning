-- =========================================================
-- V001__create_tables.sql  RPG学習アプリ テーブル作成
-- 対象: PostgreSQL 16以降（さくらのクラウド データベースアプライアンス） / データベース rpg
-- =========================================================
-- T-24 適用済みマイグレーション
CREATE TABLE IF NOT EXISTS schema_migrations (
  version      text        PRIMARY KEY,                 -- 例: V001
  description  text        NOT NULL,
  release_no   text,                                    -- 例: 20261105-01
  applied_at   timestamptz NOT NULL DEFAULT now()
);

-- T-01 パートナー（マスタ）
CREATE TABLE IF NOT EXISTS partners (
  persona       text        PRIMARY KEY CHECK (persona IN ('encourage', 'logic', 'rival')),
  label         text        NOT NULL,                   -- 励まし型など
  default_name  text        NOT NULL CHECK (char_length(default_name) BETWEEN 1 AND 10),
  image_key     text,                                   -- オブジェクトストレージ assets の partners/... なければNULL
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- T-06 コース
CREATE TABLE IF NOT EXISTS courses (
  course_id      bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name           text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 50),
  certification  text        NOT NULL CHECK (char_length(certification) BETWEEN 1 AND 100),
  description    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- T-02 利用者
CREATE TABLE IF NOT EXISTS users (
  user_id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  auth_sub             text        NOT NULL UNIQUE,      -- JWT の sub（作成時にアプリが UUID を振る）
  email                text        NOT NULL CHECK (char_length(email) <= 254),
  full_name            text        NOT NULL CHECK (char_length(full_name) BETWEEN 1 AND 50),
  nickname             text        CHECK (char_length(nickname) BETWEEN 2 AND 12),  -- コース内の重複はアプリで確認
  status               text        NOT NULL DEFAULT 'invited'
                                   CHECK (status IN ('invited', 'active', 'deleted')),
  deleted_at           timestamptz,
  delete_scheduled_on  date,                            -- 論理削除日+30日（JST）
  partner_persona      text        REFERENCES partners (persona),
  partner_name         text        CHECK (char_length(partner_name) BETWEEN 1 AND 10),
  current_course_id    bigint      REFERENCES courses (course_id) ON DELETE SET NULL,
  total_exp            integer     NOT NULL DEFAULT 0 CHECK (total_exp >= 0),
  level                integer     NOT NULL DEFAULT 1 CHECK (level >= 1),
  streak_days          integer     NOT NULL DEFAULT 0 CHECK (streak_days >= 0),
  streak_checked_on    date,                            -- 継続日数を最後に更新したJST日付
  last_active_on       date,                            -- 最後に1問以上解答したJST日付
  last_login_at        timestamptz,
  daily_message        text,                            -- その日のひとこと
  daily_message_on     date,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_delete_chk CHECK (
    (status = 'deleted' AND delete_scheduled_on IS NOT NULL AND deleted_at IS NOT NULL)
    OR (status <> 'deleted' AND delete_scheduled_on IS NULL AND deleted_at IS NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq      ON users (lower(email));
CREATE INDEX IF NOT EXISTS users_purge_idx     ON users (delete_scheduled_on) WHERE status = 'deleted';

-- T-03 利用者のロール（認可の正。ログイン時にアクセストークンの groups にも入れる）
CREATE TABLE IF NOT EXISTS user_roles (
  user_id  bigint NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
  role     text   NOT NULL CHECK (role IN ('learner', 'course_admin', 'system_admin')),
  PRIMARY KEY (user_id, role)
);

-- T-04 通知設定
CREATE TABLE IF NOT EXISTS notify_settings (
  user_id        bigint      PRIMARY KEY REFERENCES users (user_id) ON DELETE CASCADE,
  email_enabled  boolean     NOT NULL DEFAULT true,
  send_time      time        NOT NULL DEFAULT '07:30'
                             CHECK (send_time BETWEEN '06:00' AND '22:00'
                                    AND EXTRACT(MINUTE FROM send_time) IN (0, 30)
                                    AND EXTRACT(SECOND FROM send_time) = 0),
  push_enabled   boolean     NOT NULL DEFAULT false,    -- Phase 2
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- T-05 ログイン記録
CREATE TABLE IF NOT EXISTS login_logs (
  login_id      bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       bigint      NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
  logged_in_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_logs_user_idx ON login_logs (user_id, logged_in_at DESC);

-- T-07 受講
CREATE TABLE IF NOT EXISTS enrollments (
  user_id      bigint      NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
  course_id    bigint      NOT NULL REFERENCES courses (course_id) ON DELETE CASCADE,
  enrolled_on  date        NOT NULL,                    -- JST日付
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, course_id)
);
CREATE INDEX IF NOT EXISTS enrollments_course_idx ON enrollments (course_id);

-- T-08 コース担当
CREATE TABLE IF NOT EXISTS course_admins (
  course_id    bigint      NOT NULL REFERENCES courses (course_id) ON DELETE CASCADE,
  user_id      bigint      NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
  assigned_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, user_id)
);
CREATE INDEX IF NOT EXISTS course_admins_user_idx ON course_admins (user_id);

-- T-09 取り込み
CREATE TABLE IF NOT EXISTS import_jobs (
  import_id        bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_id        bigint      NOT NULL REFERENCES courses (course_id) ON DELETE CASCADE,
  created_by       bigint      REFERENCES users (user_id) ON DELETE SET NULL,
  source_type      text        NOT NULL CHECK (source_type IN ('pdf', 'image', 'text')),
  file_name        text        NOT NULL,
  s3_key           text        NOT NULL,                -- オブジェクトストレージ（S3互換）のキー
  status           text        NOT NULL DEFAULT 'waiting'
                               CHECK (status IN ('waiting', 'extracting', 'done', 'failed')),
  extracted_count  integer     NOT NULL DEFAULT 0 CHECK (extracted_count >= 0),
  error_message    text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS import_jobs_course_idx ON import_jobs (course_id, created_at DESC);

-- T-10 問題
CREATE TABLE IF NOT EXISTS questions (
  question_id     bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,  -- 登録順＝出題順
  course_id       bigint      NOT NULL REFERENCES courses (course_id) ON DELETE CASCADE,
  import_id       bigint      REFERENCES import_jobs (import_id) ON DELETE SET NULL,
  body            text        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  correct_choice  smallint    CHECK (correct_choice BETWEEN 1 AND 4),   -- 下書きではNULL可
  explanation     text        NOT NULL DEFAULT '',
  status          text        NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'needs_review', 'published', 'archived')),
  published_at    timestamptz,
  updated_by      bigint      REFERENCES users (user_id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT questions_publish_chk CHECK (
    status NOT IN ('published', 'archived')
    OR (correct_choice IS NOT NULL AND published_at IS NOT NULL AND explanation <> '')
  )
);
CREATE INDEX IF NOT EXISTS questions_course_status_idx ON questions (course_id, status, question_id);
CREATE INDEX IF NOT EXISTS questions_import_idx        ON questions (import_id);

-- T-11 選択肢
CREATE TABLE IF NOT EXISTS choices (
  choice_id    bigint   GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  question_id  bigint   NOT NULL REFERENCES questions (question_id) ON DELETE CASCADE,
  choice_no    smallint NOT NULL CHECK (choice_no BETWEEN 1 AND 10),  -- 公開時は1〜4がそろう
  body         text     NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  UNIQUE (question_id, choice_no)
);

-- T-12 キーワード（1問につき最大3つ）
CREATE TABLE IF NOT EXISTS keywords (
  keyword_id   bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  question_id  bigint      NOT NULL REFERENCES questions (question_id) ON DELETE CASCADE,
  sort_order   smallint    NOT NULL CHECK (sort_order BETWEEN 1 AND 3),
  keyword      text        NOT NULL CHECK (char_length(keyword) BETWEEN 1 AND 50),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, sort_order)
);

-- T-13 冒険（1回10問）
CREATE TABLE IF NOT EXISTS adventures (
  adventure_id  bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       bigint      NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
  course_id     bigint      NOT NULL REFERENCES courses (course_id) ON DELETE CASCADE,
  served_count  smallint    NOT NULL DEFAULT 0 CHECK (served_count BETWEEN 0 AND 10),
  last_kind     text        CHECK (last_kind IN ('choice', 'explain')),
  served        jsonb       NOT NULL DEFAULT '[]',      -- [{"k":"choice","q":42},{"k":"explain","kw":123}]
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz
);
CREATE INDEX IF NOT EXISTS adventures_user_idx ON adventures (user_id, started_at DESC);

-- T-14 解答履歴
CREATE TABLE IF NOT EXISTS answer_logs (
  answer_id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id           bigint      NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
  course_id         bigint      NOT NULL REFERENCES courses (course_id) ON DELETE CASCADE,
  question_id       bigint      NOT NULL REFERENCES questions (question_id) ON DELETE CASCADE,
  keyword_id        bigint      REFERENCES keywords (keyword_id) ON DELETE SET NULL,
  adventure_id      bigint      REFERENCES adventures (adventure_id) ON DELETE SET NULL,
  kind              text        NOT NULL CHECK (kind IN ('choice', 'explain')),
  selected_choice   smallint    CHECK (selected_choice BETWEEN 1 AND 4),
  is_correct        boolean     NOT NULL,              -- 説明は60点以上で true
  score             smallint    CHECK (score BETWEEN 0 AND 100),
  explanation_text  text,                               -- 説明文（学習履歴として保持）
  is_review         boolean     NOT NULL DEFAULT false,
  is_new            boolean     NOT NULL DEFAULT false,
  answered_on       date        NOT NULL,              -- JST日付
  answered_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT answer_logs_kind_chk CHECK (
    (kind = 'choice'  AND selected_choice IS NOT NULL AND score IS NULL)
    OR (kind = 'explain' AND score IS NOT NULL AND explanation_text IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS answer_logs_user_course_idx ON answer_logs (user_id, course_id, kind, question_id);
CREATE INDEX IF NOT EXISTS answer_logs_user_date_idx   ON answer_logs (user_id, answered_on);

-- T-15 復習項目（択一は 学習者×問題、説明は 学習者×キーワード）
CREATE TABLE IF NOT EXISTS review_items (
  review_id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id           bigint      NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
  course_id         bigint      NOT NULL REFERENCES courses (course_id) ON DELETE CASCADE,
  kind              text        NOT NULL CHECK (kind IN ('choice', 'explain')),
  question_id       bigint      NOT NULL REFERENCES questions (question_id) ON DELETE CASCADE,
  keyword_id        bigint      REFERENCES keywords (keyword_id) ON DELETE CASCADE,
  stage             smallint    NOT NULL CHECK (stage BETWEEN 1 AND 6),   -- 6 = 習得済み
  next_review_on    date,                               -- 習得済みはNULL
  answer_count      integer     NOT NULL DEFAULT 0 CHECK (answer_count >= 0),
  correct_count     integer     NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
  last_answered_on  date        NOT NULL,
  mastered_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT review_items_kind_chk CHECK (
    (kind = 'choice' AND keyword_id IS NULL) OR (kind = 'explain' AND keyword_id IS NOT NULL)
  ),
  CONSTRAINT review_items_stage_chk CHECK (
    (stage = 6 AND next_review_on IS NULL) OR (stage < 6 AND next_review_on IS NOT NULL)
  ),
  CONSTRAINT review_items_count_chk CHECK (correct_count <= answer_count)
);
CREATE UNIQUE INDEX IF NOT EXISTS review_items_choice_uq  ON review_items (user_id, question_id) WHERE kind = 'choice';
CREATE UNIQUE INDEX IF NOT EXISTS review_items_explain_uq ON review_items (user_id, keyword_id)  WHERE kind = 'explain';
CREATE INDEX IF NOT EXISTS review_items_due_idx ON review_items (user_id, course_id, kind, next_review_on) WHERE stage < 6;

-- T-16 採点ジョブ
CREATE TABLE IF NOT EXISTS grading_jobs (
  grading_id        bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id           bigint      NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
  course_id         bigint      NOT NULL REFERENCES courses (course_id) ON DELETE CASCADE,
  keyword_id        bigint      NOT NULL REFERENCES keywords (keyword_id) ON DELETE CASCADE,
  adventure_id      bigint      REFERENCES adventures (adventure_id) ON DELETE SET NULL,
  explanation_text  text        NOT NULL,
  status            text        NOT NULL DEFAULT 'processing'
                                CHECK (status IN ('processing', 'done', 'failed')),
  failure_reason    text        CHECK (failure_reason IN ('timeout', 'ai_timeout', 'ai_error')),
  result            jsonb,                              -- A-10 の応答の形
  created_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz
);
CREATE INDEX IF NOT EXISTS grading_jobs_user_idx    ON grading_jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS grading_jobs_created_idx ON grading_jobs (created_at);

-- T-17 EXP獲得記録（週間ランキングの元データ）
CREATE TABLE IF NOT EXISTS exp_logs (
  exp_log_id   bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      bigint      NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
  course_id    bigint      NOT NULL REFERENCES courses (course_id) ON DELETE CASCADE,
  reason       text        NOT NULL CHECK (reason IN ('choice', 'explain', 'quest')),
  ref_id       bigint,                                  -- answer_id または user_quest_id
  exp          integer     NOT NULL CHECK (exp > 0),
  is_review    boolean     NOT NULL DEFAULT false,
  earned_week  date        NOT NULL,                    -- 週の開始日（月曜・JST）
  earned_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exp_logs_week_idx ON exp_logs (course_id, earned_week, user_id);
CREATE INDEX IF NOT EXISTS exp_logs_user_idx ON exp_logs (user_id, earned_at DESC);

-- T-18 週間ランキング履歴
CREATE TABLE IF NOT EXISTS weekly_rankings (
  course_id    bigint      NOT NULL REFERENCES courses (course_id) ON DELETE CASCADE,
  week_start   date        NOT NULL,                    -- 月曜（JST）
  user_id      bigint      NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
  weekly_exp   integer     NOT NULL CHECK (weekly_exp > 0),
  rank         integer     NOT NULL CHECK (rank >= 1),
  nickname     text        NOT NULL,                    -- 確定時点のニックネーム
  closed_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, week_start, user_id),
  CONSTRAINT weekly_rankings_monday_chk CHECK (EXTRACT(ISODOW FROM week_start) = 1)
);
CREATE INDEX IF NOT EXISTS weekly_rankings_rank_idx ON weekly_rankings (course_id, week_start, rank);

-- T-19 クエスト定義（マスタ）
CREATE TABLE IF NOT EXISTS quest_defs (
  quest_code   text     PRIMARY KEY CHECK (quest_code ~ '^Q-[0-9]{2}$'),
  title        text     NOT NULL,
  target       smallint,                                -- NULLは割り当て時に決める（Q-04）
  reward_exp   integer  NOT NULL CHECK (reward_exp > 0),
  is_active    boolean  NOT NULL DEFAULT true,
  sort_order   smallint NOT NULL
);

-- T-20 割り当てクエスト
CREATE TABLE IF NOT EXISTS user_quests (
  user_quest_id  bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        bigint      NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
  quest_on       date        NOT NULL,                  -- JST日付
  quest_code     text        NOT NULL REFERENCES quest_defs (quest_code),
  target         smallint    NOT NULL CHECK (target >= 1),
  progress       smallint    NOT NULL DEFAULT 0 CHECK (progress >= 0),
  achieved_at    timestamptz,
  UNIQUE (user_id, quest_on, quest_code)
);

-- T-21 バッジ定義（マスタ）
CREATE TABLE IF NOT EXISTS badge_defs (
  badge_code      text     PRIMARY KEY,                 -- 例: streak_bronze
  category        text     NOT NULL CHECK (category IN ('mastery', 'streak', 'coverage', 'explain', 'review')),
  tier            text     NOT NULL CHECK (tier IN ('bronze', 'silver', 'gold')),
  name            text     NOT NULL,
  threshold       integer  NOT NULL CHECK (threshold > 0),
  condition_text  text     NOT NULL,
  phase           smallint NOT NULL CHECK (phase IN (1, 2)),
  sort_order      smallint NOT NULL,
  UNIQUE (category, tier)
);

-- T-22 獲得バッジ
CREATE TABLE IF NOT EXISTS user_badges (
  user_id     bigint      NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
  badge_code  text        NOT NULL REFERENCES badge_defs (badge_code),
  earned_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_code)
);

-- T-23 操作記録（管理者の操作）
CREATE TABLE IF NOT EXISTS audit_logs (
  audit_id       bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id  bigint      REFERENCES users (user_id) ON DELETE SET NULL,
  action         text        NOT NULL CHECK (action IN (
                   'question.update', 'question.publish', 'question.delete',
                   'user.create', 'user.role', 'user.delete', 'user.restore', 'user.purge',
                   'course.create', 'course.update', 'course.assign',
                   'partner.image', 'dashboard.csv')),
  target_type    text        NOT NULL,
  target_id      bigint,
  detail         jsonb       NOT NULL DEFAULT '{}',     -- 氏名・メールは入れない
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs (created_at DESC);

INSERT INTO schema_migrations (version, description) VALUES ('V001', 'create tables') ON CONFLICT DO NOTHING;

