import { describe, it, expect, vi } from 'vitest'
import { runChecks, formatTable, parseArgs, missingEnv, CHECKS, HINTS, LONG_TIMEOUT_MS } from '../../../scripts/check-ai.mjs'
import { AppError } from '../../../functions/shared/util/errors.js'
const GRADED = JSON.stringify({ accuracy: 40, coverage: 20, concreteness: 10, score: 70, modelAnswer: 'DNS はドメイン名と IP アドレスを対応づける。', missingPoints: ['逆引き'], comment: '次は PTR も説明してみよう。' })
const EXTRACTED = JSON.stringify({ questions: [{ body: '問1' }, { body: '問2' }] })
// 用途ごとに、それらしい答えを返す。ログには考えた分のトークン数を出す
function fakeConverse(texts = {}, { stopReason = 'end_turn' } = {}) {
  return vi.fn(async ({ purpose, logger }) => {
    logger.info({ msg: 'ai.converse', reasoningTokens: 42 })
    const name = purpose.replace('check-', '')
    return { text: texts[name] ?? { grading: GRADED, extraction: EXTRACTED }[name] ?? 'がんばろう！', usage: { inputTokens: 100, outputTokens: 50 }, stopReason }
  })
}
const env = { MODEL_HIGH: 'gpt-oss-120b', MODEL_LIGHT: 'gpt-oss-120b-light' }
describe('scripts/check-ai（AI の確認）', () => {
  it('MT-S01-01 4つの用途を本番と同じ設定で呼び、使える答えなら OK', async () => {
    const converse = fakeConverse()
    let t = 0
    const rows = await runChecks({ env, converse, now: () => (t += 1000) })
    expect(rows.map((r) => [r.name, r.ok, r.note])).toEqual([
      ['comment', true, '6文字'], ['daily-message', true, '6文字'], ['grading', true, 'JSON OK'], ['extraction', true, '2問 OK']
    ])
    expect(rows[0]).toMatchObject({ modelId: 'gpt-oss-120b-light', inputTokens: 100, outputTokens: 50, reasoningTokens: 42, stopReason: 'end_turn', durationMs: 1000, overProd: false })
    const grading = converse.mock.calls[2][0]
    expect(grading).toMatchObject({ modelId: 'gpt-oss-120b', ...CHECKS.grading.ai, purpose: 'check-grading' })
    expect(grading.messages[0].content[0].text).toContain('<answer>')
    expect(converse.mock.calls[3][0].messages[0].content[0].text).toContain('<source>')
  })
  it('MT-S01-02 答えが使えないときは NG と見るところ', async () => {
    const converse = fakeConverse({ comment: ' ', grading: '{"accuracy":99}', extraction: '{"questions":[{"body":"1"}]}', 'daily-message': 'x' }, { stopReason: 'max_tokens' })
    const rows = await runChecks({ env, converse, now: () => 0 })
    expect(rows.map((r) => [r.ok, r.note])).toEqual([[false, '答えが空'], [true, '1文字'], [false, 'JSON NG（accuracy,coverage,concreteness,modelAnswer,missingPoints,comment）'], [false, '1問（2問のはず）']])
    expect(rows[0].hint).toBe(HINTS.max_tokens)
    expect(rows[1].hint).toBeNull()
    const bad = await runChecks({ names: ['extraction'], env, converse: fakeConverse({ extraction: 'すみません' }), now: () => 0 })
    expect(bad[0]).toMatchObject({ ok: false, note: 'JSON NG', hint: null })
  })
  it('MT-S01-03 呼び出しの失敗・時間切れ、--long・--repeat', async () => {
    let t = 0
    const converse = vi.fn()
      .mockRejectedValueOnce(new AppError('AI_ERROR', undefined, { cause: 'HTTP_401' }))
      .mockRejectedValueOnce(new AppError('AI_TIMEOUT'))
      .mockRejectedValueOnce(new AppError('AI_ERROR', undefined, { cause: 'HTTP_502' }))
    const rows = await runChecks({ names: ['comment'], repeat: 3, env, converse, now: () => (t += 3000) })
    expect(rows.map((r) => [r.attempt, r.ok, r.note, r.hint, r.reasoningTokens])).toEqual([
      [1, false, 'AI_ERROR HTTP_401', HINTS.HTTP_401, null], [2, false, 'AI_TIMEOUT', HINTS.AI_TIMEOUT, null], [3, false, 'AI_ERROR HTTP_502', null, null]
    ])
    expect(rows[0]).toMatchObject({ durationMs: 3000, overProd: false })
    const long = fakeConverse()
    let u = 0
    const [row] = await runChecks({ names: ['comment'], long: true, env, converse: long, now: () => (u += 6000) })
    expect(long.mock.calls[0][0].timeoutMs).toBe(LONG_TIMEOUT_MS)
    expect(row).toMatchObject({ timeoutMs: LONG_TIMEOUT_MS, overProd: true })
  })
  it('MT-S01-04 表にする', async () => {
    const rows = await runChecks({ names: ['comment', 'grading'], env, converse: fakeConverse({ grading: '' }, { stopReason: 'max_tokens' }), now: () => 0 })
    rows[0].overProd = true
    const out = formatTable(rows).split('\n')
    expect(out[0]).toContain('| 用途 |')
    expect(out[2]).toBe('| comment | 1 | gpt-oss-120b-light | OK | 0 ⚠ | 5000 | 100 | 50 | 42 | max_tokens | 6文字 |')
    expect(out[3]).toContain('| grading | 1 | gpt-oss-120b | NG |')
    expect(out.slice(-2)).toEqual(['見るところ', `- grading：${HINTS.max_tokens}`])
    expect(formatTable([{ ...rows[0], modelId: undefined, inputTokens: null }])).toContain('| comment | 1 | - | OK |')
    expect(formatTable([rows[0]])).not.toContain('見るところ')
  })
  it('MT-S01-05 引数と環境変数の確かめ', () => {
    expect(parseArgs([])).toEqual({ names: Object.keys(CHECKS), repeat: 1, long: false })
    expect(parseArgs(['--only=comment,grading', '--repeat=3', '--long'])).toEqual({ names: ['comment', 'grading'], repeat: 3, long: true })
    expect(() => parseArgs(['--only=foo'])).toThrow('--only に使えるのは')
    expect(() => parseArgs(['--repeat=0'])).toThrow('--repeat は1〜10')
    expect(() => parseArgs(['--repeat=x'])).toThrow('--repeat は1〜10')
    expect(() => parseArgs(['--fast'])).toThrow('知らない指定です: --fast')
    expect(missingEnv(['comment'], {})).toEqual(['MODEL_LIGHT', 'AI_API_KEY'])
    expect(missingEnv(['grading', 'extraction'], { AI_PROVIDER: 'bedrock', MODEL_HIGH: 'm' })).toEqual([])
  })
})
