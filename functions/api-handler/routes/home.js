// A-05 ホーム（レベル・ひとこと・受講中のコース・クエスト・今日の復習数）
import { ok } from '../../shared/util/http.js'
import { addDays } from '../../shared/util/date-jst.js'
import { levelInfo } from '../../shared/domain/exp.js'
import { converse } from '../../shared/ai/client.js'
import { buildDailyMessagePrompt, fallbackMessage, pickHighlight, messageSlotOf } from '../../shared/ai/prompts/daily-message.js'
import * as users from '../../shared/db/repositories/users.js'
import * as quests from '../../shared/db/repositories/quests.js'
import * as reviews from '../../shared/db/repositories/reviews.js'
import * as answers from '../../shared/db/repositories/answers.js'
import * as exp from '../../shared/db/repositories/exp.js'
import * as courses from '../../shared/db/repositories/courses.js'
import { encodeId, PREFIX } from '../../shared/util/ids.js'
import { coveragePct } from './courses.js'
// ひとことの AI の設定（scripts/check-ai.mjs も同じ値で確かめる）。上限は推論モデルの考える分も含む
export const DAILY_MESSAGE_AI = { maxTokens: 800, temperature: 0.8, timeoutMs: 5000 }
export async function get(ctx) {
  const { user, today } = ctx
  const persona = user.partnerPersona ?? 'encourage'
  const [todayQuests, review, course] = await Promise.all([
    quests.listToday(user.userId, today),
    reviews.countDueByKind(user.userId, user.currentCourseId, today),
    courses.findProgress(user.currentCourseId, user.userId)
  ])
  const text = await dailyMessage(ctx, persona)
  return ok({
    ...levelInfo(user.totalExp),
    totalExp: user.totalExp,
    streakDays: user.streakDays ?? 0,
    message: { partnerName: user.partnerName ?? null, persona, text },
    course: course ? {
      id: encodeId(PREFIX.course, course.courseId), name: course.name, certification: course.certification,
      questionCount: course.questionCount, coveragePct: coveragePct(course.learnedCount, course.questionCount)
    } : null,
    quests: todayQuests.map((q) => ({ id: q.questCode, title: q.title, progress: q.progress, target: q.target, done: !!q.achieved, reward: q.rewardExp })),
    review
  })
}
// 時間帯（朝・昼・夜）ごとに1回生成して保存し、同じ日の同じ時間帯は使い回す。失敗したら定型文（保存しない）
async function dailyMessage(ctx, persona) {
  const { user, today, weekStart, now, log } = ctx
  const { slot: timeSlot, on } = messageSlotOf(now)
  if (user.dailyMessageOn === on && user.dailyMessageSlot === timeSlot && user.dailyMessage) return user.dailyMessage
  const level = levelInfo(user.totalExp).level
  let stats = { level }
  try {
    const [todayAnswers, yesterdayAnswers, weeklyExp] = await Promise.all([
      answers.countOnDate(user.userId, today),
      answers.countOnDate(user.userId, addDays(today, -1)),
      exp.weeklyTotalForUser(user.userId, weekStart)
    ])
    stats = { todayAnswers, yesterdayAnswers, weeklyExp, level }
    const prompt = buildDailyMessagePrompt({ persona, name: user.partnerName ?? '', timeSlot, ...stats })
    const res = await converse({
      modelId: process.env.MODEL_LIGHT, system: prompt.system, messages: [{ role: 'user', content: [{ text: prompt.user }] }],
      ...DAILY_MESSAGE_AI, purpose: 'daily-message', logger: log
    })
    const text = res.text.trim()
    if (!text) throw new Error('empty')
    await users.setDailyMessage(user.userId, text, on, timeSlot)
    return text
  } catch (err) {
    log.warn({ msg: 'daily-message.fallback', code: err.code ?? 'AI_ERROR' })
    return fallbackMessage(persona, pickHighlight(stats))
  }
}
