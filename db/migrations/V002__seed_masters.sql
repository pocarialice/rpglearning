INSERT INTO partners (persona, label, default_name) VALUES
  ('encourage', '励まし型', 'ミナ'),
  ('logic',     '論理型',   'セージ'),
  ('rival',     'ライバル型', 'レン')
ON CONFLICT (persona) DO NOTHING;

INSERT INTO quest_defs (quest_code, title, target, reward_exp, sort_order) VALUES
  ('Q-01', '択一を5問解く',              5,    20, 1),
  ('Q-02', '択一で3問正解する',            3,    20, 2),
  ('Q-03', 'キーワード説明を1問合格する',      1,    30, 3),
  ('Q-04', '今日の復習をすべて終える',        NULL, 30, 4),
  ('Q-05', '新しい問題に3問挑戦する',         3,    20, 5)
ON CONFLICT (quest_code) DO NOTHING;

INSERT INTO badge_defs (badge_code, category, tier, name, threshold, condition_text, phase, sort_order) VALUES
  ('mastery_bronze',  'mastery',  'bronze', '習得の証（銅）',     10,  '習得済みの問題が10問',          1, 1),
  ('mastery_silver',  'mastery',  'silver', '習得の証（銀）',     50,  '習得済みの問題が50問',          1, 2),
  ('mastery_gold',    'mastery',  'gold',   '習得の証（金）',     100, '習得済みの問題が100問',         1, 3),
  ('streak_bronze',   'streak',   'bronze', '継続の証（銅）',     7,   '7日連続で1問以上解答',          1, 4),
  ('streak_silver',   'streak',   'silver', '継続の証（銀）',     30,  '30日連続で1問以上解答',         1, 5),
  ('streak_gold',     'streak',   'gold',   '継続の証（金）',     100, '100日連続で1問以上解答',        1, 6),
  ('coverage_bronze', 'coverage', 'bronze', '網羅の証（銅）',     50,  'コース網羅率50%',             2, 7),
  ('coverage_silver', 'coverage', 'silver', '網羅の証（銀）',     80,  'コース網羅率80%',             2, 8),
  ('coverage_gold',   'coverage', 'gold',   '網羅の証（金）',     100, 'コース網羅率100%',            2, 9),
  ('explain_bronze',  'explain',  'bronze', '説明の達人（銅）',    1,   '説明で100点を1回',            2, 10),
  ('explain_silver',  'explain',  'silver', '説明の達人（銀）',    5,   '説明で100点を5回',            2, 11),
  ('explain_gold',    'explain',  'gold',   '説明の達人（金）',    20,  '説明で100点を20回',           2, 12),
  ('review_bronze',   'review',   'bronze', '忘却への勝利（銅）',   1,   '30日後の復習に初めて正解',        2, 13),
  ('review_silver',   'review',   'silver', '忘却への勝利（銀）',   10,  '30日後の復習に10回正解',        2, 14),
  ('review_gold',     'review',   'gold',   '忘却への勝利（金）',   50,  '30日後の復習に50回正解',        2, 15)
ON CONFLICT (badge_code) DO NOTHING;

INSERT INTO schema_migrations (version, description) VALUES ('V002', 'seed masters') ON CONFLICT DO NOTHING;
