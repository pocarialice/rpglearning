import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
vi.mock('../../../../../functions/shared/db/repositories/users.js')
vi.mock('../../../../../functions/shared/db/repositories/course-records.js')
import * as users from '../../../../../functions/shared/db/repositories/users.js'
import * as records from '../../../../../functions/shared/db/repositories/course-records.js'
import { main } from '../../../../../functions/api-handler/index.mjs'
import { WEAK_LIMIT } from '../../../../../functions/api-handler/routes/course-records.js'
import { httpEvent, parse } from '../../../../fixtures/events/http.js'
import { memoryLogger } from '../../../../helpers/logger.js'
import { bedrockMock, awsError } from '../../../../helpers/mocks.js'
import { converseOutput } from '../../../../fixtures/bedrock/grading.js'
import { NOW } from '../../../../helpers/clock.js'
import { learner } from '../../../../fixtures/users.js'
const br = bedrockMock()
const call = (opts) => main(httpEvent(opts), { log: memoryLogger(), now: NOW })
const NW = { courseId: 3, name: 'ネットワーク', certification: 'ネットワークスペシャリスト', enrolledOn: '2026-09-14', studySeconds: 67320, lastStudiedOn: '2026-10-19', publishedCount: 200, answeredQuestions: 125, choiceCount: 360, choiceCorrect: 288 }
const ACE = { courseId: 4, name: 'ACE', certification: null, enrolledOn: null, studySeconds: 0, lastStudiedOn: null, publishedCount: 0, answeredQuestions: 0, choiceCount: 0, choiceCorrect: 0 }
const COUNTS = { adventureCount: 46, answerCount: 412, correctCount: 322, reviewAnswerCount: 120, choiceCount: 360, choiceCorrect: 288, explainCount: 52, explainPassed: 34, explainAvgScore: 68, mastered: 41, dueToday: 7 }
const WEAK = [
  { kind: 'choice', questionId: 42, questionBody: 'OSPF の <b>エリア</b>境界ルータ', keywordId: null, keyword: null, stage: 1, missCount: 3, lastScore: null, missingPoints: [] },
  { kind: 'explain', questionId: 43, questionBody: '出典', keywordId: 7, keyword: 'VRRP', stage: 2, missCount: 2, lastScore: 45, missingPoints: ['優先度'] }
]
const COMMENT = 'ミナだよ。'.repeat(40)
describe('M-H17 course-records（A-12d・A-12e）', () => {
  beforeEach(() => {
    br.reset()
    br.on(ConverseCommand).resolves(converseOutput(COMMENT))
    users.findBySub.mockResolvedValue({ ...learner, totalStudySeconds: 111900 })
    records.listForUser.mockResolvedValue([NW, ACE])
    records.findForUser.mockImplementation(async (userId, courseId) => (userId === 15 && courseId === 3 ? NW : null))
    records.detailCounts.mockResolvedValue(COUNTS)
    records.listWeak.mockResolvedValue(WEAK)
  })
  it('MT-H17-01 一覧：全コースの累計と、コースごとの学習時間・正答率・網羅率', async () => {
    const res = await call({ path: '/api/me/courses' })
    expect(res.statusCode).toBe(200)
    expect(records.listForUser).toHaveBeenCalledWith(15)
    const body = parse(res)
    expect(body).toMatchObject({ totalStudySeconds: 111900, totalStudyTime: '31時間5分' })
    expect(body.courses).toEqual([
      { id: 'c_3', name: 'ネットワーク', certification: 'ネットワークスペシャリスト', current: true, enrolled: true, enrolledOn: '2026-09-14', lastStudiedOn: '2026-10-19', studySeconds: 67320, studyTime: '18時間42分', coveragePct: 62.5, correctPct: 80 },
      { id: 'c_4', name: 'ACE', certification: null, current: false, enrolled: false, enrolledOn: null, lastStudiedOn: null, studySeconds: 0, studyTime: '0秒', coveragePct: 0, correctPct: null }
    ])
  })
  it('MT-H17-02 詳細：内訳・習得済み・今日の復習・苦手な問題（上位3つ）', async () => {
    const body = parse(await call({ path: '/api/me/courses/c_3' }))
    expect(records.detailCounts).toHaveBeenCalledWith(15, 3, '2026-10-20')
    expect(records.listWeak).toHaveBeenCalledWith(15, 3, WEAK_LIMIT)
    expect(body).toMatchObject({
      id: 'c_3', studyTime: '18時間42分', adventureCount: 46, answerCount: 412,
      choice: { count: 360, correct: 288 }, explain: { count: 52, passed: 34, avgScore: 68 }, mastered: 41, dueToday: 7
    })
    expect(body.weak).toEqual([
      { kind: 'choice', label: 'OSPF の エリア 境界ルータ', missCount: 3, score: null, missingPoints: [] },
      { kind: 'explain', label: 'VRRP', missCount: 2, score: 45, missingPoints: ['優先度'] }
    ])
  })
  it('MT-H17-03 詳細：解答がなければ 0 と null', async () => {
    records.detailCounts.mockResolvedValue(null)
    records.listWeak.mockResolvedValue([])
    const body = parse(await call({ path: '/api/me/courses/c_3' }))
    expect(body).toMatchObject({ adventureCount: 0, answerCount: 0, choice: { count: 0, correct: 0 }, explain: { count: 0, passed: 0, avgScore: null }, mastered: 0, dueToday: 0, weak: [] })
  })
  it('MT-H17-04 受講も解答もしていないコースは 404、ID の形式違いは 400', async () => {
    expect((await call({ path: '/api/me/courses/c_9' })).statusCode).toBe(404)
    expect((await call({ path: '/api/me/courses/c_9/comment' })).statusCode).toBe(404)
    expect((await call({ path: '/api/me/courses/q_3' })).statusCode).toBe(400)
    expect(records.detailCounts).not.toHaveBeenCalled()
  })
  it('MT-H17-05 コメント：コース名・数・苦手を AI に渡す', async () => {
    const body = parse(await call({ path: '/api/me/courses/c_3/comment' }))
    expect(body).toEqual({ courseId: 'c_3', comment: { partnerName: 'ミナ', persona: 'encourage', text: COMMENT } })
    const input = br.commandCalls(ConverseCommand)[0].args[0].input
    expect(input.modelId).toBe('model-light')
    expect(input.system[0].text).toContain('1つのコースのこれまでの学習全体')
    const text = input.messages[0].content[0].text
    expect(text).toContain('<course>ネットワーク</course>')
    expect(text).toContain('学習時間：18時間42分')
    expect(text).toContain('解いた問題：412問（うち復習 120問）')
    expect(text).toContain('冒険の回数：46回\n網羅率：62.5%\n習得済み：41問\n今日の復習：7問')
    expect(text).toContain('<weak>OSPF の エリア 境界ルータ（3回まちがい）\nVRRP（2回まちがい・足りない観点：優先度）</weak>')
  })
  it('MT-H17-06 コメント：AI が失敗したら定型文、解答がなければ AI を呼ばず null', async () => {
    br.on(ConverseCommand).rejects(awsError('ThrottlingException'))
    const failed = parse(await call({ path: '/api/me/courses/c_3/comment' }))
    expect(failed.comment.text).toContain('412問がんばったね！')
    expect(failed.comment.text).toContain('「OSPF の エリア 境界ルータ」')
    br.reset()
    records.detailCounts.mockResolvedValue({ ...COUNTS, answerCount: 0 })
    expect(parse(await call({ path: '/api/me/courses/c_3/comment' })).comment).toBeNull()
    expect(br.commandCalls(ConverseCommand)).toHaveLength(0)
  })
  it('MT-H17-07 ニックネーム未登録は使えない', async () => {
    users.findBySub.mockResolvedValue({ ...learner, nickname: null })
    expect((await call({ path: '/api/me/courses' })).statusCode).toBe(409)
  })
})
