// コースごとの実績（A-12d・A-12e・S-08 の受講中のコース）。受講したコースと、解答したことのあるコースを数える
// 学習時間は冒険（T-13）の study_seconds をコースごとに足したもの（V005 と同じ決まり。1問10分まで）
// 網羅率・正答率は学習記録（A-12）と同じく、択一の公開済み問題で数える
import { defaultDb, camelRow, camelRows, date } from './_base.js'
const LIST_SELECT = `WITH mine AS (
    SELECT course_id FROM enrollments WHERE user_id = :userId
    UNION SELECT DISTINCT course_id FROM answer_logs WHERE user_id = :userId
  )
  SELECT c.course_id, c.name, c.certification,
    (SELECT e.enrolled_on FROM enrollments e WHERE e.user_id = :userId AND e.course_id = c.course_id) AS enrolled_on,
    COALESCE((SELECT sum(ad.study_seconds) FROM adventures ad WHERE ad.user_id = :userId AND ad.course_id = c.course_id), 0)::int AS study_seconds,
    (SELECT max(a.answered_on) FROM answer_logs a WHERE a.user_id = :userId AND a.course_id = c.course_id) AS last_studied_on,
    (SELECT count(*) FROM questions q WHERE q.course_id = c.course_id AND q.status = 'published')::int AS published_count,
    ch.answered_questions, ch.choice_count, ch.choice_correct
  FROM mine m
  JOIN courses c ON c.course_id = m.course_id
  LEFT JOIN LATERAL (
    SELECT count(DISTINCT a.question_id)::int AS answered_questions, count(*)::int AS choice_count,
      count(*) FILTER (WHERE a.is_correct)::int AS choice_correct
    FROM answer_logs a JOIN questions q ON q.question_id = a.question_id AND q.status = 'published'
    WHERE a.user_id = :userId AND a.course_id = c.course_id AND a.kind = 'choice'
  ) ch ON true`
// 最後に学習した日が新しい順。まだ解いていないコースは後ろ
export async function listForUser(userId, db = defaultDb) {
  return camelRows(await db.query(`${LIST_SELECT}
    ORDER BY last_studied_on DESC NULLS LAST, c.course_id LIMIT 100`, { userId }))
}
// 1コース分。受講も解答もしていないコースは null
export async function findForUser(userId, courseId, db = defaultDb) {
  const rows = await db.query(`${LIST_SELECT}
    WHERE c.course_id = :courseId`, { userId, courseId })
  return camelRow(rows[0])
}
// 詳細（A-12d）に足す数：冒険の回数・解答の内訳（アーカイブした問題の解答も含む）・習得済み・今日の復習
export async function detailCounts(userId, courseId, today, db = defaultDb) {
  const rows = await db.query(`SELECT
      count(DISTINCT a.adventure_id)::int AS adventure_count,
      count(*)::int AS answer_count,
      count(*) FILTER (WHERE a.is_correct)::int AS correct_count,
      count(*) FILTER (WHERE a.is_review)::int AS review_answer_count,
      count(*) FILTER (WHERE a.kind = 'choice')::int AS choice_count,
      count(*) FILTER (WHERE a.kind = 'choice' AND a.is_correct)::int AS choice_correct,
      count(*) FILTER (WHERE a.kind = 'explain')::int AS explain_count,
      count(*) FILTER (WHERE a.kind = 'explain' AND a.is_correct)::int AS explain_passed,
      round(avg(a.score) FILTER (WHERE a.kind = 'explain'))::int AS explain_avg_score,
      (SELECT count(*) FROM review_items r WHERE r.user_id = :userId AND r.course_id = :courseId
         AND r.kind = 'choice' AND r.stage = 6)::int AS mastered,
      (SELECT count(*) FROM review_items r JOIN questions q ON q.question_id = r.question_id AND q.status = 'published'
         WHERE r.user_id = :userId AND r.course_id = :courseId AND r.stage < 6 AND r.next_review_on <= :today)::int AS due_today
    FROM answer_logs a
    WHERE a.user_id = :userId AND a.course_id = :courseId`, { userId, courseId, today: date(today) })
  return camelRow(rows[0])
}
// 苦手な問題：まだ習得していない復習項目のうち、まちがえた回数が多い順。説明は直近の点数と足りない観点を付ける
export async function listWeak(userId, courseId, limit = 3, db = defaultDb) {
  const rows = camelRows(await db.query(`SELECT r.kind, r.question_id, q.body AS question_body, r.keyword_id, k.keyword, r.stage,
      (r.answer_count - r.correct_count)::int AS miss_count,
      (SELECT a.score FROM answer_logs a WHERE r.kind = 'explain' AND a.user_id = r.user_id AND a.kind = 'explain'
         AND a.keyword_id = r.keyword_id ORDER BY a.answered_at DESC LIMIT 1) AS last_score,
      (SELECT g.result -> 'missingPoints' FROM grading_jobs g WHERE r.kind = 'explain' AND g.user_id = r.user_id
         AND g.keyword_id = r.keyword_id AND g.status = 'done' ORDER BY g.completed_at DESC LIMIT 1) AS missing_points
    FROM review_items r
    JOIN questions q ON q.question_id = r.question_id AND q.status = 'published'
    LEFT JOIN keywords k ON k.keyword_id = r.keyword_id
    WHERE r.user_id = :userId AND r.course_id = :courseId AND r.stage < 6 AND r.answer_count > r.correct_count
    ORDER BY miss_count DESC, r.stage, r.updated_at DESC LIMIT :limit`, { userId, courseId, limit }))
  return rows.map((r) => ({
    ...r,
    missingPoints: typeof r.missingPoints === 'string' ? JSON.parse(r.missingPoints) : (r.missingPoints ?? [])
  }))
}
