import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
vi.mock('../../../../functions/shared/db/repositories/gradings.js')
vi.mock('../../../../functions/shared/db/repositories/questions.js')
vi.mock('../../../../functions/shared/db/repositories/users.js')
vi.mock('../../../../functions/shared/db/repositories/reviews.js')
vi.mock('../../../../functions/shared/db/repositories/answers.js')
vi.mock('../../../../functions/shared/db/repositories/exp.js')
vi.mock('../../../../functions/shared/db/repositories/quests.js')
vi.mock('../../../../functions/shared/db/repositories/badges.js')
import * as gradings from '../../../../functions/shared/db/repositories/gradings.js'
import * as questions from '../../../../functions/shared/db/repositories/questions.js'
import * as users from '../../../../functions/shared/db/repositories/users.js'
import * as reviews from '../../../../functions/shared/db/repositories/reviews.js'
import * as answers from '../../../../functions/shared/db/repositories/answers.js'
import * as exp from '../../../../functions/shared/db/repositories/exp.js'
import * as quests from '../../../../functions/shared/db/repositories/quests.js'
import * as badges from '../../../../functions/shared/db/repositories/badges.js'
import { gradeJob } from '../../../../functions/grading-worker/grader.js'
import { runGradingJob } from '../../../../functions/grading-worker/index.mjs'
import { memoryLogger } from '../../../helpers/logger.js'
import { bedrockMock, dbMock, awsError } from '../../../helpers/mocks.js'
import { converseOutput } from '../../../fixtures/bedrock/grading.js'
import { NOW } from '../../../helpers/clock.js'
import { learner } from '../../../fixtures/users.js'
const br = bedrockMock()
const db = dbMock()
const grading = (a, c, k, extra = {}) => JSON.stringify({ accuracy: a, coverage: c, concreteness: k, score: a + c + k, modelAnswer: '模範解答', missingPoints: ['キャッシュ'], comment: 'よく書けてるね！', ...extra })
let t
let log
const now = () => new Date(t)
const run = () => gradeJob(456, { log, now })
// Bedrock の応答を順に返し、そのたびに時計を進める
function replies(...list) {
  let i = 0
  br.on(ConverseCommand).callsFake(() => {
    const [text, ms = 1000] = list[Math.min(i++, list.length - 1)]
    t += ms
    return converseOutput(text)
  })
}
describe('M-W01 grading-worker', () => {
  beforeEach(() => {
    t = NOW.getTime()
    log = memoryLogger()
    br.reset()
    db.reset()
    replies([grading(40, 20, 12)])
    gradings.find.mockResolvedValue({ gradingId: 456, userId: 15, courseId: 3, keywordId: 123, adventureId: 90, status: 'processing', explanationText: '【定義】DNSは…' })
    gradings.complete.mockResolvedValue(true)
    questions.findKeyword.mockResolvedValue({ keywordId: 123, keyword: 'DNS', questionId: 42, courseId: 3, body: '問題文', explanation: '解説' })
    users.findById.mockResolvedValue({ ...learner })
    reviews.findItem.mockResolvedValue(null)
    quests.listToday.mockResolvedValue([{ userQuestId: 3, questCode: 'Q-03', target: 1, progress: 0, achieved: false }])
    badges.listOwned.mockResolvedValue([])
    answers.masteredCount.mockResolvedValue(0)
    answers.insert.mockResolvedValue(778)
  })
  it('MT-W01-01 合格', async () => {
    const res = await run()
    expect(res.status).toBe('done')
    expect(gradings.complete).toHaveBeenCalledTimes(1)
    const [id, result, tx] = gradings.complete.mock.calls[0]
    expect(id).toBe(456)
    expect(typeof tx.query).toBe('function')
    expect(result).toMatchObject({
      status: 'done', score: 72, passed: true, modelAnswer: '模範解答', missingPoints: ['キャッシュ'],
      comment: { partnerName: 'ミナ', persona: 'encourage', text: 'よく書けてるね！' },
      exp: { gained: 30, reviewBonus: false, questExp: 30, level: 3 }, review: { stage: 1, nextDate: '2026-10-21' },
      quests: [{ id: 'Q-03', done: true, reward: 30 }], badges: []
    })
    expect(answers.insert.mock.calls[0][0]).toMatchObject({ kind: 'explain', score: 72, isCorrect: true, keywordId: 123, questionId: 42, explanationText: '【定義】DNSは…', adventureId: 90 })
    expect(users.addExp.mock.calls[0][1]).toEqual({ exp: 60, level: 3, today: '2026-10-20' })
    expect(db.commits()).toBe(1)
    const input = br.commandCalls(ConverseCommand)[0].args[0].input
    expect(input).toMatchObject({ modelId: 'model-high', inferenceConfig: { maxTokens: 3000, temperature: 0 } })
  })
  it('MT-W01-02 合格ライン', async () => {
    replies([grading(30, 20, 10)])
    expect((await run()).result.passed).toBe(true)
    replies([grading(30, 20, 9)])
    const res = await run()
    expect(res.result).toMatchObject({ score: 59, passed: false, exp: { gained: 0 }, review: { stage: 1 } })
    expect(answers.insert.mock.calls[1][0].isCorrect).toBe(false)
  })
  it('MT-W01-03 合計で計算し直す', async () => {
    replies([grading(40, 20, 12, { score: 90 })])
    const res = await run()
    expect(res.result.score).toBe(72)
    expect(answers.insert.mock.calls[0][0].score).toBe(72)
  })
  it('MT-W01-04 JSONのやり直し（成功）', async () => {
    replies(['すみません、形が崩れました', 3000], [grading(40, 20, 12)])
    const res = await run()
    expect(br.commandCalls(ConverseCommand)).toHaveLength(2)
    expect(res.result.score).toBe(72)
    const second = br.commandCalls(ConverseCommand)[1].args[0].input.messages
    expect(second.at(-1).content[0].text).toContain('前回の出力はJSONの形が崩れていました')
  })
  it('MT-W01-05 JSONのやり直し（失敗）', async () => {
    replies(['崩れ1'], ['{"accuracy":"高い"}'])
    const res = await run()
    expect(res).toEqual({ status: 'failed', reason: 'ai_error' })
    expect(gradings.fail).toHaveBeenCalledWith(456, 'ai_error')
    expect(answers.insert).not.toHaveBeenCalled()
    expect(reviews.upsertItem).not.toHaveBeenCalled()
    expect(users.addExp).not.toHaveBeenCalled()
  })
  it('MT-W01-06 残り時間が少ないとき', async () => {
    replies(['崩れ', 16000], [grading(40, 20, 12)])
    await run()
    expect(br.commandCalls(ConverseCommand)).toHaveLength(1)
    expect(gradings.fail).toHaveBeenCalledWith(456, 'ai_error')
  })
  it('MT-W01-07 Bedrock の時間切れ', async () => {
    vi.useFakeTimers({ now: NOW })
    br.on(ConverseCommand).callsFake(() => new Promise(() => {}))
    const p = gradeJob(456, { log })
    await vi.advanceTimersByTimeAsync(25000)
    expect(await p).toEqual({ status: 'failed', reason: 'ai_timeout' })
    expect(gradings.fail).toHaveBeenCalledWith(456, 'ai_timeout')
    br.on(ConverseCommand).rejects(awsError('ThrottlingException'))
    vi.useRealTimers()
    expect(await run()).toEqual({ status: 'failed', reason: 'ai_error' })
  })
  it.each(['done', 'failed'])('MT-W01-08 処理済みのジョブ（%s）', async (status) => {
    gradings.find.mockResolvedValue({ gradingId: 456, status })
    expect(await run()).toEqual({ status: 'skipped' })
    expect(br.commandCalls(ConverseCommand)).toHaveLength(0)
    gradings.find.mockResolvedValue(null)
    expect(await run()).toEqual({ status: 'skipped' })
  })
  it('MT-W01-09 A-10 が先に時間切れにした', async () => {
    gradings.complete.mockResolvedValue(false)
    const res = await run()
    expect(res).toEqual({ status: 'superseded' })
    expect(db.rollbacks()).toBe(1)
    expect(db.commits()).toBe(0)
    for (const fn of [answers.insert, reviews.upsertItem, exp.insertLog, users.addExp, quests.saveProgress]) expect(fn).not.toHaveBeenCalled()
  })
  it('MT-W01-13 問いかけ（A-07b）への答えとして採点し、観点ごとの答え方を返す', async () => {
    gradings.find.mockResolvedValue({ gradingId: 456, userId: 15, courseId: 3, keywordId: 123, adventureId: 90, status: 'processing', explanationText: 'DNSは…', prompt: { text: 'なぜ必要なの？', angles: ['目的', 'しくみ', '違い'] } })
    replies([grading(40, 20, 12, { angleResults: ['full', 'partial'] })])
    expect((await run()).status).toBe('done')
    expect(gradings.complete.mock.calls[0][1].prompt).toEqual({
      text: 'なぜ必要なの？', angles: [{ label: '目的', status: 'full' }, { label: 'しくみ', status: 'partial' }, { label: '違い', status: 'unknown' }]
    })
    const input = br.commandCalls(ConverseCommand)[0].args[0].input
    expect(input.messages[0].content[0].text).toContain('<prompt>なぜ必要なの？</prompt>')
    expect(input.messages[0].content[0].text).toContain('<angles>目的、しくみ、違い</angles>')
    expect(input.system[0].text).toContain('angleResults は <angles> の観点の順に3つ')
  })
  it('MT-W01-14 問いかけのない採点は結果に prompt を入れない', async () => {
    expect((await run()).status).toBe('done')
    expect(gradings.complete.mock.calls[0][1]).not.toHaveProperty('prompt')
    expect(br.commandCalls(ConverseCommand)[0].args[0].input.messages[0].content[0].text).not.toContain('<prompt>')
  })
  it('MT-W01-10 パートナーの口調', async () => {
    users.findById.mockResolvedValue({ ...learner, partnerPersona: 'rival', partnerName: 'レン' })
    const res = await run()
    const system = br.commandCalls(ConverseCommand)[0].args[0].input.system[0].text
    expect(system).toContain('「レン」')
    expect(system).toContain('ライバル型')
    expect(system).toContain('少し強気')
    expect(res.result.comment).toMatchObject({ partnerName: 'レン', persona: 'rival' })
  })
  it('MT-W01-12 パートナー未設定・書き込み中の例外・ジョブの入口', async () => {
    users.findById.mockResolvedValue({ ...learner, partnerPersona: null, partnerName: null })
    expect((await run()).result.comment).toMatchObject({ partnerName: null, persona: 'encourage' })
    const boom = Object.assign(new Error('deadlock'), { code: '40P01' })
    answers.insert.mockRejectedValue(boom)
    await expect(run()).rejects.toBe(boom)
    // ジョブの入口は例外を投げず、採点を失敗にしてワーカーに failed を返す（やり直しはしない）
    gradings.fail.mockClear()
    expect(await runGradingJob({ payload: { gradingId: 456 } }, { log, now })).toEqual({ outcome: 'failed', error: 'deadlock' })
    expect(gradings.fail).toHaveBeenCalledWith(456, 'ai_error')
    expect(log.lines.some((l) => l.msg === 'grading.error' && l.code === '40P01')).toBe(true)
    gradings.fail.mockRejectedValueOnce(new Error('db down'))
    expect((await runGradingJob({ payload: { gradingId: 456 } }, { log, now })).outcome).toBe('failed')
    answers.insert.mockResolvedValue(1)
    expect(await runGradingJob({ payload: { gradingId: '456' } }, { log, now })).toMatchObject({ outcome: 'done', status: 'done' })
  })
})
