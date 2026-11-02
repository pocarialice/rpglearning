import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
vi.mock('../../../../../functions/shared/db/repositories/users.js')
vi.mock('../../../../../functions/shared/db/repositories/adventures.js')
vi.mock('../../../../../functions/shared/db/repositories/summaries.js')
import * as users from '../../../../../functions/shared/db/repositories/users.js'
import * as adventures from '../../../../../functions/shared/db/repositories/adventures.js'
import * as summaries from '../../../../../functions/shared/db/repositories/summaries.js'
import { main } from '../../../../../functions/api-handler/index.mjs'
import { SUMMARY_AI } from '../../../../../functions/api-handler/routes/summaries.js'
import { httpEvent, parse } from '../../../../fixtures/events/http.js'
import { memoryLogger } from '../../../../helpers/logger.js'
import { bedrockMock, awsError } from '../../../../helpers/mocks.js'
import { converseOutput } from '../../../../fixtures/bedrock/grading.js'
import { NOW } from '../../../../helpers/clock.js'
import { learner } from '../../../../fixtures/users.js'
const br = bedrockMock()
const call = (opts) => main(httpEvent(opts), { log: memoryLogger(), now: NOW })
const ROWS = [
  { answerId: 1, courseName: '基本情報', adventureId: 90, adventureStartedAt: '2026-10-19 15:30:00.000', kind: 'choice', questionId: 42, questionBody: 'DNSの役割は？', correctBody: '名前解決', isCorrect: false, isReview: true, answeredOn: '2026-10-20', answeredAt: '2026-10-19 15:33:00.000', reviewStage: 1, nextReviewOn: '2026-10-21', missingPoints: [] },
  { answerId: 2, courseName: '基本情報', adventureId: 90, adventureStartedAt: '2026-10-19 15:30:00.000', kind: 'explain', questionId: 42, keywordId: 123, keyword: 'VPC', isCorrect: false, score: 45, isReview: false, answeredOn: '2026-10-20', answeredAt: '2026-10-19 15:40:00.000', reviewStage: 1, nextReviewOn: '2026-10-21', missingPoints: ['サブネット'] }
]
const COMMENT = 'ミナだよ。'.repeat(40)
describe('M-H16 summaries（A-12b・A-12c）', () => {
  beforeEach(() => {
    br.reset()
    br.on(ConverseCommand).resolves(converseOutput(COMMENT))
    users.findBySub.mockResolvedValue({ ...learner })
    adventures.find.mockImplementation(async (id, userId) => (id === 90 && userId === 15 ? { adventureId: 90 } : null))
    adventures.summary.mockResolvedValue({ studySeconds: 492, totalStudySeconds: 7300, answered: 2 })
    summaries.listForAdventure.mockResolvedValue(ROWS)
    summaries.listForDate.mockResolvedValue(ROWS)
  })
  it('MT-H16-01 冒険のサマリ：学習日は冒険を始めたJSTの日、Markdown にコメントを入れる', async () => {
    const res = await call({ path: '/api/adventures/adv_90/summary' })
    expect(res.statusCode).toBe(200)
    const body = parse(res)
    expect(summaries.listForAdventure).toHaveBeenCalledWith(15, 90)
    expect(adventures.summary).toHaveBeenCalledWith(90, 15)
    // 学習時間は冒険のまとめ（S-15）と同じ値
    expect(body).toMatchObject({ adventureId: 'adv_90', scope: 'adventure', date: '2026-10-20', studySeconds: 492, studyTime: '8分12秒', answerCount: 2, correctCount: 0 })
    expect(body.markdown).toContain('- 学習時間：8分12秒')
    expect(body.comment).toEqual({ partnerName: 'ミナ', persona: 'encourage', text: COMMENT })
    expect(body.markdown).toContain('# 学習サマリ 2026/10/20（冒険のまとめ）')
    expect(body.markdown).toContain('- 説明「VPC」（45点）：足りない観点は サブネット（次の復習 2026/10/21）')
    expect(body.markdown).toContain(`## ミナからのコメント\n${COMMENT}`)
    const input = br.commandCalls(ConverseCommand)[0].args[0].input
    expect(input).toMatchObject({ modelId: 'model-light', inferenceConfig: { maxTokens: SUMMARY_AI.maxTokens, temperature: 0.7 } })
    expect(input.system[0].text).toContain('200字くらい')
    expect(input.messages[0].content[0].text).toContain('<weak>DNSの役割は？\nVPC（足りない観点：サブネット）</weak>')
  })
  it('MT-H16-02 他人の冒険は 404', async () => {
    adventures.find.mockResolvedValue(null)
    expect((await call({ path: '/api/adventures/adv_91/summary' })).statusCode).toBe(404)
    expect(summaries.listForAdventure).not.toHaveBeenCalled()
  })
  it('MT-H16-03 解答がなければ AI を呼ばず、Markdown は null', async () => {
    summaries.listForAdventure.mockResolvedValue([])
    adventures.summary.mockResolvedValue(null)
    const body = parse(await call({ path: '/api/adventures/adv_90/summary' }))
    expect(body).toMatchObject({ date: '2026-10-20', answerCount: 0, studySeconds: 0, studyTime: '0秒', comment: null, markdown: null })
    expect(br.commandCalls(ConverseCommand)).toHaveLength(0)
  })
  it('MT-H16-04 冒険の開始時刻がなければ解答日を学習日にする', async () => {
    summaries.listForAdventure.mockResolvedValue([{ ...ROWS[0], adventureStartedAt: null, answeredOn: '2026-10-19' }])
    expect(parse(await call({ path: '/api/adventures/adv_90/summary' })).date).toBe('2026-10-19')
  })
  it('MT-H16-05 1日のサマリ：日付を省くと今日', async () => {
    const body = parse(await call({ path: '/api/me/summary' }))
    expect(summaries.listForDate).toHaveBeenCalledWith(15, '2026-10-20')
    expect(body).toMatchObject({ scope: 'day', date: '2026-10-20', studySeconds: 600, studyTime: '10分0秒' })
    expect(body.markdown).toContain('（1日のまとめ）')
    expect(br.commandCalls(ConverseCommand)[0].args[0].input.system[0].text).toContain('この日1日分の学習')
  })
  it('MT-H16-06 1日のサマリ：日付の指定・形式違い・未来は 400', async () => {
    await call({ path: '/api/me/summary', query: { date: '2026-10-18' } })
    expect(summaries.listForDate).toHaveBeenCalledWith(15, '2026-10-18')
    for (const date of ['2026/10/18', '2026-02-30', '2026-10-21']) {
      expect((await call({ path: '/api/me/summary', query: { date } })).statusCode).toBe(400)
    }
  })
  it('MT-H16-07 AI が失敗・空のときは定型文（パートナーの口調）', async () => {
    br.on(ConverseCommand).rejects(awsError('ThrottlingException'))
    users.findBySub.mockResolvedValue({ ...learner, partnerPersona: 'logic', partnerName: 'セージ' })
    const logic = parse(await call({ path: '/api/me/summary' }))
    expect(logic.comment.text).toContain('2問に取り組み、0問を正解・合格しました。')
    expect(logic.markdown).toContain('## セージからのコメント')
    br.reset()
    br.on(ConverseCommand).resolves(converseOutput('  '))
    users.findBySub.mockResolvedValue({ ...learner, partnerPersona: null, partnerName: null })
    const none = parse(await call({ path: '/api/me/summary' }))
    expect(none.comment).toMatchObject({ partnerName: null, persona: 'encourage' })
    expect(none.comment.text).toContain('2問がんばったね！')
  })
  it('MT-H16-08 ニックネーム未登録は使えない', async () => {
    users.findBySub.mockResolvedValue({ ...learner, nickname: null })
    expect((await call({ path: '/api/me/summary' })).statusCode).toBe(409)
  })
})
