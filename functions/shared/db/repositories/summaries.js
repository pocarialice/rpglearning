// 学習サマリ（A-12b・A-12c）に使う解答の一覧。answer_logs（T-14）に問題・キーワード・復習項目・採点結果を付けて返す
import { defaultDb, camelRows, date } from './_base.js'
// 説明の足りない観点は、同じ解答を書き込んだ採点（grading_jobs.result）から引く。採点の完了と解答の記録は同じトランザクションなので時刻がいちばん近いものを選ぶ
const SELECT = `SELECT a.answer_id, a.course_id, c.name AS course_name, a.adventure_id, ad.started_at AS adventure_started_at,
    a.kind, a.question_id, q.body AS question_body, q.correct_choice,
    (SELECT ch.body FROM choices ch WHERE ch.question_id = a.question_id AND ch.choice_no = q.correct_choice) AS correct_body,
    a.keyword_id, k.keyword, a.selected_choice, a.is_correct, a.score, a.is_review, a.answered_on, a.answered_at,
    r.stage AS review_stage, r.next_review_on,
    (SELECT g.result -> 'missingPoints' FROM grading_jobs g
      WHERE a.kind = 'explain' AND g.user_id = a.user_id AND g.keyword_id = a.keyword_id AND g.status = 'done'
        AND g.adventure_id IS NOT DISTINCT FROM a.adventure_id
      ORDER BY abs(extract(epoch FROM (g.completed_at - a.answered_at))) LIMIT 1) AS missing_points
  FROM answer_logs a
  JOIN questions q ON q.question_id = a.question_id
  JOIN courses c ON c.course_id = a.course_id
  LEFT JOIN keywords k ON k.keyword_id = a.keyword_id
  LEFT JOIN adventures ad ON ad.adventure_id = a.adventure_id
  LEFT JOIN review_items r ON r.user_id = a.user_id AND r.course_id = a.course_id AND r.kind = a.kind
    AND ((a.kind = 'choice' AND r.question_id = a.question_id) OR (a.kind = 'explain' AND r.keyword_id = a.keyword_id))`
function parse(rows) {
  return camelRows(rows).map((r) => ({
    ...r,
    missingPoints: typeof r.missingPoints === 'string' ? JSON.parse(r.missingPoints) : (r.missingPoints ?? [])
  }))
}
// 1回の冒険の解答（解いた順）。他人の冒険は返さない
export async function listForAdventure(userId, adventureId, db = defaultDb) {
  const rows = await db.query(`${SELECT}
    WHERE a.user_id = :userId AND a.adventure_id = :adventureId ORDER BY a.answered_at, a.answer_id`, { userId, adventureId })
  return parse(rows)
}
// その日（JST）の解答（解いた順）。コースはまたいで返す
export async function listForDate(userId, day, db = defaultDb) {
  const rows = await db.query(`${SELECT}
    WHERE a.user_id = :userId AND a.answered_on = :day ORDER BY a.answered_at, a.answer_id`, { userId, day: date(day) })
  return parse(rows)
}
