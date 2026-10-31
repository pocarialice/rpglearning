import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
vi.mock('../../../../../functions/shared/db/repositories/users.js')
vi.mock('../../../../../functions/shared/db/repositories/quests.js')
vi.mock('../../../../../functions/shared/db/repositories/reviews.js')
vi.mock('../../../../../functions/shared/db/repositories/answers.js')
vi.mock('../../../../../functions/shared/db/repositories/exp.js')
vi.mock('../../../../../functions/shared/db/repositories/courses.js')
vi.mock('../../../../../functions/shared/db/repositories/enrollments.js')
import * as users from '../../../../../functions/shared/db/repositories/users.js'
import * as quests from '../../../../../functions/shared/db/repositories/quests.js'
import * as reviews from '../../../../../functions/shared/db/repositories/reviews.js'
import * as answers from '../../../../../functions/shared/db/repositories/answers.js'
import * as exp from '../../../../../functions/shared/db/repositories/exp.js'
import * as courses from '../../../../../functions/shared/db/repositories/courses.js'
import * as enrollments from '../../../../../functions/shared/db/repositories/enrollments.js'
import { FALLBACK_MESSAGES } from '../../../../../functions/shared/ai/prompts/daily-message.js'
import { main } from '../../../../../functions/api-handler/index.mjs'
import { httpEvent, parse } from '../../../../fixtures/events/http.js'
import { memoryLogger } from '../../../../helpers/logger.js'
import { bedrockMock, awsError } from '../../../../helpers/mocks.js'
import { converseOutput } from '../../../../fixtures/bedrock/grading.js'
import { NOW } from '../../../../helpers/clock.js'
import { learner } from '../../../../fixtures/users.js'
const br = bedrockMock()
const call = (opts) => main(httpEvent(opts), { log: memoryLogger(), now: NOW })
const fallbackTexts = (persona, n) => FALLBACK_MESSAGES[persona].map((f) => f(n))
describe('M-H03 home（A-05）', () => {
  beforeEach(() => {
    br.reset()
    br.on(ConverseCommand).resolves(converseOutput('昨日より3問多く解けてるよ。今日もいこう'))
    users.findBySub.mockResolvedValue({ ...learner, dailyMessageOn: '2026-10-19', dailyMessage: '昨日のひとこと' })
    quests.listToday.mockResolvedValue([{ userQuestId: 1, questCode: 'Q-01', title: '択一を5問解く', target: 5, progress: 2, rewardExp: 20, achieved: false }])
    reviews.countDueByKind.mockResolvedValue({ choice: 3, explain: 2, total: 5 })
    answers.countOnDate.mockResolvedValue(12)
    exp.weeklyTotalForUser.mockResolvedValue(340)
  })
  it('MT-H03-01 ひとことの使い回し', async () => {
    users.findBySub.mockResolvedValue({ ...learner, dailyMessageOn: '2026-10-20', dailyMessage: '保存済みのひとこと' })
    const body = parse(await call({ path: '/api/home' }))
    expect(body.message).toEqual({ partnerName: 'ミナ', persona: 'encourage', text: '保存済みのひとこと' })
    expect(br.commandCalls(ConverseCommand)).toHaveLength(0)
  })
  it('MT-H03-02 ひとことの生成', async () => {
    const body = parse(await call({ path: '/api/home' }))
    const calls = br.commandCalls(ConverseCommand)
    expect(calls).toHaveLength(1)
    expect(calls[0].args[0].input.modelId).toBe('model-light')
    expect(calls[0].args[0].input.messages[0].content[0].text).toContain('今日の復習数：5')
    expect(answers.countOnDate).toHaveBeenCalledWith(15, '2026-10-19')
    expect(users.setDailyMessage).toHaveBeenCalledWith(15, '昨日より3問多く解けてるよ。今日もいこう', '2026-10-20')
    expect(body.message.text).toBe('昨日より3問多く解けてるよ。今日もいこう')
  })
  it('MT-H03-03 ひとことの失敗', async () => {
    vi.useFakeTimers({ now: NOW })
    br.on(ConverseCommand).callsFake(() => new Promise(() => {}))
    const p = call({ path: '/api/home' })
    await vi.advanceTimersByTimeAsync(5000)
    const res = await p
    expect(res.statusCode).toBe(200)
    expect(fallbackTexts('encourage', 5)).toContain(parse(res).message.text)
    expect(users.setDailyMessage).not.toHaveBeenCalled()
  })
  it('MT-H03-07 空の応答・パートナー未設定でも定型文', async () => {
    br.on(ConverseCommand).resolves(converseOutput('  '))
    users.findBySub.mockResolvedValue({ ...learner, partnerPersona: null, partnerName: null })
    const body = parse(await call({ path: '/api/home' }))
    expect(body.message.persona).toBe('encourage')
    expect(fallbackTexts('encourage', 5)).toContain(body.message.text)
    br.on(ConverseCommand).rejects(awsError('ThrottlingException'))
    users.findBySub.mockResolvedValue({ ...learner, partnerPersona: 'rival', partnerName: 'レン', streakDays: 4 })
    const b2 = parse(await call({ path: '/api/home' }))
    expect(fallbackTexts('rival', 5)).toContain(b2.message.text)
    expect(b2.streakDays).toBe(4)
  })
  it('MT-H03-04 今日の復習数', async () => {
    const body = parse(await call({ path: '/api/home' }))
    expect(reviews.countDueByKind).toHaveBeenCalledWith(15, 3, '2026-10-20')
    expect(body.review).toEqual({ choice: 3, explain: 2, total: 5 })
    expect(body.quests).toEqual([{ id: 'Q-01', title: '択一を5問解く', progress: 2, target: 5, done: false, reward: 20 }])
  })
  it('MT-H03-05 レベル表示', async () => {
    expect(parse(await call({ path: '/api/home' }))).toMatchObject({ level: 3, expInLevel: 0, next: 374, totalExp: 330 })
  })
  it('MT-H03-06 コース未選択', async () => {
    users.findBySub.mockResolvedValue({ ...learner, currentCourseId: null })
    const res = await call({ path: '/api/home' })
    expect(res.statusCode).toBe(409)
    expect(parse(res).error.code).toBe('COURSE_REQUIRED')
  })
  it('MT-H03-08 受講中のコース', async () => {
    courses.findProgress.mockResolvedValue({ courseId: 3, name: 'NW', certification: 'ネスペ', questionCount: 120, learnedCount: 42 })
    const body = parse(await call({ path: '/api/home' }))
    expect(courses.findProgress).toHaveBeenCalledWith(3, 15)
    expect(body.course).toEqual({ id: 'c_3', name: 'NW', certification: 'ネスペ', questionCount: 120, coveragePct: 35 })
    courses.findProgress.mockResolvedValue(null)
    expect(parse(await call({ path: '/api/home' })).course).toBeNull()
  })
})
describe('M-H04 courses（A-06）', () => {
  beforeEach(() => {
    users.findBySub.mockResolvedValue({ ...learner })
    courses.findById.mockImplementation(async (id) => (id === 999 ? null : { courseId: id, name: 'コース' }))
    enrollments.isEnrolled.mockResolvedValue(false)
    enrollments.nicknameTaken.mockResolvedValue(false)
  })
  it('MT-H04-01 受講の開始', async () => {
    const res = await call({ method: 'POST', path: '/api/enrollments', body: { courseId: 'c_5' } })
    expect(res.statusCode).toBe(201)
    expect(enrollments.nicknameTaken).toHaveBeenCalledWith([5], 'たろう', 15)
    expect(enrollments.enroll).toHaveBeenCalledWith(15, 5, '2026-10-20')
    expect(users.setCurrentCourse).toHaveBeenCalledWith(15, 5)
    expect(parse(res)).toEqual({ courseId: 'c_5', enrolled: true })
  })
  it('MT-H04-02 受講済み', async () => {
    enrollments.isEnrolled.mockResolvedValue(true)
    const res = await call({ method: 'POST', path: '/api/enrollments', body: { courseId: 'c_5' } })
    expect(res.statusCode).toBe(200)
    expect(enrollments.enroll).not.toHaveBeenCalled()
    expect(users.setCurrentCourse).toHaveBeenCalledWith(15, 5)
  })
  it('MT-H04-03 移る先でニックネームが重複', async () => {
    enrollments.nicknameTaken.mockResolvedValue(true)
    const res = await call({ method: 'POST', path: '/api/enrollments', body: { courseId: 'c_5' } })
    expect(res.statusCode).toBe(409)
    expect(parse(res).error.code).toBe('CONFLICT')
    expect(enrollments.enroll).not.toHaveBeenCalled()
    expect(users.setCurrentCourse).not.toHaveBeenCalled()
  })
  it('MT-H04-04 ないコース', async () => {
    expect((await call({ method: 'POST', path: '/api/enrollments', body: { courseId: 'c_999' } })).statusCode).toBe(404)
    expect((await call({ method: 'POST', path: '/api/enrollments', body: { courseId: 'x' } })).statusCode).toBe(400)
  })
  it('MT-H04-05 コース一覧', async () => {
    courses.listWithProgress.mockResolvedValue([
      { courseId: 3, name: 'NW', certification: 'ネスペ', questionCount: 20, learnedCount: 5, enrolled: true },
      { courseId: 5, name: 'AP', certification: '応用情報', description: '説明', questionCount: 0, learnedCount: 0, enrolled: false }
    ])
    const list = parse(await call({ path: '/api/courses' })).courses
    expect(list).toEqual([
      { id: 'c_3', name: 'NW', certification: 'ネスペ', description: null, questionCount: 20, coveragePct: 25, enrolled: true, current: true },
      { id: 'c_5', name: 'AP', certification: '応用情報', description: '説明', questionCount: 0, coveragePct: 0, enrolled: false, current: false }
    ])
  })
})
