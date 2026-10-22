import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { CommitTransactionCommand, RollbackTransactionCommand } from '@aws-sdk/client-rds-data'
vi.mock('../../../../../functions/shared/db/repositories/users.js')
vi.mock('../../../../../functions/shared/db/repositories/courses.js')
vi.mock('../../../../../functions/shared/db/repositories/imports.js')
import * as users from '../../../../../functions/shared/db/repositories/users.js'
import * as courses from '../../../../../functions/shared/db/repositories/courses.js'
import * as imports from '../../../../../functions/shared/db/repositories/imports.js'
import { main } from '../../../../../functions/api-handler/index.mjs'
import { safeFileName } from '../../../../../functions/api-handler/routes/admin-imports.js'
import { httpEvent, parse } from '../../../../fixtures/events/http.js'
import { memoryLogger } from '../../../../helpers/logger.js'
import { s3Mock, rdsMock, routeSql, records, executed } from '../../../../helpers/aws-mocks.js'
import { NOW } from '../../../../helpers/clock.js'
import { courseAdmin } from '../../../../fixtures/users.js'
const s3 = s3Mock()
const rds = rdsMock()
const call = (opts) => main(httpEvent({ groups: ['course_admin', 'learner'], sub: 'sub-2', ...opts }), { log: memoryLogger(), now: NOW })
const MB = 1024 * 1024
beforeEach(() => {
  users.findBySub.mockResolvedValue({ ...courseAdmin, nickname: null })
  courses.isAdmin.mockImplementation(async (courseId, userId) => courseId === 3 && userId === 2)
})
describe('M-H09 admin-imports（A-13・A-14）', () => {
  beforeEach(() => {
    s3.reset()
    s3.on(PutObjectCommand).resolves({})
    rds.reset()
    routeSql(rds, [])
    imports.create.mockResolvedValue(8)
  })
  const create = (body) => call({ method: 'POST', path: '/api/admin/imports', body: { courseId: 'c_3', ...body } })
  it('MT-H09-01 PDFの取り込み', async () => {
    const res = await create({ sourceType: 'pdf', fileName: 'sample.pdf', contentType: 'application/pdf', size: 5 * MB })
    expect(res.statusCode).toBe(201)
    const body = parse(res)
    expect(body.importId).toBe('imp_8')
    const url = new URL(body.uploadUrl)
    expect(url.hostname).toBe('rpg-test-import.s3.ap-northeast-1.amazonaws.com')
    expect(url.pathname).toBe('/uploads/8/sample.pdf')
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900')
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type')
    expect(imports.setKey).toHaveBeenCalledWith(8, 'uploads/8/sample.pdf', expect.objectContaining({ transactionId: 'tx-1' }))
    expect(rds.commandCalls(CommitTransactionCommand)).toHaveLength(1)
    expect(imports.create.mock.calls[0][0]).toMatchObject({ courseId: 3, userId: 2, sourceType: 'pdf', fileName: 'sample.pdf' })
    expect(s3.commandCalls(PutObjectCommand)).toHaveLength(0)
  })
  it('MT-H09-02 テキストの取り込み', async () => {
    const res = await create({ sourceType: 'text', text: 'あ'.repeat(1000) })
    expect(res.statusCode).toBe(201)
    expect(parse(res)).toEqual({ importId: 'imp_8' })
    const input = s3.commandCalls(PutObjectCommand)[0].args[0].input
    expect(input).toMatchObject({ Bucket: 'rpg-test-import', Key: 'uploads/8/source.txt', Body: 'あ'.repeat(1000) })
  })
  it('MT-H09-03 担当外のコース', async () => {
    const res = await create({ courseId: 'c_4', sourceType: 'text', text: 'abc' })
    expect(res.statusCode).toBe(403)
    expect(imports.create).not.toHaveBeenCalled()
  })
  it('MT-H09-04 ファイル名の無害化', async () => {
    const body = parse(await create({ sourceType: 'pdf', fileName: '試験 問題(1).pdf', contentType: 'application/pdf', size: MB }))
    expect(imports.setKey.mock.calls[0][1].endsWith('/______1_.pdf')).toBe(true)
    expect(new URL(body.uploadUrl).pathname).toBe('/uploads/8/______1_.pdf')
    expect(safeFileName('a'.repeat(150) + '.png')).toHaveLength(100)
  })
  it('MT-H09-05 サイズ超え', async () => {
    const res = await create({ sourceType: 'pdf', fileName: 'big.pdf', contentType: 'application/pdf', size: 21 * MB })
    expect(res.statusCode).toBe(400)
    expect(imports.create).not.toHaveBeenCalled()
  })
  it('MT-H09-06 取り込み状況', async () => {
    imports.find.mockResolvedValue({ importId: 8, courseId: 3, sourceType: 'pdf', fileName: 'sample.pdf', status: 'done', extractedCount: 3, errorMessage: null })
    rds.reset()
    const q = (id, body, choices, kws, status) => ({ question_id: id, body, correct_choice: 1, explanation: 'e', status, choices: JSON.stringify(choices), keywords: JSON.stringify(kws.map((k, i) => ({ keywordId: i + 1, keyword: k }))) })
    routeSql(rds, [[/FROM questions q\s+WHERE q.import_id/, records([
      q(100, 'あ'.repeat(60), ['ア', 'イ', 'ウ', 'エ'], ['DNS', 'TTL'], 'draft'),
      q(101, '問2', ['ア', 'イ', 'ウ'], [], 'needs_review'),
      q(102, '問3', ['ア', 'イ', 'ウ', 'エ'], ['A'], 'draft')
    ])]])
    const body = parse(await call({ path: '/api/admin/imports/imp_8' }))
    expect(body).toMatchObject({ importId: 'imp_8', courseId: 'c_3', status: 'done', extractedCount: 3 })
    expect(body.drafts).toHaveLength(3)
    expect(body.drafts[0]).toMatchObject({ id: 'q_100', bodyHead: 'あ'.repeat(40), choiceCount: 4, keywordCount: 2, status: 'draft' })
    expect(body.drafts[1]).toMatchObject({ choiceCount: 3, keywordCount: 0, status: 'needs_review' })
  })
  it('MT-H09-08 登録の途中で失敗（仮の値を残さない）', async () => {
    imports.setKey.mockRejectedValue(new Error('setKey failed'))
    const res = await create({ sourceType: 'text', text: 'abc' })
    expect(res.statusCode).toBe(500)
    expect(imports.create.mock.calls[0][1].transactionId).toBe('tx-1')
    expect(rds.commandCalls(RollbackTransactionCommand)).toHaveLength(1)
    expect(rds.commandCalls(CommitTransactionCommand)).toHaveLength(0)
    expect(s3.commandCalls(PutObjectCommand)).toHaveLength(0)
  })
  it('MT-H09-07 取り込みがない・担当外・コースごとの一覧', async () => {
    imports.find.mockResolvedValue(null)
    expect((await call({ path: '/api/admin/imports/imp_9' })).statusCode).toBe(404)
    imports.find.mockResolvedValue({ importId: 9, courseId: 4 })
    expect((await call({ path: '/api/admin/imports/imp_9' })).statusCode).toBe(403)
    imports.listByCourse.mockResolvedValue([{ importId: 8, sourceType: 'pdf', fileName: 'a.pdf', status: 'failed', extractedCount: 0, errorMessage: '50ページ以内に分けて取り込んでください', createdAt: '2026-10-19 15:00:00' }])
    const list = parse(await call({ path: '/api/admin/imports', query: { course: 'c_3' } })).imports
    expect(list).toEqual([{ importId: 'imp_8', sourceType: 'pdf', fileName: 'a.pdf', status: 'failed', extractedCount: 0, errorMessage: '50ページ以内に分けて取り込んでください', createdAt: '2026-10-20T00:00:00+09:00' }])
  })
})
describe('M-H10 admin-questions（A-15・A-16）', () => {
  const question = (patch = {}) => ({
    question_id: 42, course_id: 3, import_id: 8, body: '問題文', correct_choice: 2, explanation: '解説', status: 'published',
    choices: JSON.stringify(['ア', 'イ', 'ウ', 'エ']), keywords: JSON.stringify([{ keywordId: 1, keyword: 'DNS' }, { keywordId: 2, keyword: 'TTL' }, { keywordId: 3, keyword: 'A' }]), ...patch
  })
  const setup = (row, { choiceNos = [1, 2, 3, 4], kwNos = [1, 2, 3] } = {}) => {
    rds.reset()
    routeSql(rds, [
      [/FROM questions q WHERE q.question_id/, records(row ? [row] : [])],
      [/SELECT choice_no AS no/, records(choiceNos.map((no) => ({ no })))],
      [/SELECT sort_order AS no/, records(kwNos.map((no) => ({ no })))]
    ])
  }
  const sqls = () => executed(rds).map((i) => i.sql.replace(/\s+/g, ' '))
  const put = (body) => call({ method: 'PUT', path: '/api/admin/questions/q_42', body: { body: '問題文', choices: ['ア', 'イ改', 'ウ', 'エ'], correctChoice: 2, explanation: '解説', keywords: ['DNS', 'TTL改', 'A'], ...body } })
  it('MT-H10-01 番号ごとの更新', async () => {
    setup(question())
    const res = await put({})
    expect(res.statusCode).toBe(200)
    const all = sqls()
    expect(all.filter((s) => s.startsWith('UPDATE choices'))).toHaveLength(4)
    expect(all.filter((s) => s.startsWith('UPDATE keywords'))).toHaveLength(3)
    expect(all.some((s) => /^(DELETE|INSERT INTO) (choices|keywords)/.test(s))).toBe(false)
    const kw2 = executed(rds).find((i) => i.sql.startsWith('UPDATE keywords') && i.parameters.find((p) => p.name === 'no').value.longValue === 2)
    expect(kw2.parameters.find((p) => p.name === 'value').value.stringValue).toBe('TTL改')
    const auditRow = executed(rds).find((i) => i.sql.includes('INSERT INTO audit_logs'))
    expect(auditRow.parameters.find((p) => p.name === 'action').value.stringValue).toBe('question.update')
    expect(auditRow.transactionId).toBe('tx-1')
  })
  it('MT-H10-02 キーワードを減らす', async () => {
    setup(question())
    await put({ keywords: ['DNS', 'TTL'] })
    const deletes = executed(rds).filter((i) => i.sql.startsWith('DELETE'))
    expect(deletes).toHaveLength(1)
    expect(deletes[0].sql).toContain('DELETE FROM keywords WHERE question_id = :questionId AND sort_order > :count')
    expect(deletes[0].parameters.find((p) => p.name === 'count').value.longValue).toBe(2)
  })
  it('MT-H10-03 下書きの削除', async () => {
    setup(question({ status: 'draft' }))
    const res = await call({ method: 'DELETE', path: '/api/admin/questions/q_42' })
    expect(parse(res)).toEqual({ id: 'q_42', result: 'deleted' })
    expect(sqls().some((s) => s.startsWith("DELETE FROM questions WHERE question_id = :questionId AND status IN ('draft', 'needs_review')"))).toBe(true)
    const auditRow = executed(rds).find((i) => i.sql.includes('INSERT INTO audit_logs'))
    expect(auditRow.parameters.find((p) => p.name === 'action').value.stringValue).toBe('question.delete')
  })
  it('MT-H10-04 公開済みの削除', async () => {
    setup(question())
    const res = await call({ method: 'DELETE', path: '/api/admin/questions/q_42' })
    expect(parse(res).result).toBe('archived')
    expect(sqls().some((s) => s.startsWith("UPDATE questions SET status = 'archived'"))).toBe(true)
    expect(sqls().some((s) => s.startsWith('DELETE FROM questions'))).toBe(false)
  })
  it('MT-H10-05 公開できない', async () => {
    setup(question({ status: 'needs_review', choices: JSON.stringify(['ア', 'イ', 'ウ']) }))
    const res = await call({ method: 'POST', path: '/api/admin/questions/q_42/publish' })
    expect(res.statusCode).toBe(400)
    expect(parse(res).error.details[0]).toMatchObject({ code: 'M-12', field: 'choices' })
    expect(sqls().some((s) => s.includes("SET status = 'published'"))).toBe(false)
  })
  it('MT-H10-06 公開', async () => {
    setup(question({ status: 'draft' }))
    const res = await call({ method: 'POST', path: '/api/admin/questions/q_42/publish' })
    expect(parse(res)).toEqual({ id: 'q_42', status: 'published' })
    expect(sqls().some((s) => s.includes("SET status = 'published', published_at = now()"))).toBe(true)
    const auditRow = executed(rds).find((i) => i.sql.includes('INSERT INTO audit_logs'))
    expect(auditRow.parameters.find((p) => p.name === 'action').value.stringValue).toBe('question.publish')
  })
  it('MT-H10-07 担当外のコースの問題', async () => {
    setup(question({ course_id: 4 }))
    expect((await put({})).statusCode).toBe(403)
    expect((await call({ method: 'POST', path: '/api/admin/questions/q_42/publish' })).statusCode).toBe(403)
    expect(sqls().some((s) => s.startsWith('UPDATE'))).toBe(false)
  })
  it('MT-H10-08 下書きの修正（状態の判定・入力の検証・番号の追加）', async () => {
    setup(question({ status: 'needs_review', choices: JSON.stringify(['ア', 'イ', 'ウ']) }), { choiceNos: [1, 2, 3], kwNos: [] })
    const res = await put({ keywords: ['DNS'] })
    expect(parse(res)).toEqual({ id: 'q_42', status: 'draft' })
    expect(sqls().filter((s) => s.startsWith('INSERT INTO choices'))).toHaveLength(1)
    expect(sqls().filter((s) => s.startsWith('INSERT INTO keywords'))).toHaveLength(1)
    setup(question({ status: 'draft' }))
    expect(parse(await put({ correctChoice: null })).status).toBe('needs_review')
    setup(question())
    expect((await put({ correctChoice: null })).statusCode).toBe(400)
    for (const bad of [{ body: '' }, { choices: ['ア'] }, { correctChoice: 5 }, { keywords: ['a', 'b', 'c', 'd'] }, { keywords: 'DNS' }]) {
      expect((await put(bad)).statusCode).toBe(400)
    }
    expect(parse(await put({ keywords: undefined })).status).toBe('published')
    expect((await put({ explanation: undefined })).statusCode).toBe(400)
  })
  it('MT-H10-09 ない問題・公開済みの公開・状態の食い違い', async () => {
    setup(null)
    expect((await put({})).statusCode).toBe(404)
    setup(question({ status: 'archived' }))
    expect((await call({ method: 'DELETE', path: '/api/admin/questions/q_42' })).statusCode).toBe(404)
    setup(question())
    expect(parse(await call({ method: 'POST', path: '/api/admin/questions/q_42/publish' })).status).toBe('published')
    rds.reset()
    routeSql(rds, [
      [/FROM questions q WHERE q.question_id/, records([question({ status: 'draft' })])],
      [/^UPDATE questions/, { numberOfRecordsUpdated: 0 }]
    ])
    expect((await call({ method: 'POST', path: '/api/admin/questions/q_42/publish' })).statusCode).toBe(409)
    expect((await put({})).statusCode).toBe(409)
  })
})
