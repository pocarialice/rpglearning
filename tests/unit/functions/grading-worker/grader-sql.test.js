// MT-W01-11 は、リポジトリを差し替えずに pg のモックで実際の SQL を通して採点する
import { describe, it, expect } from 'vitest'
import { ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
import { gradeJob } from '../../../../functions/grading-worker/grader.js'
import { memoryLogger } from '../../../helpers/logger.js'
import { bedrockMock, dbMock, routeSql, records } from '../../../helpers/mocks.js'
import { converseOutput, gradingText } from '../../../fixtures/bedrock/grading.js'
import { NOW } from '../../../helpers/clock.js'
const br = bedrockMock()
const db = dbMock()
describe('M-W01 grading-worker（SQLを通した採点）', () => {
  it('MT-W01-11 リポジトリと DB の接続を通した採点', async () => {
    db.reset()
    br.on(ConverseCommand).resolves(converseOutput(gradingText))
    routeSql(db, [
      [/FROM grading_jobs WHERE grading_id/, records([{ grading_id: 456, user_id: 15, course_id: 3, keyword_id: 123, adventure_id: null, explanation_text: '説明', status: 'processing', result: null, created_at: '2026-10-20 01:00:00' }])],
      [/FROM keywords k JOIN questions q/, records([{ keyword_id: 123, keyword: 'DNS', question_id: 42, course_id: 3, body: '問', explanation: '解', status: 'published' }])],
      [/FROM users u WHERE u.user_id/, records([{ user_id: 15, nickname: 'たろう', total_exp: 330, level: 3, partner_persona: 'logic', partner_name: 'セージ', roles: ['learner'] }])],
      [/RETURNING answer_id/, records([{ answer_id: 1 }])],
      [/count\(\*\)::int AS cnt/, records([{ cnt: 0 }])]
    ])
    const res = await gradeJob(456, { log: memoryLogger(), now: () => NOW })
    expect(res.status).toBe('done')
    expect(db.commits()).toBe(1)
    expect(db.calls().find((c) => /UPDATE grading_jobs SET status = 'done'/.test(c.sql)).values).toContain(456)
    expect(res.result).toMatchObject({ score: 72, passed: true, comment: { persona: 'logic', partnerName: 'セージ' } })
  })
})
