// 学習サマリ（A-13・A-14）の組み立て。解答の一覧から学習時間・学習した内容・復習するべき観点を出し、ノートアプリに貼れる Markdown にする
// 学習時間は「冒険の開始 → 1問目の解答 → 2問目の解答 …」の間隔の合計で、1問10分まで（冒険のまとめ S-15 の学習時間と同じ決まり。V005）
import { parseDbTimestamp } from '../util/date-jst.js'
export const IDLE_CAP_MS = 10 * 60 * 1000
export const SNIPPET_LENGTH = 40
const toMs = (v) => parseDbTimestamp(v).getTime()
export function studySeconds(rows, cap = IDLE_CAP_MS) {
  const groups = new Map()
  for (const r of rows) {
    const key = r.adventureId ?? `a${r.answerId}`
    if (!groups.has(key)) groups.set(key, { start: r.adventureStartedAt ? toMs(r.adventureStartedAt) : null, times: [] })
    groups.get(key).times.push(toMs(r.answeredAt))
  }
  let ms = 0
  for (const g of groups.values()) {
    const times = g.times.sort((a, b) => a - b)
    let prev = g.start ?? times[0]
    for (const t of times) {
      ms += Math.min(Math.max(t - prev, 0), cap)
      prev = t
    }
  }
  return Math.round(ms / 1000)
}
// 画面の formatDuration（web/js/logic/format.js）と同じ書き方
export function formatStudyTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  if (h > 0) return `${h}時間${m}分`
  if (m > 0) return `${m}分${total % 60}秒`
  return `${total % 60}秒`
}
// 問題文の頭だけを1行にする（タグ・改行を落とし、Markdown の記号として読まれないようにする）
export function snippet(text, length = SNIPPET_LENGTH) {
  const s = String(text ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  const cut = [...s].length > length ? `${[...s].slice(0, length).join('')}…` : s
  return cut.replace(/([\\`*_[\]#|])/g, '\\$1')
}
const slash = (d) => (d ? String(d).replaceAll('-', '/') : '')
const nextReview = (r) => (r.nextReviewOn && r.reviewStage < 6 ? `（次の復習 ${slash(r.nextReviewOn)}）` : '')
function contentLine(r) {
  const review = r.isReview ? '（復習）' : ''
  if (r.kind === 'choice') return `- 択一${review}：${snippet(r.questionBody)} … ${r.isCorrect ? '○ 正解' : '× 不正解'}`
  return `- 説明${review}：${snippet(r.keyword ?? '')} … ${Number(r.score)}点 ${r.isCorrect ? '合格' : '不合格'}`
}
// 復習するべき観点：間違えた択一と不合格の説明。同じ問題・キーワードは最初の1つだけ
export function reviewPoints(rows) {
  const seen = new Set()
  const points = []
  for (const r of rows) {
    if (r.isCorrect) continue
    const key = r.kind === 'choice' ? `q${r.questionId}` : `k${r.keywordId}`
    if (seen.has(key)) continue
    seen.add(key)
    if (r.kind === 'choice') {
      const answer = r.correctBody ? `正解は「${snippet(r.correctBody)}」` : '解説を読み直す'
      points.push({ kind: 'choice', label: snippet(r.questionBody), text: `- 択一「${snippet(r.questionBody)}」：${answer}${nextReview(r)}` })
    } else {
      const missing = (r.missingPoints ?? []).map((m) => snippet(m)).filter(Boolean)
      const body = missing.length ? `足りない観点は ${missing.join('、')}` : '模範説明を読み直す'
      points.push({ kind: 'explain', label: snippet(r.keyword ?? ''), missing, text: `- 説明「${snippet(r.keyword ?? '')}」（${Number(r.score)}点）：${body}${nextReview(r)}` })
    }
  }
  return points
}
export function tally(rows) {
  const choice = rows.filter((r) => r.kind === 'choice')
  const explain = rows.filter((r) => r.kind === 'explain')
  return {
    answerCount: rows.length, correctCount: rows.filter((r) => r.isCorrect).length,
    choiceCount: choice.length, choiceCorrect: choice.filter((r) => r.isCorrect).length,
    explainCount: explain.length, explainPassed: explain.filter((r) => r.isCorrect).length,
    reviewCount: rows.filter((r) => r.isReview).length
  }
}
// title：見出し（「冒険のまとめ」など）、date：'YYYY-MM-DD'、comment：{ partnerName, text } または null
export function buildMarkdown({ title, date, rows, seconds, comment }) {
  const t = tally(rows)
  const courses = [...new Set(rows.map((r) => r.courseName).filter(Boolean))]
  const lines = [
    `# 学習サマリ ${slash(date)}（${title}）`,
    `- 学習日：${slash(date)}`,
    `- 学習時間：${formatStudyTime(seconds)}`
  ]
  if (courses.length) lines.push(`- コース：${courses.map((c) => snippet(c, 60)).join('、')}`)
  lines.push('## 学習した内容')
  lines.push(`- 解いた問題：${t.answerCount}問（択一 ${t.choiceCount}問・説明 ${t.explainCount}問、うち復習 ${t.reviewCount}問）`)
  lines.push(`- 結果：択一 ${t.choiceCorrect}/${t.choiceCount}問 正解、説明 ${t.explainPassed}/${t.explainCount}問 合格`)
  for (const r of rows) lines.push(`  ${contentLine(r)}`)
  lines.push('## 復習するべき観点')
  const points = reviewPoints(rows)
  if (points.length) for (const p of points) lines.push(p.text)
  else lines.push('- 間違えた問題はありません。次の復習日に解き直して定着させましょう')
  if (comment?.text) {
    lines.push(`## ${comment.partnerName ? `${snippet(comment.partnerName, 20)}からのコメント` : 'パートナーのコメント'}`)
    lines.push(String(comment.text).replace(/\s*\n+\s*/g, ' ').trim())
  }
  return lines.join('\n')
}
