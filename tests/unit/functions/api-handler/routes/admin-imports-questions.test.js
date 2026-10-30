import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PutObjectCommand } from '@aws-sdk/client-s3'
vi.mock('../../../../../functions/shared/db/repositories/users.js')
vi.mock('../../../../../functions/shared/db/repositories/courses.js')
vi.mock('../../../../../functions/shared/db/repositories/imports.js')
vi.mock('../../../../../functions/shared/db/repositories/jobs.js')
import * as users from '../../../../../functions/shared/db/repositories/users.js'
import * as courses from '../../../../../functions/shared/db/repositories/courses.js'
import * as imports from '../../../../../functions/shared/db/repositories/imports.js'
import * as jobs from '../../../../../functions/shared/db/repositories/jobs.js'
import { main } from '../../../../../functions/api-handler/index.mjs'
import { safeFileName } from '../../../../../functions/api-handler/routes/admin-imports.js'
import { httpEvent, parse } from '../../../../fixtures/events/http.js'
import { memoryLogger } from '../../../../helpers/logger.js'
import { s3Mock, dbMock, routeSql, records, executed } from '../../../../helpers/mocks.js'
import { NOW } from '../../../../helpers/clock.js'
import { courseAdmin } from '../../../../fixtures/users.js'
const s3 = s3Mock()
const db = dbMock()
// 監査ログ（audit.js）の2番目のパラメータが action
const auditAction = () => executed(db).find((i) => i.sql.includes('INSERT INTO audit_logs')).values[1]
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
    db.reset()
    imports.create.mockResolvedValue(8)
    jobs.enqueue.mockReset().mockResolvedValue(1)
  })
  const create = (body) => call({ method: 'POST', path: '/api/admin/imports', body: { courseId: 'c_3', ...body } })
  it('MT-H09-01 PDFの取り込み', async () => {
    const res = await create({ sourceType: 'pdf', fileName: 'sample.pdf', contentType: 'application/pdf', size: 5 * MB })
    expect(res.statusCode).toBe(201)
    const body = parse(res)
    expect(body.importId).toBe('imp_8')
    const url = new URL(body.uploadUrl)
    // オブジェクトストレージ（S3互換）はパス形式の URL
    expect(url.hostname).toBe('s3.test.example')
    expect(url.pathname).toBe('/rpg-test-import/uploads/8/sample.pdf')
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900')
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type')
    expect(imports.setKey).toHaveBeenCalledWith(8, 'uploads/8/sample.pdf', imports.create.mock.calls[0][1])
    expect(db.commits()).toBe(1)
    // ファイルは画面がアップロードしてから A-13b でキューに入れる
    expect(jobs.enqueue).not.toHaveBeenCalled()
    expect(imports.create.mock.calls[0][0]).toMatchObject({ courseId: 3, userId: 2, sourceType: 'pdf', fileName: 'sample.pdf' })
    expect(s3.commandCalls(PutObjectCommand)).toHaveLength(0)
  })
  it('MT-H09-02 テキストの取り込み', async () => {
    const res = await create({ sourceType: 'text', text: 'あ'.repeat(1000) })
    expect(res.statusCode).toBe(201)
    expect(parse(res)).toEqual({ importId: 'imp_8' })
    const input = s3.commandCalls(PutObjectCommand)[0].args[0].input
    expect(input).toMatchObject({ Bucket: 'rpg-test-import', Key: 'uploads/8/source.txt', Body: 'あ'.repeat(1000) })
    expect(jobs.enqueue).toHaveBeenCalledWith('import', { importId: 8 })
  })
  it('MT-H09-03 担当外のコース', async () => {
    const res = await create({ courseId: 'c_4', sourceType: 'text', text: 'abc' })
    expect(res.statusCode).toBe(403)
    expect(imports.create).not.toHaveBeenCalled()
  })
  it('MT-H09-04 ファイル名の無害化', async () => {
    const body = parse(await create({ sourceType: 'pdf', fileName: '試験 問題(1).pdf', contentType: 'application/pdf', size: MB }))
    expect(imports.setKey.mock.calls[0][1].endsWith('/______1_.pdf')).toBe(true)
    expect(new URL(body.uploadUrl).pathname).toBe('/rpg-test-import/uploads/8/______1_.pdf')
    expect(safeFileName('a'.repeat(150) + '.png')).toHaveLength(100)
  })
  it('MT-H09-05 サイズ超え', async () => {
    const res = await create({ sourceType: 'pdf', fileName: 'big.pdf', contentType: 'application/pdf', size: 21 * MB })
    expect(res.statusCode).toBe(400)
    expect(imports.create).not.toHaveBeenCalled()
  })
  it('MT-H09-06 取り込み状況', async () => {
    imports.find.mockResolvedValue({ importId: 8, courseId: 3, sourceType: 'pdf', fileName: 'sample.pdf', status: 'done', extractedCount: 3, errorMessage: null })
    db.reset()
    const q = (id, body, choices, kws, status) => ({ question_id: id, body, correct_choice: 1, explanation: 'e', status, choices: JSON.stringify(choices), keywords: JSON.stringify(kws.map((k, i) => ({ keywordId: i + 1, keyword: k }))) })
    routeSql(db, [[/FROM questions q\s+WHERE q.import_id/, records([
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
    expect(typeof imports.create.mock.calls[0][1].query).toBe('function')
    expect(db.rollbacks()).toBe(1)
    expect(db.commits()).toBe(0)
    expect(s3.commandCalls(PutObjectCommand)).toHaveLength(0)
  })
  it('MT-H09-09 アップロード完了（A-13b）でキューに入れる', async () => {
    const up = () => call({ method: 'POST', path: '/api/admin/imports/imp_9/uploaded' })
    imports.find.mockResolvedValue({ importId: 9, courseId: 3, sourceType: 'pdf', status: 'waiting' })
    const res = await up()
    expect(res.statusCode).toBe(202)
    expect(parse(res)).toEqual({ importId: 'imp_9', status: 'waiting' })
    expect(jobs.enqueue).toHaveBeenCalledWith('import', { importId: 9 })
    imports.find.mockResolvedValue({ importId: 9, courseId: 3, sourceType: 'pdf', status: 'extracting' })
    expect((await up()).statusCode).toBe(409)
    imports.find.mockResolvedValue({ importId: 9, courseId: 3, sourceType: 'text', status: 'waiting' })
    expect((await up()).statusCode).toBe(404)
    imports.find.mockResolvedValue(null)
    expect((await up()).statusCode).toBe(404)
    imports.find.mockResolvedValue({ importId: 9, courseId: 4, sourceType: 'image', status: 'waiting' })
    expect((await up()).statusCode).toBe(403)
    expect(jobs.enqueue).toHaveBeenCalledTimes(1)
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
    db.reset()
    routeSql(db, [
      [/FROM questions q WHERE q.question_id/, records(row ? [row] : [])],
      [/SELECT choice_no AS no/, records(choiceNos.map((no) => ({ no })))],
      [/SELECT sort_order AS no/, records(kwNos.map((no) => ({ no })))]
    ])
  }
  const sqls = () => executed(db).map((i) => i.sql.replace(/\s+/g, ' '))
  const put = (body) => call({ method: 'PUT', path: '/api/admin/questions/q_42', body: { body: '問題文', choices: ['ア', 'イ改', 'ウ', 'エ'], correctChoice: 2, explanation: '解説', keywords: ['DNS', 'TTL改', 'A'], ...body } })
  it('MT-H10-01 番号ごとの更新', async () => {
    setup(question())
    const res = await put({})
    expect(res.statusCode).toBe(200)
    const all = sqls()
    expect(all.filter((s) => s.startsWith('UPDATE choices'))).toHaveLength(4)
    expect(all.filter((s) => s.startsWith('UPDATE keywords'))).toHaveLength(3)
    expect(all.some((s) => /^(DELETE|INSERT INTO) (choices|keywords)/.test(s))).toBe(false)
    // UPDATE の値の順：value・questionId・no
    const kw2 = executed(db).find((i) => i.sql.startsWith('UPDATE keywords') && i.values[2] === 2)
    expect(kw2.values[0]).toBe('TTL改')
    expect(auditAction()).toBe('question.update')
    expect(db.commits()).toBe(1)
  })
  it('MT-H10-02 キーワードを減らす', async () => {
    setup(question())
    await put({ keywords: ['DNS', 'TTL'] })
    const deletes = executed(db).filter((i) => i.sql.startsWith('DELETE'))
    expect(deletes).toHaveLength(1)
    expect(deletes[0].sql).toContain('DELETE FROM keywords WHERE question_id = $1 AND sort_order > $2')
    expect(deletes[0].values[1]).toBe(2)
  })
  it('MT-H10-03 下書きの削除', async () => {
    setup(question({ status: 'draft' }))
    const res = await call({ method: 'DELETE', path: '/api/admin/questions/q_42' })
    expect(parse(res)).toEqual({ id: 'q_42', result: 'deleted' })
    expect(sqls().some((s) => s.startsWith("DELETE FROM questions WHERE question_id = $1 AND status IN ('draft', 'needs_review')"))).toBe(true)
    expect(auditAction()).toBe('question.delete')
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
    expect(auditAction()).toBe('question.publish')
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
    db.reset()
    routeSql(db, [
      [/FROM questions q WHERE q.question_id/, records([question({ status: 'draft' })])],
      [/^UPDATE questions/, { updated: 0 }]
    ])
    expect((await call({ method: 'POST', path: '/api/admin/questions/q_42/publish' })).statusCode).toBe(409)
    expect((await put({})).statusCode).toBe(409)
  })
  it('MT-H10-10 登録済みの問題の一覧（A-15b）', async () => {
    db.reset()
    routeSql(db, [[/FROM questions q\s+WHERE q.course_id/, records([question(), question({ question_id: 43, status: 'draft' })])]])
    const res = await call({ path: '/api/admin/questions', query: { course: 'c_3' } })
    expect(res.statusCode).toBe(200)
    const body = parse(res)
    expect(body.courseId).toBe('c_3')
    expect(body.questions.map((x) => [x.id, x.status])).toEqual([['q_42', 'published'], ['q_43', 'draft']])
    expect(body.questions[0]).toMatchObject({ bodyHead: '問題文', choiceCount: 4, correctChoice: 2, keywords: ['DNS', 'TTL', 'A'], keywordCount: 3 })
    expect(executed(db)[0].values).toEqual([3, null, null])
    await call({ path: '/api/admin/questions', query: { course: 'c_3', status: 'published', import: 'imp_8' } })
    expect(executed(db)[1].values).toEqual([3, 'published', 8])
  })
  it('MT-H10-11 一覧の状態の指定が正しくない・担当外', async () => {
    db.reset()
    routeSql(db, [[/FROM questions q\s+WHERE q.course_id/, records([])]])
    const bad = await call({ path: '/api/admin/questions', query: { course: 'c_3', status: 'archived' } })
    expect(bad.statusCode).toBe(400)
    expect(parse(bad).error.details[0]).toMatchObject({ field: 'status' })
    expect((await call({ path: '/api/admin/questions', query: { course: 'c_4' } })).statusCode).toBe(403)
    expect((await call({ path: '/api/admin/questions', query: { course: 'c_3', import: '8' } })).statusCode).toBe(400)
    expect(executed(db)).toHaveLength(0)
  })
  describe('A-16b まとめて公開・削除', () => {
    const row = (id, patch = {}) => question({ question_id: id, status: 'draft', keywords: JSON.stringify([{ keywordId: id, keyword: 'DNS' }]), ...patch })
    const bulk = (body) => call({ method: 'POST', path: '/api/admin/questions/bulk', body })
    const setRows = (rows, extra = []) => {
      db.reset()
      routeSql(db, [[/FROM questions q\s+WHERE q.question_id = ANY/, records(rows)], ...extra])
    }
    const publishes = () => executed(db).filter((i) => i.sql.includes("SET status = 'published'"))
    const audits = () => executed(db).filter((i) => i.sql.includes('INSERT INTO audit_logs'))
    it('MT-H10-12 まとめて公開：公開できる下書き・要確認だけ公開し、残りの数を返す', async () => {
      setRows([row(100), row(101, { status: 'needs_review', choices: JSON.stringify(['ア', 'イ', 'ウ']) }), row(102, { explanation: '' }), row(103, { status: 'needs_review' }), row(104, { status: 'published' }), row(105, { status: 'archived' })])
      const res = await bulk({ action: 'publish', ids: ['q_100', 'q_101', 'q_102', 'q_103', 'q_104', 'q_105', 'q_106', 'q_100'] })
      expect(res.statusCode).toBe(200)
      expect(parse(res)).toEqual({ action: 'publish', done: 2, skipped: 5, ids: ['q_100', 'q_103'] })
      expect(publishes().map((i) => i.values[1])).toEqual([100, 103])
      expect(audits().map((i) => i.values[1])).toEqual(['question.publish', 'question.publish'])
      expect(executed(db)[0].values).toEqual(['100,101,102,103,104,105,106'])
      expect(db.commits()).toBe(1)
      // 先に公開・削除されていた（更新0件）は数えない
      setRows([row(100)], [[/^UPDATE questions/, { updated: 0 }]])
      expect(parse(await bulk({ action: 'publish', ids: ['q_100'] }))).toMatchObject({ done: 0, skipped: 1 })
      expect(audits()).toHaveLength(0)
    })
    it('MT-H10-13 まとめて削除：下書き・要確認は削除、公開済みは archived', async () => {
      setRows([row(100), row(101, { status: 'needs_review' }), row(102, { status: 'published' })])
      const res = await bulk({ action: 'delete', ids: ['q_100', 'q_101', 'q_102'] })
      expect(parse(res)).toEqual({ action: 'delete', done: 3, skipped: 0, ids: ['q_100', 'q_101', 'q_102'] })
      const sql = executed(db).map((i) => i.sql.replace(/\s+/g, ' '))
      expect(sql.filter((x) => x.startsWith('DELETE FROM questions'))).toHaveLength(2)
      expect(sql.filter((x) => x.startsWith("UPDATE questions SET status = 'archived'"))).toHaveLength(1)
      expect(audits().map((i) => i.values[1])).toEqual(['question.delete', 'question.delete', 'question.delete'])
      expect(db.commits()).toBe(1)
    })
    it('MT-H10-14 入力の検証・担当外のコースが混ざる', async () => {
      setRows([])
      for (const bad of [{ action: 'archive', ids: ['q_1'] }, { action: 'publish', ids: [] }, { action: 'delete' }, { action: 'delete', ids: Array.from({ length: 501 }, (_, i) => `q_${i + 1}`) }, { action: 'delete', ids: ['42'] }]) {
        expect((await bulk(bad)).statusCode).toBe(400)
      }
      setRows([row(100), row(101, { course_id: 4 })])
      expect((await bulk({ action: 'delete', ids: ['q_100', 'q_101'] })).statusCode).toBe(403)
      expect(executed(db).some((i) => /^(DELETE|UPDATE)/.test(i.sql))).toBe(false)
    })
  })
})
