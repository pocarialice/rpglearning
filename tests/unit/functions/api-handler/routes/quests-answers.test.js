import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
vi.mock('../../../../../functions/shared/db/repositories/users.js')
vi.mock('../../../../../functions/shared/db/repositories/adventures.js', async (orig) => {
  const m = await orig()
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, typeof v === 'function' ? vi.fn() : v]))
})
vi.mock('../../../../../functions/shared/db/repositories/reviews.js')
vi.mock('../../../../../functions/shared/db/repositories/questions.js')
vi.mock('../../../../../functions/shared/db/repositories/answers.js')
vi.mock('../../../../../functions/shared/db/repositories/exp.js')
vi.mock('../../../../../functions/shared/db/repositories/quests.js')
vi.mock('../../../../../functions/shared/db/repositories/badges.js')
import * as users from '../../../../../functions/shared/db/repositories/users.js'
import * as adventures from '../../../../../functions/shared/db/repositories/adventures.js'
import * as reviews from '../../../../../functions/shared/db/repositories/reviews.js'
import * as questions from '../../../../../functions/shared/db/repositories/questions.js'
import * as answers from '../../../../../functions/shared/db/repositories/answers.js'
import * as exp from '../../../../../functions/shared/db/repositories/exp.js'
import * as quests from '../../../../../functions/shared/db/repositories/quests.js'
import * as badges from '../../../../../functions/shared/db/repositories/badges.js'
import { main } from '../../../../../functions/api-handler/index.mjs'
import { httpEvent, parse } from '../../../../fixtures/events/http.js'
import { memoryLogger } from '../../../../helpers/logger.js'
import { bedrockMock, dbMock, awsError } from '../../../../helpers/mocks.js'
import { converseOutput } from '../../../../fixtures/bedrock/grading.js'
import { NOW } from '../../../../helpers/clock.js'
import { learner } from '../../../../fixtures/users.js'
const br = bedrockMock()
const db = dbMock()
const call = (opts) => main(httpEvent(opts), { log: memoryLogger(), now: NOW })
const Q42 = { questionId: 42, courseId: 3, body: 'DNSの役割は？', choices: ['ア', 'イ', 'ウ', 'エ'], correctChoice: 2, explanation: '名前解決の解説', status: 'published', keywords: [{ keywordId: 123, keyword: 'DNS' }] }
const adv = (patch = {}) => ({ adventureId: 90, userId: 15, courseId: 3, servedCount: 0, lastKind: null, served: [], ...patch })
const empty = () => []
describe('M-H05 quests（A-07）', () => {
  beforeEach(() => {
    users.findBySub.mockResolvedValue({ ...learner })
    adventures.start.mockResolvedValue(adv())
    adventures.find.mockImplementation(async (id, userId) => (id === 90 && userId === 15 ? adv() : null))
    reviews.listDue.mockImplementation(async (u, c, kind) => (kind === 'choice' ? [{ questionId: 42, keywordId: null }] : []))
    reviews.listUnlearned.mockImplementation(empty)
    reviews.listLearned.mockImplementation(empty)
    questions.findForLearner.mockResolvedValue({ ...Q42 })
  })
  it('MT-H05-01 冒険の開始', async () => {
    const body = parse(await call({ path: '/api/quests/next' }))
    expect(adventures.start).toHaveBeenCalledWith(15, 3)
    expect(body).toMatchObject({ adventureId: 'adv_90', index: 1, total: 10, kind: 'choice', isReview: true })
    expect(adventures.incrementServed).toHaveBeenCalledWith(90, { k: 'choice', q: 42 })
    expect(reviews.listDue).toHaveBeenCalledWith(15, 3, 'choice', '2026-10-20')
  })
  it('MT-H05-02 10問で終わり', async () => {
    adventures.find.mockResolvedValue(adv({ servedCount: 10 }))
    const body = parse(await call({ path: '/api/quests/next', query: { adventureId: 'adv_90' } }))
    expect(body).toEqual({ adventureId: 'adv_90', done: true })
    expect(adventures.finish).toHaveBeenCalledWith(90)
    expect(adventures.incrementServed).not.toHaveBeenCalled()
  })
  it('MT-H05-03 9問目の次', async () => {
    adventures.find.mockResolvedValue(adv({ servedCount: 9, lastKind: 'explain', served: [{ k: 'explain', q: 7, kw: 70 }] }))
    const body = parse(await call({ path: '/api/quests/next', query: { adventureId: 'adv_90' } }))
    expect(body).toMatchObject({ index: 10, total: 10, kind: 'choice' })
  })
  it('MT-H05-04 他人の冒険', async () => {
    const res = await call({ path: '/api/quests/next', query: { adventureId: 'adv_91' } })
    expect(res.statusCode).toBe(404)
  })
  it('MT-H05-05 出せる問題がない', async () => {
    adventures.find.mockResolvedValue(adv({ servedCount: 1, lastKind: 'choice', served: [{ k: 'choice', q: 42 }] }))
    const body = parse(await call({ path: '/api/quests/next', query: { adventureId: 'adv_90' } }))
    expect(body).toEqual({ adventureId: 'adv_90', done: true, reason: 'NO_QUESTION' })
    expect(adventures.finish).toHaveBeenCalledWith(90)
  })
  it('MT-H05-06 答えを返さない', async () => {
    const body = parse(await call({ path: '/api/quests/next' }))
    expect(body.question).toEqual({ id: 'q_42', body: 'DNSの役割は？', choices: [{ no: 1, body: 'ア' }, { no: 2, body: 'イ' }, { no: 3, body: 'ウ' }, { no: 4, body: 'エ' }] })
    expect(JSON.stringify(body)).not.toMatch(/correctChoice|explanation/)
  })
  it('MT-H05-07 説明の出題', async () => {
    adventures.start.mockResolvedValue(adv({ lastKind: 'choice' }))
    reviews.listUnlearned.mockImplementation(async (u, c, kind) => (kind === 'explain' ? [{ questionId: 42, keywordId: 123 }] : []))
    const body = parse(await call({ path: '/api/quests/next' }))
    expect(body).toMatchObject({ kind: 'explain', isReview: false, keyword: { id: 'kw_123', text: 'DNS' }, question: { id: 'q_42', body: 'DNSの役割は？' } })
    expect(body.question.choices).toBeUndefined()
    expect(adventures.incrementServed).toHaveBeenCalledWith(90, { k: 'explain', q: 42, kw: 123 })
  })
  it('MT-H05-08 選んだ問題が取得できない・キーワードの文言がない', async () => {
    questions.findForLearner.mockResolvedValue(null)
    expect((await call({ path: '/api/quests/next' })).statusCode).toBe(404)
    questions.findForLearner.mockResolvedValue({ ...Q42, keywords: [] })
    adventures.start.mockResolvedValue(adv({ lastKind: 'choice' }))
    reviews.listUnlearned.mockImplementation(async (u, c, kind) => (kind === 'explain' ? [{ questionId: 42, keywordId: 123 }] : []))
    expect(parse(await call({ path: '/api/quests/next' })).keyword).toEqual({ id: 'kw_123', text: '' })
    adventures.start.mockResolvedValue({ adventureId: 90, servedCount: 0 })
    expect((await call({ path: '/api/quests/next' })).statusCode).toBe(200)
  })
})
describe('M-H06 answers（A-08）', () => {
  beforeEach(() => {
    br.reset()
    db.reset()
    br.on(ConverseCommand).resolves(converseOutput('正解！名前解決のしくみをよく覚えてるね。'))
    users.findBySub.mockResolvedValue({ ...learner })
    adventures.find.mockResolvedValue(adv())
    questions.findForLearner.mockImplementation(async (id, courseId) => (id === 42 && courseId === 3 ? { ...Q42 } : null))
    reviews.findItem.mockResolvedValue(null)
    quests.listToday.mockResolvedValue([{ userQuestId: 5, questCode: 'Q-05', target: 3, progress: 0, achieved: false }])
    badges.listOwned.mockResolvedValue([])
    answers.masteredCount.mockResolvedValue(0)
    answers.insert.mockResolvedValue(777)
  })
  const answer = (choiceNo, extra = {}) => call({ method: 'POST', path: '/api/answers/choice', body: { adventureId: 'adv_90', questionId: 'q_42', choiceNo, ...extra } })
  it('MT-H06-01 正解', async () => {
    const res = await answer(2)
    expect(res.statusCode).toBe(200)
    const body = parse(res)
    expect(body.correct).toBe(true)
    expect(body.exp.gained).toBe(10)
    const txOf = (fn) => fn.mock.calls[0].at(-1)
    // 4つとも同じトランザクション（withTx が渡す tx）で書く
    const tx = txOf(answers.insert)
    expect(typeof tx.query).toBe('function')
    for (const fn of [reviews.upsertItem, exp.insertLog, users.addExp]) expect(txOf(fn)).toBe(tx)
    expect(answers.insert.mock.calls[0][0]).toMatchObject({ userId: 15, courseId: 3, questionId: 42, kind: 'choice', selectedChoice: 2, isCorrect: true, adventureId: 90, answeredOn: '2026-10-20' })
    expect(exp.insertLog.mock.calls[0][0]).toMatchObject({ reason: 'choice', refId: 777, exp: 10, weekStart: '2026-10-19' })
    expect(users.addExp.mock.calls[0][1]).toEqual({ exp: 10, level: 3, today: '2026-10-20' })
    expect(quests.saveProgress.mock.calls[0][0]).toEqual([expect.objectContaining({ userQuestId: 5, progress: 1 })])
    expect(db.commits()).toBe(1)
  })
  it('MT-H06-02 不正解', async () => {
    const body = parse(await answer(3))
    expect(body.correct).toBe(false)
    expect(body.exp.gained).toBe(0)
    expect(exp.insertLog).not.toHaveBeenCalled()
  })
  it.each([0, 5, '2'])('MT-H06-03 選択肢の範囲 %j', async (choiceNo) => {
    expect((await answer(choiceNo)).statusCode).toBe(400)
    expect(db.txLog()).toHaveLength(0)
  })
  it('MT-H06-04 非公開・他コースの問題', async () => {
    expect((await answer(2, { questionId: 'q_43' })).statusCode).toBe(404)
    expect(questions.findForLearner).toHaveBeenCalledWith(43, 3)
    adventures.find.mockResolvedValue(null)
    expect((await answer(2)).statusCode).toBe(404)
  })
  it('MT-H06-05 解説コメントの失敗', async () => {
    br.on(ConverseCommand).rejects(awsError('InternalServerException'))
    const res = await answer(2)
    expect(res.statusCode).toBe(200)
    expect(parse(res).comment).toEqual({ partnerName: 'ミナ', persona: 'encourage', text: '名前解決の解説' })
  })
  it('MT-H06-06 更新の途中で失敗', async () => {
    reviews.upsertItem.mockRejectedValue(awsError('BadRequestException'))
    const res = await answer(2)
    expect(res.statusCode).toBe(500)
    expect(db.rollbacks()).toBe(1)
    expect(db.commits()).toBe(0)
    expect(br.commandCalls(ConverseCommand)).toHaveLength(0)
  })
  it('MT-H06-07 応答の形', async () => {
    const body = parse(await answer(2))
    expect(Object.keys(body).sort()).toEqual(['badges', 'comment', 'correct', 'correctChoice', 'exp', 'explanation', 'quests', 'review'])
    expect(body).toMatchObject({
      correctChoice: 2, explanation: '名前解決の解説',
      comment: { partnerName: 'ミナ', persona: 'encourage', text: '正解！名前解決のしくみをよく覚えてるね。' },
      exp: { gained: 10, reviewBonus: false, level: 3, levelUp: false, expInLevel: 10, next: 374 },
      review: { stage: 1, nextDate: '2026-10-21' },
      quests: [{ id: 'Q-05', done: false, reward: 0 }],
      badges: []
    })
    const input = br.commandCalls(ConverseCommand)[0].args[0].input
    expect(input).toMatchObject({ modelId: 'model-light', inferenceConfig: { maxTokens: 300, temperature: 0.7 } })
  })
  it('MT-H06-08 冒険IDなし・クエスト達成・バッジ・コメントが空', async () => {
    br.on(ConverseCommand).resolves(converseOutput(''))
    reviews.findItem.mockResolvedValue({ stage: 5, nextReviewOn: '2026-10-20' })
    quests.listToday.mockResolvedValue([{ userQuestId: 1, questCode: 'Q-01', target: 5, progress: 4, achieved: false }, { userQuestId: 4, questCode: 'Q-04', target: 3, progress: 3, achieved: true }])
    answers.masteredCount.mockResolvedValue(9)
    users.findBySub.mockResolvedValue({ ...learner, partnerPersona: null, partnerName: null })
    const res = await call({ method: 'POST', path: '/api/answers/choice', body: { questionId: 'q_42', choiceNo: 2 } })
    const body = parse(res)
    expect(body.comment).toEqual({ partnerName: null, persona: 'encourage', text: '名前解決の解説' })
    expect(body.exp).toMatchObject({ gained: 15, reviewBonus: true, questExp: 20 })
    expect(body.review).toEqual({ stage: 6, nextDate: null })
    expect(body.badges).toEqual(['mastery_bronze'])
    expect(body.quests.find((q) => q.id === 'Q-01')).toMatchObject({ done: true, achievedNow: true, reward: 20 })
    expect(exp.insertLog.mock.calls.map((c) => c[0].reason)).toEqual(['choice', 'quest'])
    expect(exp.insertLog.mock.calls[1][0]).toMatchObject({ refId: 1, exp: 20 })
    expect(badges.grant).toHaveBeenCalledWith(15, ['mastery_bronze'], expect.anything())
    expect(answers.insert.mock.calls[0][0].adventureId).toBeNull()
    expect(quests.saveProgress.mock.calls[0][0].map((q) => q.code)).toEqual(['Q-01'])
  })
})
