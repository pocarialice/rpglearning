import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('../../../../../functions/shared/db/repositories/users.js')
vi.mock('../../../../../functions/shared/db/repositories/enrollments.js')
vi.mock('../../../../../functions/shared/db/repositories/partners.js')
vi.mock('../../../../../functions/shared/db/repositories/notify.js')
vi.mock('../../../../../functions/shared/db/repositories/answers.js')
vi.mock('../../../../../functions/shared/db/repositories/badges.js')
import * as users from '../../../../../functions/shared/db/repositories/users.js'
import * as enrollments from '../../../../../functions/shared/db/repositories/enrollments.js'
import * as partners from '../../../../../functions/shared/db/repositories/partners.js'
import * as notify from '../../../../../functions/shared/db/repositories/notify.js'
import * as answers from '../../../../../functions/shared/db/repositories/answers.js'
import * as badges from '../../../../../functions/shared/db/repositories/badges.js'
import { main } from '../../../../../functions/api-handler/index.mjs'
import { httpEvent, parse } from '../../../../fixtures/events/http.js'
import { memoryLogger } from '../../../../helpers/logger.js'
import { NOW } from '../../../../helpers/clock.js'
import { learner } from '../../../../fixtures/users.js'
const call = (opts) => main(httpEvent(opts), { log: memoryLogger(), now: NOW })
const minutesAgo = (m) => new Date(NOW.getTime() - m * 60000).toISOString().replace('T', ' ').replace('Z', '')
const DEFS = [
  ['mastery_bronze', 'mastery', 1], ['mastery_silver', 'mastery', 1], ['mastery_gold', 'mastery', 1],
  ['streak_bronze', 'streak', 1], ['streak_silver', 'streak', 1], ['streak_gold', 'streak', 1], ['coverage_bronze', 'coverage', 2]
].map(([badgeCode, category, phase]) => ({ badgeCode, category, tier: badgeCode.split('_')[1], name: badgeCode, phase, conditionText: '条件' }))
describe('M-H02 me（A-01〜A-04、A-12）', () => {
  beforeEach(() => {
    users.findBySub.mockResolvedValue({ ...learner })
    partners.get.mockImplementation(async (persona) => ({ persona, defaultName: { encourage: 'ミナ', logic: 'セージ', rival: 'レン' }[persona], imageKey: null }))
    enrollments.listCourseIds.mockResolvedValue([3])
    enrollments.nicknameTaken.mockResolvedValue(false)
  })
  it('MT-H02-01 ログインの記録（30分より前）', async () => {
    users.lastLoginLogAt.mockResolvedValue(minutesAgo(31))
    expect((await call({ path: '/api/me' })).statusCode).toBe(200)
    expect(users.touchLogin).toHaveBeenCalledWith(15)
  })
  it('MT-H02-02 ログインの記録（30分以内）', async () => {
    users.lastLoginLogAt.mockResolvedValue(minutesAgo(29))
    await call({ path: '/api/me' })
    expect(users.touchLogin).not.toHaveBeenCalled()
  })
  it('MT-H02-03 初回の流れの判定', async () => {
    users.findBySub.mockResolvedValue({ ...learner, status: 'invited', nickname: null, currentCourseId: null, partnerPersona: null, partnerName: null })
    users.lastLoginLogAt.mockResolvedValue(null)
    const res = await call({ path: '/api/me' })
    expect(users.activate).toHaveBeenCalledWith(15)
    expect(users.touchLogin).toHaveBeenCalledWith(15)
    expect(parse(res)).toMatchObject({
      userId: 'u_15', nickname: null, partner: null, currentCourseId: null,
      onboarding: { needNickname: true, needCourse: true, needPartner: true }
    })
  })
  it('MT-H02-14 初回の流れが終わった利用者の応答', async () => {
    users.lastLoginLogAt.mockResolvedValue(minutesAgo(1))
    partners.get.mockResolvedValue({ persona: 'encourage', imageKey: 'partners/encourage-20261020100000.png' })
    const body = parse(await call({ path: '/api/me' }))
    expect(body).toMatchObject({
      nickname: 'たろう', roles: ['learner'], currentCourseId: 'c_3',
      partner: { persona: 'encourage', name: 'ミナ', imageUrl: 'https://app.example.co.jp/partners/encourage-20261020100000.png' },
      onboarding: { needNickname: false, needCourse: false, needPartner: false }
    })
  })
  it('MT-H02-04 ニックネームの登録', async () => {
    const res = await call({ method: 'PUT', path: '/api/me/profile', body: { nickname: 'たろう' } })
    expect(res.statusCode).toBe(200)
    expect(enrollments.nicknameTaken).toHaveBeenCalledWith([3], 'たろう', 15)
    expect(users.updateNickname).toHaveBeenCalledWith(15, 'たろう')
  })
  it('MT-H02-05 ニックネームの重複', async () => {
    enrollments.nicknameTaken.mockResolvedValue(true)
    const res = await call({ method: 'PUT', path: '/api/me/profile', body: { nickname: 'たろう' } })
    expect(res.statusCode).toBe(409)
    expect(parse(res).error).toMatchObject({ code: 'CONFLICT', details: [{ field: 'nickname', code: 'M-08' }] })
    expect(users.updateNickname).not.toHaveBeenCalled()
  })
  it('MT-H02-06 ニックネームの形式', async () => {
    const res = await call({ method: 'PUT', path: '/api/me/profile', body: { nickname: 'た' } })
    expect(res.statusCode).toBe(400)
    expect(parse(res).error.code).toBe('VALIDATION_ERROR')
    expect(enrollments.nicknameTaken).not.toHaveBeenCalled()
  })
  it('MT-H02-07 パートナー（名前あり）', async () => {
    const res = await call({ method: 'PUT', path: '/api/me/partner', body: { persona: 'rival', name: 'カイ' } })
    expect(res.statusCode).toBe(200)
    expect(users.updatePartner).toHaveBeenCalledWith(15, 'rival', 'カイ')
  })
  it('MT-H02-08 パートナー（名前なし）', async () => {
    await call({ method: 'PUT', path: '/api/me/partner', body: { persona: 'logic', name: '' } })
    expect(users.updatePartner).toHaveBeenCalledWith(15, 'logic', 'セージ')
  })
  it('MT-H02-15 名前を省いたとき（同じキャラクターは今の名前、DBに初期名がなければ定数）', async () => {
    await call({ method: 'PUT', path: '/api/me/partner', body: { persona: 'encourage' } })
    expect(users.updatePartner).toHaveBeenLastCalledWith(15, 'encourage', 'ミナ')
    partners.get.mockResolvedValue(null)
    await call({ method: 'PUT', path: '/api/me/partner', body: { persona: 'rival' } })
    expect(users.updatePartner).toHaveBeenLastCalledWith(15, 'rival', 'レン')
    expect((await call({ method: 'PUT', path: '/api/me/partner', body: { persona: 'logic', name: 'ミナ★' } })).statusCode).toBe(400)
  })
  it.each([[{ persona: 'cool' }], [{}], [{ persona: 'toString' }]])('MT-H02-09 知らない性格 %j', async (body) => {
    const res = await call({ method: 'PUT', path: '/api/me/partner', body })
    expect(res.statusCode).toBe(400)
    expect(users.updatePartner).not.toHaveBeenCalled()
  })
  it('MT-H02-10 通知設定', async () => {
    const okRes = await call({ method: 'PUT', path: '/api/me/notify', body: { emailEnabled: true, sendTime: '21:30' } })
    expect(okRes.statusCode).toBe(200)
    expect(notify.put).toHaveBeenCalledWith(15, { emailEnabled: true, sendTime: '21:30' })
    expect((await call({ method: 'PUT', path: '/api/me/notify', body: { emailEnabled: true, sendTime: '22:30' } })).statusCode).toBe(400)
    expect((await call({ method: 'PUT', path: '/api/me/notify', body: { emailEnabled: 'yes', sendTime: '07:30' } })).statusCode).toBe(400)
    expect(notify.put).toHaveBeenCalledTimes(1)
  })
  it('MT-H02-16 通知設定の取得（行がなければ初期値）', async () => {
    notify.get.mockResolvedValueOnce({ emailEnabled: false, sendTime: '21:00' }).mockResolvedValueOnce(null)
    expect(parse(await call({ path: '/api/me/notify' }))).toEqual({ emailEnabled: false, sendTime: '21:00' })
    expect(parse(await call({ path: '/api/me/notify' }))).toEqual({ emailEnabled: true, sendTime: '07:30' })
  })
  it('MT-H02-11 学習記録の計算', async () => {
    answers.statsForUser.mockResolvedValue({ publishedCount: 20, answeredQuestions: 8, answerCount: 10, correctCount: 7, mastered: 2 })
    const body = parse(await call({ path: '/api/me/stats' }))
    expect(answers.statsForUser).toHaveBeenCalledWith(15, 3)
    expect(body).toMatchObject({ coveragePct: 40.0, correctPct: 70.0, mastered: 2, courseId: 'c_3' })
  })
  it('MT-H02-12 解答がないときの正答率', async () => {
    answers.statsForUser.mockResolvedValue({ publishedCount: 0, answeredQuestions: 0, answerCount: 0, correctCount: 0, mastered: 0 })
    const body = parse(await call({ path: '/api/me/stats' }))
    expect(body.correctPct).toBeNull()
    expect(body.coveragePct).toBe(0)
    expect(body.streakDays).toBe(0)
  })
  it('MT-H02-13 バッジ一覧', async () => {
    badges.listDefs.mockResolvedValue(DEFS)
    badges.listOwnedDetail.mockResolvedValue([{ badgeCode: 'streak_bronze', earnedAt: '2026-10-19 15:00:00' }])
    const list = parse(await call({ path: '/api/me/badges' })).badges
    expect(list).toHaveLength(6)
    expect(list.filter((b) => b.earnedAt).map((b) => b.code)).toEqual(['streak_bronze'])
    expect(list.find((b) => b.code === 'mastery_bronze')).toMatchObject({ earnedAt: null, condition: '条件' })
  })
})
