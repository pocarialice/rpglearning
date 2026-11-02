import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setContext } from '../../../../web/js/core/context.js'
import { createStore } from '../../../../web/js/core/store.js'
import { ApiError } from '../../../../web/js/core/api.js'
import { mountSummaryPanel, copyText, todayJst, M_COPIED, M_COPY_FAILED, M_SUMMARY_EMPTY, M_SUMMARY_ERROR } from '../../../../web/js/parts/summary-panel.js'
import * as summaryPage from '../../../../web/js/pages/learner/s15-summary.js'
import * as profile from '../../../../web/js/pages/learner/s08-profile.js'
const MD = '# 学習サマリ 2026/10/20（冒険のまとめ）\n- 学習日：2026/10/20\n- 学習時間：25分\n## 学習した内容\n## 復習するべき観点\n## ミナからのコメント\n<b>よくがんばったね</b>'
const SUMMARY = { scope: 'adventure', date: '2026-10-20', studyTime: '25分', answerCount: 10, markdown: MD, comment: { partnerName: 'ミナ', persona: 'encourage', text: 'よくがんばったね' } }
let el, api
const flush = () => new Promise((r) => setTimeout(r, 0))
const q = (sel) => el.querySelector(sel)
// jsdom も open を変えると toggle を出す
const open = async () => {
  q('details').open = true
  await flush()
  await flush()
}
const setClipboard = (writeText) => Object.defineProperty(globalThis.navigator, 'clipboard', { value: writeText ? { writeText } : undefined, configurable: true })
beforeEach(() => {
  el = document.createElement('div')
  document.body.replaceChildren(el)
  api = { apiGet: vi.fn(async () => SUMMARY) }
})
afterEach(() => setClipboard(undefined))
describe('M-F26 parts/summary-panel.js 学習サマリのアコーディオン', () => {
  it('MT-F26-01 ふだんは閉じていて、開いたときに1回だけ読み込む', async () => {
    mountSummaryPanel(el, { api, path: () => '/adventures/adv_1/summary', label: '冒険の学習サマリ' })
    expect(q('details').open).toBe(false)
    expect(q('summary').textContent).toContain('冒険の学習サマリ')
    expect(api.apiGet).not.toHaveBeenCalled()
    await open()
    expect(api.apiGet).toHaveBeenCalledWith('/adventures/adv_1/summary')
    expect(q('.app-md').textContent).toBe(MD)
    expect(q('.app-md').innerHTML).toContain('&lt;b&gt;')
    expect(el.textContent).toContain('学習時間 25分・10問')
    q('details').open = false
    await flush()
    await open()
    expect(api.apiGet).toHaveBeenCalledTimes(1)
  })
  it('MT-F26-02 「コピーする」で Markdown をクリップボードに入れる', async () => {
    const writeText = vi.fn(async () => {})
    setClipboard(writeText)
    mountSummaryPanel(el, { api, path: () => '/x' })
    await open()
    q('[data-action="summary-copy"]').click()
    await flush()
    expect(writeText).toHaveBeenCalledWith(MD)
    expect(q('.app-copy-status').textContent).toBe(M_COPIED)
  })
  it('MT-F26-03 クリップボードが使えないときは選択してコピーし、それもだめなら案内する', async () => {
    setClipboard(vi.fn(async () => { throw new Error('denied') }))
    document.execCommand = vi.fn(() => true)
    expect(await copyText('abc')).toBe(true)
    expect(document.execCommand).toHaveBeenCalledWith('copy')
    expect(document.querySelector('textarea')).toBeNull()
    setClipboard(undefined)
    document.execCommand = vi.fn(() => { throw new Error('no') })
    expect(await copyText('abc')).toBe(false)
    delete document.execCommand
    expect(await copyText('abc')).toBe(false)
    mountSummaryPanel(el, { api, path: () => '/x' })
    await open()
    q('[data-action="summary-copy"]').click()
    await flush()
    expect(q('.app-copy-status').textContent).toBe(M_COPY_FAILED)
  })
  it('MT-F26-04 解答がない日・読み込みの失敗ともう一度', async () => {
    api.apiGet.mockResolvedValueOnce({ ...SUMMARY, markdown: null, answerCount: 0 })
    mountSummaryPanel(el, { api, path: () => '/x' })
    await open()
    expect(el.textContent).toContain(M_SUMMARY_EMPTY)
    const el2 = document.createElement('div')
    document.body.appendChild(el2)
    el = el2
    api.apiGet.mockRejectedValueOnce(new ApiError('INTERNAL_ERROR', 500))
    mountSummaryPanel(el, { api, path: () => '/x' })
    await open()
    expect(q('[role="alert"]').textContent).toBe(M_SUMMARY_ERROR)
    q('[data-action="summary-reload"]').click()
    await flush()
    expect(q('.app-md').textContent).toBe(MD)
  })
  it('MT-F26-05 日付を選べる（今日より先は選べない）。閉じているときは開いたときに読み直す', async () => {
    const path = vi.fn((d) => `/me/summary?date=${d}`)
    mountSummaryPanel(el, { api, path, withDate: true, today: '2026-10-20' })
    const input = q('#summary-date')
    expect(input.value).toBe('2026-10-20')
    expect(input.max).toBe('2026-10-20')
    input.value = '2026-10-18'
    input.dispatchEvent(new Event('change'))
    expect(api.apiGet).not.toHaveBeenCalled()
    await open()
    expect(api.apiGet).toHaveBeenLastCalledWith('/me/summary?date=2026-10-18')
    input.value = '2026-10-17'
    input.dispatchEvent(new Event('change'))
    await flush()
    expect(api.apiGet).toHaveBeenLastCalledWith('/me/summary?date=2026-10-17')
    input.value = ''
    input.dispatchEvent(new Event('change'))
    expect(api.apiGet).toHaveBeenCalledTimes(2)
  })
  it('MT-F26-06 古い読み込みの結果で上書きしない', async () => {
    let resolveFirst
    api.apiGet.mockImplementationOnce(() => new Promise((r) => { resolveFirst = r }))
    api.apiGet.mockImplementationOnce(async () => { throw new ApiError('INTERNAL_ERROR', 500) })
    let rejectThird
    api.apiGet.mockImplementationOnce(() => new Promise((_, rej) => { rejectThird = rej }))
    const panel = mountSummaryPanel(el, { api, path: () => '/x', withDate: true, today: '2026-10-20' })
    await open()
    const second = panel.load()
    await second
    const third = panel.load()
    resolveFirst({ ...SUMMARY, markdown: 'old' })
    await flush()
    rejectThird(new ApiError('INTERNAL_ERROR', 500))
    await third
    await flush()
    expect(q('.app-md')).toBeNull()
    expect(el.textContent).not.toContain('old')
  })
  it('MT-F26-07 今日の日付は JST', () => {
    expect(todayJst(new Date('2026-10-19T15:30:00Z'))).toBe('2026-10-20')
    expect(todayJst()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
describe('M-F25・M-F16 学習サマリの組み込み', () => {
  function setup(state) {
    const store = createStore({ user: { roles: ['learner'], nickname: 'たろう', partner: { persona: 'encourage', name: 'ミナ' } }, ...state })
    api.apiGet = vi.fn(async (p) => {
      if (p === '/me/stats') return { coveragePct: 0, correctPct: null, mastered: 0, streakDays: 0, level: 1, expInLevel: 0, next: 100, totalExp: 0, totalStudySeconds: 0 }
      if (p === '/me/badges') return { badges: [] }
      return SUMMARY
    })
    setContext({ api, getState: store.getState, setState: store.setState, go: vi.fn(), auth: { logout: vi.fn() }, config: {} })
  }
  it('MT-F25-04 S-15 冒険のまとめ：冒険の学習サマリを出す（冒険IDがなければ出さない）', async () => {
    const S = { answered: 5, correct: 4, explainCount: 0, explainAvgScore: null, expGained: 55, studySeconds: 492, totalStudySeconds: 7300, notice: null }
    setup({ summary: { ...S, adventureId: 'adv_1' } })
    await summaryPage.render(el)
    expect(q('.app-summary summary').textContent).toContain('冒険の学習サマリ')
    expect(q('.app-summary').open).toBe(false)
    await open()
    expect(api.apiGet).toHaveBeenCalledWith('/adventures/adv_1/summary')
    el.replaceChildren()
    setup({ summary: S })
    await summaryPage.render(el)
    expect(q('.app-summary')).toBeNull()
  })
  it('MT-F16-06 S-08：学習記録の下に1日の学習サマリを出す', async () => {
    setup({})
    await profile.render(el)
    expect(q('[aria-labelledby="stats-h"] + .app-summary-mount .app-summary summary').textContent).toContain('1日の学習サマリ')
    await open()
    expect(api.apiGet).toHaveBeenCalledWith(`/me/summary?date=${todayJst()}`)
  })
})
