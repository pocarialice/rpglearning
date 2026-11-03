import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setContext } from '../../../../web/js/core/context.js'
import { createStore } from '../../../../web/js/core/store.js'
import { ApiError } from '../../../../web/js/core/api.js'
import * as list from '../../../../web/js/pages/learner/s16-course-records.js'
import * as detail from '../../../../web/js/pages/learner/s17-course-record.js'
import { PAGES } from '../../../../web/js/pages/index.js'
const LIST = { totalStudySeconds: 111900, totalStudyTime: '31時間5分', courses: [
  { id: 'c_3', name: 'ネットワーク', current: true, studySeconds: 67320, correctPct: 78.1, coveragePct: 62.4, lastStudiedOn: '2026-11-02' },
  { id: 'c_4', name: '<i>ACE</i>', current: false, studySeconds: 0, correctPct: null, coveragePct: 140, lastStudiedOn: null }
] }
const DETAIL = {
  id: 'c_3', name: 'ネットワーク', current: true, enrolledOn: '2026-09-14', lastStudiedOn: '2026-11-02', studySeconds: 67320, correctPct: 78.1, coveragePct: 62.4,
  adventureCount: 46, answerCount: 412, choice: { count: 360, correct: 288 }, explain: { count: 52, passed: 34, avgScore: 68 }, mastered: 41, dueToday: 7,
  weak: [
    { kind: 'choice', label: 'OSPF の経路集約', missCount: 3, score: null, missingPoints: [] },
    { kind: 'explain', label: 'VRRP', missCount: 2, score: 45, missingPoints: ['優先度'] }
  ]
}
const COMMENT = { courseId: 'c_3', comment: { partnerName: 'ルナ', persona: 'encourage', text: 'よくがんばったね。' } }
let root, store, api, go
function setup() {
  root = document.createElement('div')
  document.body.replaceChildren(root)
  store = createStore({ user: { roles: ['learner'], partner: { persona: 'encourage', name: 'ルナ', imageUrl: 'https://x/luna.png' } } })
  api = { apiGet: vi.fn() }
  go = vi.fn()
  setContext({ api, getState: store.getState, setState: store.setState, go })
}
const q = (sel) => root.querySelector(sel)
const click = (sel) => q(sel).dispatchEvent(new MouseEvent('click', { bubbles: true }))
const flush = () => new Promise((r) => setTimeout(r, 0))
beforeEach(setup)
describe('M-F29 S-16 コースごとの実績（一覧）', () => {
  it('MT-F29-01 全コースの累計とコースのカードを表示し、カードから詳細へ移る', async () => {
    api.apiGet.mockResolvedValue(LIST)
    await list.render(root)
    expect(api.apiGet).toHaveBeenCalledWith('/me/courses')
    expect(q('.app-course-total').textContent).toBe('全コースの累計の学習時間31時間5分')
    const rows = root.querySelectorAll('.app-course-row')
    expect(rows).toHaveLength(2)
    expect(rows[0].getAttribute('href')).toBe('#/profile/course?id=c_3')
    expect(rows[0].querySelector('.app-chip').textContent).toBe('受講中')
    expect(rows[0].querySelector('.app-course-nums').textContent).toBe('学習時間18時間42分正答率78.1%網羅率62.4%')
    expect(rows[0].querySelector('.app-course-bar i').style.width).toBe('62.4%')
    expect(rows[0].textContent).toContain('最後の学習 2026/11/02')
    expect(rows[1].querySelector('.app-chip')).toBeNull()
    expect(rows[1].querySelector('.app-course-name').textContent).toBe('<i>ACE</i>')
    expect(rows[1].querySelector('.app-course-nums').textContent).toContain('正答率-')
    expect(rows[1].querySelector('.app-course-bar i').style.width).toBe('100%')
    expect(rows[1].textContent).toContain('最後の学習 まだありません')
    click('[data-go="/profile"]')
    expect(go).toHaveBeenCalledWith('/profile')
  })
  it('MT-F29-02 コースがなければ案内、読み込めなければ再読み込み', async () => {
    api.apiGet.mockResolvedValueOnce({ totalStudySeconds: 0, courses: [] })
    await list.render(root)
    expect(root.textContent).toContain(list.M_RECORDS_EMPTY)
    api.apiGet.mockRejectedValueOnce(new ApiError('INTERNAL', 500))
    await list.render(root)
    expect(q('[role="alert"]').textContent).toBe(list.M_RECORDS_ERROR)
    api.apiGet.mockResolvedValueOnce(LIST)
    click('[data-action="reload"]')
    await flush()
    expect(root.querySelectorAll('.app-course-row')).toHaveLength(2)
  })
})
describe('M-F30 S-17 コースの実績（詳細）', () => {
  const mockDetail = (comment = COMMENT) => api.apiGet.mockImplementation(async (p) => (p.endsWith('/comment') ? comment : DETAIL))
  it('MT-F30-01 実績（累積の学習時間がいちばん上）・内訳・苦手な問題・パートナーのコメント', async () => {
    mockDetail()
    await detail.render(root, { id: 'c_3' })
    expect(api.apiGet.mock.calls.map((c) => c[0])).toEqual(['/me/courses/c_3', '/me/courses/c_3/comment'])
    expect(q('.app-course-title').textContent).toBe('ネットワーク')
    expect(q('.app-course-dates').textContent).toBe('受講開始 2026/09/14・最後の学習 2026/11/02')
    const stats = [...root.querySelectorAll('.app-stat')].map((s) => s.textContent)
    expect(stats).toEqual(['累積の学習時間18時間42分', '冒険の回数46 回', '解いた問題412 問', '正答率78.1%', '網羅率62.4%', '習得済み41 問', '今日の復習7 問'])
    expect(q('.app-stat').classList.contains('app-stat-wide')).toBe(true)
    expect([...root.querySelectorAll('.app-breakdown li')].map((l) => l.textContent)).toEqual(['択一288 / 360問 正解', '説明34 / 52問 合格（平均 68点）'])
    expect([...root.querySelectorAll('.app-weak li')].map((l) => l.textContent)).toEqual(['択一OSPF の経路集約（3回まちがい）', '説明VRRP（直近 45点・足りない観点：優先度）'])
    expect(q('.app-comment-slot .gd-bubble-name').textContent).toContain('ルナ')
    expect(q('.app-comment-slot .gd-bubble').textContent).toContain('よくがんばったね。')
    expect(q('.app-comment-slot .app-sigil-img').getAttribute('src')).toBe('https://x/luna.png')
    click('[data-go="/profile/courses"]')
    expect(go).toHaveBeenCalledWith('/profile/courses')
  })
  it('MT-F30-02 コメントを待つ間は「…」、解答がなければ案内、失敗したらコメントだけ読み直せる', async () => {
    let resolve
    api.apiGet.mockImplementation((p) => (p.endsWith('/comment') ? new Promise((r) => { resolve = r }) : Promise.resolve({ ...DETAIL, weak: [], explain: { count: 0, passed: 0, avgScore: null } })))
    const done = detail.render(root, { id: 'c_3' })
    await flush()
    expect(q('.app-comment-slot .gd-dots')).not.toBeNull()
    expect(root.textContent).toContain(detail.M_WEAK_EMPTY)
    expect(root.querySelectorAll('.app-breakdown li')[1].textContent).toBe('説明0 / 0問 合格')
    resolve({ courseId: 'c_3', comment: null })
    await done
    expect(q('.app-comment-slot').textContent).toBe(detail.M_COMMENT_EMPTY)
    api.apiGet.mockImplementation(async (p) => { if (p.endsWith('/comment')) throw new ApiError('INTERNAL', 500); return DETAIL })
    await detail.render(root, { id: 'c_3' })
    expect(q('.app-comment-slot [role="alert"]').textContent).toBe(detail.M_COMMENT_ERROR)
    expect(q('.app-stats')).not.toBeNull()
    mockDetail()
    click('[data-action="comment-reload"]')
    await flush()
    expect(q('.app-comment-slot .gd-bubble').textContent).toContain('よくがんばったね。')
  })
  it('MT-F30-03 ID がなければ一覧へ、読み込めなければ再読み込み', async () => {
    await detail.render(root, {})
    expect(go).toHaveBeenCalledWith('/profile/courses')
    expect(api.apiGet).not.toHaveBeenCalled()
    api.apiGet.mockRejectedValueOnce(new ApiError('NOT_FOUND', 404, { message: 'コースが見つかりません' }))
    await detail.render(root, { id: 'c_9' })
    expect(q('[role="alert"]').textContent).toBe('コースが見つかりません')
    mockDetail()
    click('[data-action="reload"]')
    await flush()
    await flush()
    expect(q('.app-course-title')).not.toBeNull()
  })
  it('MT-F30-04 画面の登録：S-16 と S-17 は学習者だけ', () => {
    const paths = new Map(PAGES.map(([p, , roles]) => [p, roles]))
    expect(paths.get('/profile/courses')).toEqual(['learner'])
    expect(paths.get('/profile/course')).toEqual(['learner'])
  })
})
