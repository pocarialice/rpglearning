import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setContext } from '../../../../web/js/core/context.js'
import { createStore } from '../../../../web/js/core/store.js'
import { ApiError } from '../../../../web/js/core/api.js'
import * as home from '../../../../web/js/pages/learner/s02-home.js'
import * as choice from '../../../../web/js/pages/learner/s04-choice.js'
import * as explain from '../../../../web/js/pages/learner/s05-explain.js'
import * as result from '../../../../web/js/pages/learner/s06-result.js'
import { NOTICE_DONE } from '../../../../web/js/pages/learner/adventure.js'
const HOME = {
  level: 5, expInLevel: 410, next: 690, totalExp: 1232, streakDays: 3,
  message: { partnerName: 'ミナ', persona: 'encourage', text: '昨日より3問多く解けてるよ' },
  quests: [{ id: 'Q-01', title: '今日の復習をすべて終える', progress: 1, target: 5, done: false, reward: 30 }, { id: 'Q-03', title: 'キーワード説明を1問合格する', progress: 0, target: 1, done: false, reward: 30 }],
  review: { choice: 3, explain: 2, total: 5 }
}
const CHOICE_Q = { adventureId: 'adv_1', index: 3, total: 10, kind: 'choice', isReview: true, question: { id: 'q_9', body: '最も適切なものはどれか', choices: [1, 2, 3, 4].map((no) => ({ no, body: `選択肢${no}` })) } }
const EXPLAIN_Q = { adventureId: 'adv_1', index: 4, total: 10, kind: 'explain', isReview: false, keyword: { id: 'kw_123', text: 'VPC' }, question: { id: 'q_9', body: '出典の問題' } }
const OUTCOME = { exp: { gained: 15, reviewBonus: true, questExp: 0, level: 5, levelUp: false, expInLevel: 425, next: 690 }, review: { stage: 2, nextDate: '2026-10-24' }, quests: [{ id: 'Q-01', progress: 5, target: 5, done: true, achievedNow: true, reward: 30 }], badges: ['mastery_bronze'] }
let root, store, api, go
function setup(state = {}) {
  root = document.createElement('div')
  store = createStore({ user: { roles: ['learner'], partner: { persona: 'logic', name: 'セージ' } }, adventureId: null, ...state })
  api = { apiGet: vi.fn(), apiPost: vi.fn() }
  go = vi.fn()
  setContext({ api, getState: store.getState, setState: store.setState, go, config: { release: '20261105-01' } })
}
const click = (sel) => root.querySelector(sel).dispatchEvent(new MouseEvent('click', { bubbles: true }))
const flush = () => new Promise((r) => setTimeout(r, 0))
beforeEach(() => setup())
describe('M-F10 S-02 ホーム', () => {
  it('MT-F10-01 EXPバー → ひとこと → クエスト → 今日の復習の順に表示する', async () => {
    api.apiGet.mockResolvedValue(HOME)
    await home.render(root)
    expect(api.apiGet).toHaveBeenCalledWith('/home')
    const order = [...root.querySelectorAll('.gd-exp, .gd-partner, .gd-quest, [aria-labelledby="review-h"]')].map((e) => e.className.split(' ')[0] || 'review')
    expect(order).toEqual(['gd-exp', 'gd-partner', 'gd-card', 'gd-card', 'gd-card'])
    expect(root.querySelectorAll('.gd-quest')).toHaveLength(2)
    expect(root.textContent).toContain('択一 3・説明 2')
    expect(root.textContent).toContain('リリース 20261105-01')
    expect(store.getState().questTitles['Q-03']).toBe('キーワード説明を1問合格する')
  })
  it('MT-F10-02 「冒険に出る」で冒険IDを空にして次の問題へ移る', async () => {
    setup({ adventureId: 'adv_old' })
    api.apiGet.mockResolvedValueOnce(HOME).mockResolvedValueOnce(CHOICE_Q)
    await home.render(root)
    click('[data-action="start"]')
    await flush()
    expect(api.apiGet).toHaveBeenLastCalledWith('/quests/next')
    expect(store.getState().quest).toBe(CHOICE_Q)
    expect(go).toHaveBeenCalledWith('/quest/choice')
  })
  it('MT-F10-03 冒険の終わりのお知らせを1回だけ出す', async () => {
    setup({ notice: NOTICE_DONE })
    api.apiGet.mockResolvedValue(HOME)
    await home.render(root)
    expect(root.querySelector('.app-notice').textContent).toBe(NOTICE_DONE)
    expect(store.getState().notice).toBeNull()
  })
  it('MT-F10-04 読み込めないときは責めない文言と再読み込み', async () => {
    api.apiGet.mockRejectedValueOnce(new ApiError('NETWORK', 0)).mockResolvedValue(HOME)
    await home.render(root)
    expect(root.querySelector('[role="alert"]').textContent).toBe('通信できませんでした。もう一度お試しください')
    click('[data-action="reload"]')
    await flush()
    expect(root.querySelector('.gd-exp')).not.toBeNull()
  })
})
describe('M-F12 S-04 演習（四肢択一）', () => {
  it('MT-F12-01 問題がなければホームへ戻す', async () => {
    await choice.render(root)
    expect(go).toHaveBeenCalledWith('/home')
  })
  it('MT-F12-02 選ぶまで「答える」を押せず、答えると S-06 へ', async () => {
    setup({ quest: CHOICE_Q, adventureId: 'adv_1' })
    await choice.render(root)
    expect(root.querySelector('.app-progress').textContent).toBe('3 / 10問復習')
    const answer = root.querySelector('[data-action="answer"]')
    expect(answer.disabled).toBe(true)
    click('[data-choice="2"]')
    expect(root.querySelector('[data-choice="2"]').classList.contains('gd-choice-selected')).toBe(true)
    expect(answer.disabled).toBe(false)
    const res = { correct: false, correctChoice: 3, explanation: '解説', comment: { text: 'おしい' }, ...OUTCOME }
    api.apiPost.mockResolvedValue(res)
    click('[data-action="answer"]')
    await flush()
    expect(api.apiPost).toHaveBeenCalledWith('/answers/choice', { questionId: 'q_9', choiceNo: 2, adventureId: 'adv_1' })
    expect(store.getState().result).toEqual({ kind: 'choice', quest: CHOICE_Q, selected: 2, res })
    expect(go).toHaveBeenCalledWith('/quest/result')
  })
  it('MT-F12-03 送れなかったら選んだまま、もう一度押せる', async () => {
    setup({ quest: CHOICE_Q })
    await choice.render(root)
    click('[data-choice="1"]')
    api.apiPost.mockRejectedValue(new ApiError('NETWORK', 0))
    click('[data-action="answer"]')
    await flush()
    expect(root.querySelector('[role="alert"]')).not.toBeNull()
    expect(root.querySelector('[data-action="answer"]').disabled).toBe(false)
  })
})
describe('M-F13 S-05 キーワード説明', () => {
  const type = (text) => {
    const ta = root.querySelector('#explain-text')
    ta.value = text
    ta.dispatchEvent(new Event('input'))
  }
  it('MT-F13-01 文字数と M-03・M-04 を入力のたびに表示し、送れるかを切り替える', async () => {
    setup({ quest: EXPLAIN_Q })
    await explain.render(root)
    const submit = root.querySelector('[data-action="submit"]')
    const msg = root.querySelector('#explain-msg')
    type('短い')
    expect(root.querySelector('#explain-count').textContent).toBe('2文字')
    expect(msg.textContent).toBe('説明は50文字以上で入力してください（いま2文字）')
    expect(submit.disabled).toBe(true)
    type('あ'.repeat(401))
    expect(msg.textContent).toBe('説明は400文字以内で入力してください（いま401文字）')
    expect(submit.disabled).toBe(true)
    type('あ'.repeat(201))
    expect(msg.textContent).toBe('')
    expect(submit.disabled).toBe(false)
    expect(root.querySelector('[data-action="heading"]')).toBeNull()
  })
  it('MT-F13-02 送信後はパートナーの採点待ちを出し、結果が出たら S-06 へ', async () => {
    setup({ quest: EXPLAIN_Q, adventureId: 'adv_1' })
    await explain.render(root)
    type('あ'.repeat(60))
    api.apiPost.mockResolvedValue({ gradingId: 'gr_456', status: 'processing' })
    let resolve
    api.apiGet.mockReturnValueOnce(new Promise((r) => { resolve = r }))
    click('[data-action="submit"]')
    await flush()
    expect(api.apiPost).toHaveBeenCalledWith('/gradings', { keywordId: 'kw_123', text: 'あ'.repeat(60), isReview: false, adventureId: 'adv_1', prompt: explain.fallbackPrompt('VPC') })
    expect(root.querySelector('.app-waiting .gd-dots')).not.toBeNull()
    expect(root.querySelector('.app-waiting').textContent).toContain('セージが採点しています')
    resolve({ status: 'done', score: 72, passed: true, ...OUTCOME })
    await flush()
    expect(store.getState().result.kind).toBe('explain')
    expect(go).toHaveBeenCalledWith('/quest/result')
  })
  it('MT-F13-03 時間切れは M-07 を出して入力を残す', async () => {
    setup({ quest: EXPLAIN_Q })
    await explain.render(root)
    type('あ'.repeat(60))
    api.apiPost.mockResolvedValue({ gradingId: 'gr_456' })
    api.apiGet.mockRejectedValue(new ApiError('GRADING_TIMEOUT', 504))
    click('[data-action="submit"]')
    await flush()
    await flush()
    expect(root.querySelector('[role="alert"]').textContent).toBe(explain.M07)
    expect(root.querySelector('.app-explain-form').hidden).toBe(false)
    expect(root.querySelector('#explain-text').value).toBe('あ'.repeat(60))
  })
  it('MT-F13-04 採点の失敗はもう一度送れる形に戻す', async () => {
    setup({ quest: EXPLAIN_Q })
    await explain.render(root)
    type('あ'.repeat(60))
    api.apiPost.mockResolvedValue({ gradingId: 'gr_456' })
    api.apiGet.mockResolvedValue({ status: 'failed', retryable: true })
    click('[data-action="submit"]')
    await flush()
    await flush()
    expect(root.querySelector('[role="alert"]').textContent).toBe(explain.M_GRADING_FAILED)
    expect(root.querySelector('[data-action="submit"]').disabled).toBe(false)
  })
})
describe('M-F13 S-05 パートナーの問いかけ（A-07b）', () => {
  const PROMPT = { text: 'VPCの中を<public>と<private>に分けるのはなぜ？', angles: ['目的', 'しくみ'] }
  it('MT-F13-05 質問を考えている間は入力欄を出さず、届いたら質問と観点を出して採点に添える', async () => {
    setup({ quest: EXPLAIN_Q, adventureId: 'adv_1' })
    let resolve
    api.apiPost.mockReturnValueOnce(new Promise((r) => { resolve = r }))
    const done = explain.render(root)
    await flush()
    expect(api.apiPost).toHaveBeenCalledWith('/quests/explain-question', { keywordId: 'kw_123' })
    expect(root.querySelector('.app-ask .gd-dots')).not.toBeNull()
    expect(root.querySelector('.app-ask').textContent).toContain('セージが質問を考えています')
    expect(root.querySelector('.app-explain-form').hidden).toBe(true)
    resolve({ partnerName: 'セージ', persona: 'logic', prompt: PROMPT, fallback: false })
    await done
    expect(root.querySelector('.app-ask .gd-bubble').textContent).toContain(PROMPT.text)
    expect([...root.querySelectorAll('.app-ask .app-angle')].map((e) => e.textContent)).toEqual(['#目的', '#しくみ'])
    expect(root.querySelector('.app-explain-form').hidden).toBe(false)
    expect(root.querySelector('label[for="explain-text"]').textContent).toBe('あなたの回答（50〜400文字）')
    expect(store.getState().quest.prompt).toEqual(PROMPT)
    const ta = root.querySelector('#explain-text')
    ta.value = 'あ'.repeat(60)
    ta.dispatchEvent(new Event('input'))
    api.apiPost.mockResolvedValue({ gradingId: 'gr_456' })
    api.apiGet.mockResolvedValue({ status: 'done', score: 72, passed: true, ...OUTCOME })
    click('[data-action="submit"]')
    await flush()
    await flush()
    expect(api.apiPost).toHaveBeenLastCalledWith('/gradings', { keywordId: 'kw_123', text: 'あ'.repeat(60), isReview: false, adventureId: 'adv_1', prompt: PROMPT })
    expect(store.getState().result.quest.prompt).toEqual(PROMPT)
  })
  it('MT-F13-06 読み込めないときは定型の質問、開き直したときは同じ質問を使い回す', async () => {
    setup({ quest: EXPLAIN_Q })
    api.apiPost.mockRejectedValue(new ApiError('NETWORK', 0))
    await explain.render(root)
    expect(root.querySelector('.app-ask .gd-bubble').textContent).toContain('「VPC」とは何か、定義としくみを自分の言葉で説明してください。')
    expect(root.querySelector('.app-explain-form').hidden).toBe(false)
    setup({ quest: { ...EXPLAIN_Q, prompt: PROMPT } })
    await explain.render(root)
    expect(api.apiPost).not.toHaveBeenCalled()
    expect(root.querySelector('.app-ask .gd-bubble').textContent).toContain(PROMPT.text)
  })
})
describe('M-F14 S-06 結果・フィードバック', () => {
  it('MT-F14-01 択一：正解・選んだ選択肢・EXP・復習段階・達成を表示する', async () => {
    const res = { correct: false, correctChoice: 3, explanation: '正解はウ', comment: { partnerName: 'セージ', persona: 'logic', text: '次はここを押さえましょう' }, ...OUTCOME }
    setup({ result: { kind: 'choice', quest: CHOICE_Q, selected: 2, res }, questTitles: { 'Q-01': '今日の復習をすべて終える' } })
    await result.render(root)
    expect(root.querySelector('.app-verdict').textContent).toBe('× 不正解')
    expect(root.querySelector('[data-choice="3"]').textContent).toContain('○ 正解')
    expect(root.querySelector('[data-choice="2"]').textContent).toContain('× 不正解')
    expect(root.querySelector('[data-choice="1"]').classList.contains('gd-choice-dim')).toBe(true)
    expect(root.querySelector('.gd-exp-gain').textContent).toBe('+15 EXP')
    expect(root.textContent).toContain('復習ボーナスを含む')
    expect(root.querySelector('.gd-review-kind').textContent).toBe('択一')
    expect(root.textContent).toContain('次の復習 2026/10/24')
    expect(root.querySelector('.gd-quest-title').textContent).toBe('今日の復習をすべて終える')
    expect(root.querySelector('.gd-badge-name').textContent).toBe('習得の証（銅）')
    expect(root.textContent).toContain('正解はウ')
  })
  it('MT-F14-02 説明：点数・足りない観点・模範説明', async () => {
    const res = { status: 'done', score: 45, passed: false, modelAnswer: 'VPCは<論理的に>分離された', missingPoints: ['サブネット'], comment: { partnerName: 'レン', persona: 'rival', text: '次は負けないぞ' }, ...OUTCOME, quests: [], badges: [] }
    setup({ result: { kind: 'explain', quest: EXPLAIN_Q, res } })
    await result.render(root)
    expect(root.querySelector('.gd-verdict').textContent).toBe('あと15点')
    expect(root.querySelector('.app-list').textContent).toBe('サブネット')
    expect(root.querySelector('.gd-bubble').textContent).toContain('VPCは<論理的に>分離された')
    expect(root.querySelector('.gd-review-kind').textContent).toBe('説明')
    expect(root.textContent).not.toContain('達成')
  })
  it('MT-F14-06 説明：パートナーの質問と観点ごとの答え方', async () => {
    const prompt = { text: 'なぜ<分ける>の？', angles: [{ label: '目的', status: 'full' }, { label: 'しくみ', status: 'partial' }, { label: '違い', status: 'none' }, { label: '例', status: 'unknown' }] }
    const res = { status: 'done', score: 80, passed: true, modelAnswer: '模範', missingPoints: [], comment: { partnerName: null, persona: 'rival', text: 'やるな' }, prompt, ...OUTCOME, quests: [], badges: [] }
    setup({ result: { kind: 'explain', quest: EXPLAIN_Q, res } })
    await result.render(root)
    expect(root.textContent).toContain('レンの質問')
    expect(root.textContent).toContain('なぜ<分ける>の？')
    const items = [...root.querySelectorAll('.app-angle-results li')].map((e) => e.textContent)
    expect(items).toEqual(['#目的○答えられた', '#しくみ△一部', '#違い×まだ', '#例'])
    setup({ result: { kind: 'explain', quest: EXPLAIN_Q, res: { ...res, prompt: undefined } } })
    await result.render(root)
    expect(root.textContent).not.toContain('の質問')
  })
  it('MT-F14-03 「次の問題へ」は同じ冒険で A-07 を呼ぶ', async () => {
    const res = { correct: true, correctChoice: 1, explanation: '', comment: { text: 'いいね' }, ...OUTCOME }
    setup({ result: { kind: 'choice', quest: CHOICE_Q, selected: 1, res }, adventureId: 'adv_1' })
    await result.render(root)
    api.apiGet.mockResolvedValue(EXPLAIN_Q)
    click('[data-action="next"]')
    await flush()
    expect(api.apiGet).toHaveBeenCalledWith('/quests/next?adventureId=adv_1')
    expect(go).toHaveBeenCalledWith('/quest/explain')
  })
  it('MT-F14-04 冒険の終わり（done）はホームへ戻してお知らせを出す', async () => {
    const res = { correct: true, correctChoice: 1, comment: { text: '' }, ...OUTCOME }
    setup({ result: { kind: 'choice', quest: CHOICE_Q, selected: 1, res }, adventureId: 'adv_1' })
    await result.render(root)
    api.apiGet.mockResolvedValue({ adventureId: 'adv_1', done: true })
    click('[data-action="next"]')
    await flush()
    expect(store.getState().notice).toBe(NOTICE_DONE)
    expect(store.getState().adventureId).toBeNull()
    expect(go).toHaveBeenCalledWith('/home')
  })
  it('MT-F14-05 10問目のあとは「ホームへ」だけ', async () => {
    const res = { correct: true, correctChoice: 1, comment: { text: '' }, ...OUTCOME }
    setup({ result: { kind: 'choice', quest: { ...CHOICE_Q, index: 10 }, selected: 1, res }, adventureId: 'adv_1' })
    await result.render(root)
    expect(root.querySelector('[data-action="next"]')).toBeNull()
    click('[data-action="home"]')
    expect(store.getState().adventureId).toBeNull()
    expect(go).toHaveBeenCalledWith('/home')
  })
})
