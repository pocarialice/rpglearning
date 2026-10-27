// MT-W01-11 は、リポジトリを差し替えずに Data API のモックで DB の起動待ちを再現する
import { describe, it, expect, vi } from 'vitest'
import { ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
import { ExecuteStatementCommand, CommitTransactionCommand } from '@aws-sdk/client-rds-data'
import { main, RESUME_RETRIES } from '../../../../functions/grading-worker/index.mjs'
import { memoryLogger } from '../../../helpers/logger.js'
import { bedrockMock, rdsMock, routeSql, records, awsError } from '../../../helpers/aws-mocks.js'
import { converseOutput, gradingText } from '../../../fixtures/bedrock/grading.js'
import { NOW } from '../../../helpers/clock.js'
const br = bedrockMock()
const rds = rdsMock()
describe('M-W01 grading-worker（DBの起動待ち）', () => {
  it('MT-W01-11 DBの起動待ち', async () => {
    vi.useFakeTimers({ now: NOW })
    br.on(ConverseCommand).resolves(converseOutput(gradingText))
    let resuming = 2
    routeSql(rds, [
      [/FROM grading_jobs WHERE grading_id/, () => {
        if (resuming-- > 0) throw awsError('DatabaseResumingException')
        return records([{ grading_id: 456, user_id: 15, course_id: 3, keyword_id: 123, adventure_id: null, explanation_text: '説明', status: 'processing', result: null, created_at: '2026-10-20 01:00:00' }])
      }],
      [/FROM keywords k JOIN questions q/, records([{ keyword_id: 123, keyword: 'DNS', question_id: 42, course_id: 3, body: '問', explanation: '解', status: 'published' }])],
      [/FROM users u WHERE u.user_id/, records([{ user_id: 15, nickname: 'たろう', total_exp: 330, level: 3, partner_persona: 'logic', partner_name: 'セージ', roles: '["learner"]' }])],
      [/RETURNING answer_id/, records([{ answer_id: 1 }])],
      [/count\(\*\)::int AS cnt/, records([{ cnt: 0 }])]
    ])
    const p = main({ gradingId: 456 }, { log: memoryLogger() })
    await vi.advanceTimersByTimeAsync(10000)
    const res = await p
    expect(RESUME_RETRIES).toBe(6)
    expect(res.status).toBe('done')
    const findCalls = rds.commandCalls(ExecuteStatementCommand).filter((c) => /FROM grading_jobs WHERE grading_id/.test(c.args[0].input.sql))
    expect(findCalls).toHaveLength(3)
    expect(rds.commandCalls(CommitTransactionCommand)).toHaveLength(1)
    expect(res.result).toMatchObject({ score: 72, passed: true, comment: { persona: 'logic', partnerName: 'セージ' } })
  })
})
