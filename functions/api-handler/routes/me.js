// A-01〜A-04、A-12（自分の情報・プロフィール・パートナー・通知・学習記録・バッジ）
import { AppError } from '../../shared/util/errors.js'
import { ok } from '../../shared/util/http.js'
import { encodeId, PREFIX } from '../../shared/util/ids.js'
import { parseDbTimestamp, toIsoJst } from '../../shared/util/date-jst.js'
import { levelInfo } from '../../shared/domain/exp.js'
import { assertValid, validateNickname, validatePartnerName, validateNotifyTime } from '../../shared/util/validators.js'
import { PERSONAS } from '../../shared/ai/persona.js'
import * as users from '../../shared/db/repositories/users.js'
import * as enrollments from '../../shared/db/repositories/enrollments.js'
import * as partners from '../../shared/db/repositories/partners.js'
import * as notify from '../../shared/db/repositories/notify.js'
import * as answers from '../../shared/db/repositories/answers.js'
import * as badges from '../../shared/db/repositories/badges.js'
export const LOGIN_LOG_INTERVAL_MS = 30 * 60 * 1000
export const imageUrl = (key) => (key ? `${process.env.APP_URL}/${key}` : null)
const round1 = (n) => Math.round(n * 10) / 10
export async function get(ctx) {
  const { user, now } = ctx
  const last = await users.lastLoginLogAt(user.userId)
  if (!last || now.getTime() - parseDbTimestamp(last).getTime() > LOGIN_LOG_INTERVAL_MS) {
    await users.touchLogin(user.userId)
  }
  let partner = null
  if (user.partnerPersona) {
    const p = await partners.get(user.partnerPersona)
    partner = { persona: user.partnerPersona, name: user.partnerName, imageUrl: imageUrl(p?.imageKey) }
  }
  return ok({
    userId: encodeId(PREFIX.user, user.userId),
    nickname: user.nickname ?? null,
    roles: user.roles,
    partner,
    currentCourseId: user.currentCourseId ? encodeId(PREFIX.course, user.currentCourseId) : null,
    onboarding: { needNickname: !user.nickname, needCourse: !user.currentCourseId, needPartner: !user.partnerPersona }
  })
}
export async function putProfile(ctx) {
  const body = ctx.body()
  assertValid(validateNickname(body.nickname))
  const nickname = body.nickname.trim()
  const courseIds = await enrollments.listCourseIds(ctx.user.userId)
  if (await enrollments.nicknameTaken(courseIds, nickname, ctx.user.userId)) {
    throw new AppError('CONFLICT', 'このニックネームはすでに使われています', { details: [{ field: 'nickname', code: 'M-08' }] })
  }
  await users.updateNickname(ctx.user.userId, nickname)
  return ok({ nickname })
}
export async function putPartner(ctx) {
  const { persona, name } = ctx.body()
  if (!Object.hasOwn(PERSONAS, persona ?? '')) {
    throw new AppError('VALIDATION_ERROR', undefined, { details: [{ field: 'persona', code: 'INVALID' }] })
  }
  assertValid(validatePartnerName(name))
  let finalName = name
  if (!name) {
    // 名前が空なら初期名。キャラクターを変えずに名前だけ省いたときは今の名前のまま
    finalName = name === undefined && persona === ctx.user.partnerPersona && ctx.user.partnerName
      ? ctx.user.partnerName
      : (await partners.get(persona))?.defaultName ?? PERSONAS[persona].defaultName
  }
  await users.updatePartner(ctx.user.userId, persona, finalName)
  return ok({ persona, name: finalName })
}
export async function getNotify(ctx) {
  const s = await notify.get(ctx.user.userId)
  return ok({ emailEnabled: s?.emailEnabled ?? true, sendTime: s?.sendTime ?? '07:30' })
}
export async function putNotify(ctx) {
  const { emailEnabled, sendTime } = ctx.body()
  if (typeof emailEnabled !== 'boolean') {
    throw new AppError('VALIDATION_ERROR', undefined, { details: [{ field: 'emailEnabled', code: 'INVALID' }] })
  }
  assertValid(validateNotifyTime(sendTime))
  await notify.put(ctx.user.userId, { emailEnabled, sendTime })
  return ok({ emailEnabled, sendTime, note: 'M-09' })
}
export async function stats(ctx) {
  const s = await answers.statsForUser(ctx.user.userId, ctx.user.currentCourseId)
  return ok({
    courseId: encodeId(PREFIX.course, ctx.user.currentCourseId),
    publishedCount: s.publishedCount,
    answeredQuestions: s.answeredQuestions,
    coveragePct: s.publishedCount === 0 ? 0 : round1((100 * s.answeredQuestions) / s.publishedCount),
    answerCount: s.answerCount,
    correctPct: s.answerCount === 0 ? null : round1((100 * s.correctCount) / s.answerCount),
    mastered: s.mastered,
    streakDays: ctx.user.streakDays ?? 0,
    ...levelInfo(ctx.user.totalExp ?? 0),
    totalExp: ctx.user.totalExp ?? 0
  })
}
export async function badges_(ctx) {
  const [defs, owned] = await Promise.all([badges.listDefs(), badges.listOwnedDetail(ctx.user.userId)])
  const earned = new Map(owned.map((b) => [b.badgeCode, b.earnedAt]))
  return ok({
    badges: defs.filter((d) => d.phase === 1).map((d) => ({
      code: d.badgeCode, category: d.category, tier: d.tier, name: d.name, condition: d.conditionText,
      earnedAt: earned.has(d.badgeCode) ? toIsoJst(parseDbTimestamp(earned.get(d.badgeCode))) : null
    }))
  })
}
export { badges_ as badges }
