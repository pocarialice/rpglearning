import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setContext } from '../../../../../web/js/core/context.js'
import { createStore } from '../../../../../web/js/core/store.js'
import { ApiError } from '../../../../../web/js/core/api.js'
import * as dashboard from '../../../../../web/js/pages/admin/s12-dashboard.js'
import * as importPage from '../../../../../web/js/pages/admin/s11-import.js'
import { pickCourse } from '../../../../../web/js/pages/admin/_course.js'
const COURSES = [{ id: 'c_3', name: '基本情報' }, { id: 'c_4', name: 'AWS SAA' }]
const L = (fullName, nickname, coveragePct, correctPct, lastLoginAt, logins7d) => ({ userId: `u_${nickname}`, fullName, nickname, email: `${nickname}@x.jp`, coveragePct, correctPct, mastered: 1, level: 2, totalExp: 100, lastLoginAt, logins7d })
const DASH = {
  courseId: 'c_3', summary: { learners: 3, activeRate: 66.7, avgCoveragePct: 40, avgCorrectPct: null },
  learners: [L('山田 太郎', 'たろう', 40, 70, '2026-10-20T08:00:00+09:00', 3), L('佐藤 花子', 'はな', 80, null, null, 0), L('伊藤 次郎', 'じろう', null, 50, '2026-10-19T21:00:00+09:00', 2)]
}
let root, store, api, go
function setup(state = {}) {
  root = document.createElement('div')
  document.body.replaceChildren(root)
  store = createStore({ user: { roles: ['course_admin', 'learner'], adminCourses: COURSES }, ...state })
  api = { apiGet: vi.fn(), apiPost: vi.fn(), apiPut: vi.fn(), apiDelete: vi.fn() }
  go = vi.fn()
  setContext({ api, getState: store.getState, setState: store.setState, go })
}
const q = (sel) => document.querySelector(sel)
const click = (sel) => q(sel).dispatchEvent(new MouseEvent('click', { bubbles: true }))
const flush = () => new Promise((r) => setTimeout(r, 0))
const col = (i) => [...root.querySelectorAll('tbody tr')].map((tr) => tr.children[i].textContent)
beforeEach(() => setup())
afterEach(() => vi.useRealTimers())
describe('M-F20 S-12 管理局のコースの切り替え', () => {
  it('MT-F20-01 URL → 前に選んだコース → 先頭。担当外は使わない', () => {
    expect(pickCourse(COURSES, { course: 'c_4' }, {})).toBe('c_4')
    expect(pickCourse(COURSES, { course: 'c_9' }, { adminCourseId: 'c_4' })).toBe('c_4')
    expect(pickCourse(COURSES, {}, {})).toBe('c_3')
    expect(pickCourse([], {}, {})).toBeNull()
  })
})
describe('M-F20 S-12 学習状況ダッシュボード', () => {
  it('MT-F20-02 担当コースがないときは案内だけ', async () => {
    setup({ user: { roles: ['course_admin'], adminCourses: [] } })
    await dashboard.render(root)
    expect(root.textContent).toContain('担当しているコースがない')
    expect(api.apiGet).not.toHaveBeenCalled()
  })
  it('MT-F20-03 集計と受講者一覧（氏名順）を表示し、コースを切り替えられる', async () => {
    api.apiGet.mockResolvedValue(DASH)
    await dashboard.render(root, { course: 'c_3' })
    expect(api.apiGet).toHaveBeenCalledWith('/admin/dashboard?course=c_3')
    expect([...root.querySelectorAll('.app-stat')].map((s) => s.textContent)).toEqual(['受講者数3 人', 'アクティブ率66.7%', '平均網羅率40.0%', '平均正答率-'])
    expect(col(0)).toEqual(['伊藤 次郎', '佐藤 花子', '山田 太郎'])
    expect(col(4)).toEqual(['2026/10/19 21:00', '-', '2026/10/20 08:00'])
    const select = q('[data-course-select]')
    select.value = 'c_4'
    select.dispatchEvent(new Event('change'))
    expect(store.getState().adminCourseId).toBe('c_4')
    expect(go).toHaveBeenCalledWith('/admin/dashboard?course=c_4')
  })
  it('MT-F20-04 見出しで並べ替え（値がないものは最後）', async () => {
    api.apiGet.mockResolvedValue(DASH)
    await dashboard.render(root)
    click('[data-sort="coveragePct"]')
    expect(col(2)).toEqual(['40.0%', '80.0%', '-'])
    expect(q('th[aria-sort="ascending"]').textContent).toContain('網羅率')
    click('[data-sort="coveragePct"]')
    expect(col(2)).toEqual(['80.0%', '40.0%', '-'])
    expect(q('th[aria-sort="descending"]')).not.toBeNull()
  })
  it('MT-F20-05 CSVで出力する（BOM を付け直して保存）', async () => {
    api.apiGet.mockImplementation(async (path, opts) => (opts?.raw ? '氏名,ニックネーム\r\n' : DASH))
    const blobs = []
    URL.createObjectURL = vi.fn((b) => { blobs.push(b); return 'blob:x' })
    URL.revokeObjectURL = vi.fn()
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { this.dataset.clicked = this.download })
    await dashboard.render(root, { course: 'c_3' })
    click('[data-action="csv"]')
    await flush()
    expect(api.apiGet).toHaveBeenCalledWith('/admin/dashboard.csv?course=c_3', { raw: true })
    expect(clickSpy).toHaveBeenCalled()
    expect([...new Uint8Array(await blobs[0].arrayBuffer()).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(dashboard.withBom('\ufeffa')).toBe('\ufeffa')
  })
  it('MT-F20-06 読み込めないときは再読み込みできる', async () => {
    api.apiGet.mockRejectedValueOnce(new ApiError('NETWORK', 0)).mockResolvedValue(DASH)
    await dashboard.render(root)
    click('[data-action="reload"]')
    await flush()
    expect(root.querySelectorAll('tbody tr')).toHaveLength(3)
  })
})
const DRAFT = (id, extra = {}) => ({ id, bodyHead: '問題文の先頭', body: '問題文の先頭', choiceCount: 4, choices: ['ア1', 'イ2', 'ウ3', 'エ4'], correctChoice: 2, explanation: '解説', keywordCount: 1, keywords: ['DNS'], status: 'draft', ...extra })
const IMPORTS = (status = 'done') => ({ imports: [{ importId: 'imp_8', sourceType: 'pdf', fileName: 'kakomon.pdf', status, extractedCount: 2, errorMessage: null, createdAt: '2026-10-20T10:30:00+09:00' }] })
describe('M-F19 S-11 問題取り込み・レビュー', () => {
  const routeGet = (imports, drafts = [DRAFT('q_1'), DRAFT('q_2', { status: 'needs_review', choiceCount: 3, choices: ['a', 'b', 'c'], correctChoice: null })]) =>
    api.apiGet.mockImplementation(async (p) => (p.startsWith('/admin/imports?') ? imports() : { importId: 'imp_8', drafts }))
  it('MT-F19-01 取り込み状況と、下書き一覧', async () => {
    routeGet(() => IMPORTS())
    await importPage.render(root, { course: 'c_3' })
    expect(api.apiGet).toHaveBeenCalledWith('/admin/imports?course=c_3')
    expect(root.querySelector('.app-imports tbody').textContent).toContain('2026/10/20 10:30')
    expect(root.querySelector('.app-imports tbody').textContent).toContain('完了')
    click('[data-open-import="imp_8"]')
    await flush()
    expect(api.apiGet).toHaveBeenCalledWith('/admin/imports/imp_8')
    const rows = [...root.querySelectorAll('.app-drafts tbody tr')].map((tr) => tr.textContent)
    expect(rows[0]).toContain('四肢択一')
    expect(rows[1]).toContain('選択肢3つ')
    expect(rows[1]).toContain('要確認')
  })
  it('MT-F19-02 待機中・抽出中があれば5秒ごとに確かめ、終わったら止める', async () => {
    vi.useFakeTimers()
    const seq = [IMPORTS('waiting'), IMPORTS('extracting'), IMPORTS('done')]
    routeGet(() => seq.shift() ?? IMPORTS('done'))
    await importPage.render(root)
    expect(root.textContent).toContain('待機中')
    await vi.advanceTimersByTimeAsync(5000)
    expect(root.textContent).toContain('抽出中')
    await vi.advanceTimersByTimeAsync(5000)
    expect(root.textContent).toContain('完了')
    const calls = api.apiGet.mock.calls.length
    await vi.advanceTimersByTimeAsync(15000)
    expect(api.apiGet.mock.calls.length).toBe(calls)
  })
  it('MT-F19-03 別の画面に移ったら確かめるのをやめる', async () => {
    vi.useFakeTimers()
    routeGet(() => IMPORTS('waiting'))
    await importPage.render(root)
    root.innerHTML = ''
    await vi.advanceTimersByTimeAsync(10000)
    expect(api.apiGet).toHaveBeenCalledTimes(1)
  })
  it('MT-F19-04 テキストの取り込み', async () => {
    routeGet(() => ({ imports: [] }))
    await importPage.render(root)
    q('input[value="text"]').checked = true
    q('[aria-labelledby="import-h"]').dispatchEvent(new Event('change'))
    expect(q('[data-file]').hidden).toBe(true)
    expect(q('[data-action="import"]').disabled).toBe(true)
    const ta = q('[data-text] textarea')
    ta.value = '問1 ...'
    ta.dispatchEvent(new Event('input'))
    api.apiPost.mockResolvedValue({ importId: 'imp_9' })
    click('[data-action="import"]')
    await flush()
    expect(api.apiPost).toHaveBeenCalledWith('/admin/imports', { courseId: 'c_3', sourceType: 'text', text: '問1 ...' })
    expect(root.textContent).toContain('受け付けた')
  })
  it('MT-F19-05 PDFは署名付きURLへ Content-Type を付けて PUT する。大きすぎるファイルは送らない', async () => {
    routeGet(() => ({ imports: [] }))
    await importPage.render(root)
    const input = q('input[type="file"]')
    const big = new File(['x'], 'big.pdf', { type: 'application/pdf' })
    Object.defineProperty(big, 'size', { value: 21 * 1024 * 1024 })
    Object.defineProperty(input, 'files', { value: [big], configurable: true })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    expect(q('[data-import-msg]').textContent).toBe('ファイルは20MBまでにしてください')
    expect(q('[data-action="import"]').disabled).toBe(true)
    const pdf = new File(['%PDF'], 'kakomon.pdf', { type: 'application/pdf' })
    Object.defineProperty(input, 'files', { value: [pdf], configurable: true })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    api.apiPost.mockResolvedValue({ importId: 'imp_9', uploadUrl: 'https://s3.example/put' })
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200 }))
    click('[data-action="import"]')
    await flush()
    await flush()
    expect(api.apiPost).toHaveBeenCalledWith('/admin/imports', { courseId: 'c_3', sourceType: 'pdf', fileName: 'kakomon.pdf', contentType: 'application/pdf', size: 4 })
    expect(globalThis.fetch).toHaveBeenCalledWith('https://s3.example/put', { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: pdf })
    expect(root.textContent).toContain('受け付けた')
  })
  it('MT-F19-06 アップロードに失敗したら責めない文言', async () => {
    routeGet(() => ({ imports: [] }))
    await importPage.render(root)
    const input = q('input[type="file"]')
    Object.defineProperty(input, 'files', { value: [new File(['%PDF'], 'a.pdf', { type: 'application/pdf' })], configurable: true })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    api.apiPost.mockResolvedValue({ importId: 'imp_9', uploadUrl: 'https://s3.example/put' })
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 403 }))
    click('[data-action="import"]')
    await flush()
    await flush()
    expect(q('[role="alert"]').textContent).toBe(importPage.M_UPLOAD_ERROR)
  })
  it('MT-F19-07 下書きを修正して保存する（空の選択肢は送らず、正解の番号を詰める）', async () => {
    routeGet(() => IMPORTS())
    await importPage.render(root, { import: 'imp_8' })
    click('[data-edit="q_1"]')
    expect(q('[data-field="body"]').value).toBe('問題文の先頭')
    q('[data-choice-input="1"]').value = ''
    q('input[name="correct"][value="3"]').checked = true
    api.apiPut.mockResolvedValue({ id: 'q_1', status: 'needs_review' })
    click('[data-action="save"]')
    await flush()
    expect(api.apiPut).toHaveBeenCalledWith('/admin/questions/q_1', { body: '問題文の先頭', choices: ['ア1', 'ウ3', 'エ4'], correctChoice: 2, explanation: '解説', keywords: ['DNS'] })
    expect(root.textContent).toContain('「要確認」のまま')
  })
  it('MT-F19-08 公開する：足りなければ M-12、そろっていれば保存してから公開', async () => {
    routeGet(() => IMPORTS())
    await importPage.render(root, { import: 'imp_8' })
    click('[data-edit="q_2"]')
    expect(root.textContent).not.toContain('抽出した選択肢')
    click('[data-action="publish"]')
    expect(q('.app-editor-msg').textContent).toBe('選択肢を4つそろえてから公開してください（足りないところ：選択肢）')
    expect(api.apiPut).not.toHaveBeenCalled()
    q('[data-choice-input="3"]').value = 'd'
    q('input[name="correct"][value="1"]').checked = true
    api.apiPut.mockResolvedValue({ id: 'q_2', status: 'draft' })
    api.apiPost.mockResolvedValue({ id: 'q_2', status: 'published' })
    click('[data-action="publish"]')
    await flush()
    await flush()
    expect(api.apiPut).toHaveBeenCalled()
    expect(api.apiPost).toHaveBeenCalledWith('/admin/questions/q_2/publish')
    expect(root.textContent).toContain('公開した')
  })
  it('MT-F19-09 削除する：確認ダイアログで「やめる」なら消さない、「削除する」で消す', async () => {
    routeGet(() => IMPORTS())
    await importPage.render(root, { import: 'imp_8' })
    click('[data-edit="q_1"]')
    click('[data-action="delete"]')
    expect(q('dialog').textContent).toContain('元に戻せません')
    click('dialog [data-action="cancel"]')
    expect(q('dialog')).toBeNull()
    expect(api.apiDelete).not.toHaveBeenCalled()
    click('[data-action="delete"]')
    api.apiDelete.mockResolvedValue({ id: 'q_1', result: 'deleted' })
    click('dialog [data-action="confirm"]')
    await flush()
    await flush()
    expect(api.apiDelete).toHaveBeenCalledWith('/admin/questions/q_1')
    expect(q('dialog')).toBeNull()
    expect(root.textContent).toContain('削除した')
  })
  it('MT-F19-10 選択肢が5つ以上の下書きは案内を出す', async () => {
    routeGet(() => IMPORTS(), [DRAFT('q_5', { choiceCount: 5, choices: ['a', 'b', 'c', 'd', 'e'] })])
    await importPage.render(root, { import: 'imp_8' })
    click('[data-edit="q_5"]')
    expect(root.textContent).toContain('抽出した選択肢が5つあった')
  })
})
