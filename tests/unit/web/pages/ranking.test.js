import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setContext } from '../../../../web/js/core/context.js'
import { createStore } from '../../../../web/js/core/store.js'
import { ApiError } from '../../../../web/js/core/api.js'
import * as ranking from '../../../../web/js/pages/learner/s07-ranking.js'
const person = (rank, i, isMe = false) => ({ rank, nickname: isMe ? 'たろう' : `p${i}`, weeklyExp: 1000 - i * 10, isMe })
const THIS_WEEK = {
  courseName: '基本情報 <午前>', weekStart: '2026-10-19', weekEnd: '2026-10-25', daysToReset: 6,
  rows: [...Array.from({ length: 10 }, (_, i) => person(i + 1, i)), person(12, 11, true)], me: person(12, 11, true),
  weeks: ['2026-10-12', '2026-10-05']
}
let root, store, api, go
function setup() {
  root = document.createElement('div')
  document.body.replaceChildren(root)
  store = createStore({ user: { roles: ['learner'] } })
  api = { apiGet: vi.fn(), apiPut: vi.fn() }
  go = vi.fn()
  setContext({ api, getState: store.getState, setState: store.setState, go })
}
const q = (sel) => root.querySelector(sel)
const click = (sel) => q(sel).dispatchEvent(new MouseEvent('click', { bubbles: true }))
const change = (sel, v) => { const el = q(sel); if (typeof v === 'boolean') el.checked = v; else el.value = v; el.dispatchEvent(new Event('change')) }
const flush = () => new Promise((r) => setTimeout(r, 0))
beforeEach(setup)
describe('M-F15 S-07 週間ランキング', () => {
  it('MT-F15-01 コース名・集計期間・リセットまでの日数と、上位10名＋圏外の自分', async () => {
    api.apiGet.mockResolvedValue(THIS_WEEK)
    await ranking.render(root)
    expect(api.apiGet).toHaveBeenCalledWith('/rankings')
    expect(q('#rank-h').textContent).toBe('基本情報 <午前>')
    expect(root.textContent).toContain('2026/10/19（月）〜10/25（日）・リセットまで あと6日')
    expect(root.textContent).toContain('あなたは 12位')
    const rows = root.querySelectorAll('.gd-rank')
    expect(rows).toHaveLength(11)
    expect(q('.app-rank-gap')).not.toBeNull()
    expect(rows[10].classList.contains('gd-rank-me')).toBe(true)
    expect(rows[10].textContent).toContain('あなた')
    expect(rows[0].querySelector('.gd-rank-1')).not.toBeNull()
  })
  it('MT-F15-02 過去週の切り替え', async () => {
    api.apiGet.mockResolvedValue(THIS_WEEK)
    await ranking.render(root)
    expect([...root.querySelectorAll('[data-week]')].map((b) => b.textContent)).toEqual(['今週', '10/12〜', '10/05〜'])
    expect(q('[data-week=""]').getAttribute('aria-pressed')).toBe('true')
    click('[data-week=""]')
    expect(go).not.toHaveBeenCalled()
    click('[data-week="2026-10-12"]')
    expect(go).toHaveBeenCalledWith('/ranking?week=2026-10-12')
  })
  it('MT-F15-03 過去週は確定済みと表示し、「今週」で戻る', async () => {
    api.apiGet.mockResolvedValue({ ...THIS_WEEK, weekStart: '2026-10-12', weekEnd: '2026-10-18', rows: [person(1, 0, true)], me: person(1, 0, true) })
    await ranking.render(root, { week: '2026-10-12' })
    expect(api.apiGet).toHaveBeenCalledWith('/rankings?week=2026-10-12')
    expect(root.textContent).toContain('・確定済み')
    expect(root.textContent).not.toContain('リセットまで')
    expect(q('.app-rank-gap')).toBeNull()
    click('[data-week=""]')
    expect(go).toHaveBeenCalledWith('/ranking')
  })
  it('MT-F15-04 だれもいない週と、ランキングに入っていない自分', async () => {
    api.apiGet.mockResolvedValue({ ...THIS_WEEK, rows: [], me: null, weeks: [] })
    await ranking.render(root)
    expect(root.textContent).toContain('最初の1問で1位になろう')
    expect(root.textContent).toContain('あなたはまだランキングに入っていない')
  })
  it('MT-F15-05 読み込めないときは再読み込みできる', async () => {
    api.apiGet.mockRejectedValueOnce(new ApiError('NETWORK', 0)).mockResolvedValue(THIS_WEEK)
    await ranking.render(root)
    click('[data-action="reload"]')
    await flush()
    expect(root.querySelectorAll('.gd-rank')).toHaveLength(11)
  })
})
