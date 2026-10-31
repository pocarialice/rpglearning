import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { expBar } from '../../../../web/js/components/exp-bar.js'
import { partnerBubble, partnerName, imageFor } from '../../../../web/js/components/partner-bubble.js'
import { questCard } from '../../../../web/js/components/quest-card.js'
import { choiceOption } from '../../../../web/js/components/choice-option.js'
import { scoreMeter } from '../../../../web/js/components/score-meter.js'
import { reviewStage } from '../../../../web/js/components/review-stage.js'
import { guildBadge, badgeFromCode } from '../../../../web/js/components/guild-badge.js'
import { errorMessage, M02 } from '../../../../web/js/components/status.js'
const el = (html) => {
  const d = document.createElement('div')
  d.innerHTML = html
  return d.firstElementChild
}
describe('M-F07 components', () => {
  it('MT-F07-01 デザインシステムの CSS をそのまま複製している', () => {
    // デザインシステムの原本はリポジトリ直下の documents にある（aws/documents には置いていない）
    const ds = '../documents/アプリ用_デザインシステム'
    expect(readFileSync('web/css/bundle.css', 'utf8')).toBe(readFileSync(`${ds}/components/bundle.css`, 'utf8'))
    expect(readFileSync('web/css/tokens.css', 'utf8')).toBe(readFileSync(`${ds}/tokens.css`, 'utf8'))
  })
  it('MT-F07-02 ExpBar：EXPの割合と獲得EXP', () => {
    const e = el(expBar({ level: 5, exp: 410, next: 690, gain: 45 }))
    expect(e.querySelector('.gd-crest b').textContent).toBe('5')
    expect(e.querySelector('.gd-fill').style.width).toMatch(/^59\.4/)
    expect(e.querySelector('.gd-exp-gain').textContent).toBe('+45 EXP')
    expect(el(expBar({ level: 1, exp: 900, next: 100 })).querySelector('.gd-fill').style.width).toBe('100%')
  })
  it('MT-F07-03 PartnerBubble：発言はエスケープし、thinking は待機演出', () => {
    const e = el(partnerBubble({ name: 'ミナ', persona: 'encourage', text: '<b>やったね</b>\n次も' }))
    expect(e.querySelector('.gd-sigil').textContent).toBe('ミ')
    expect(e.querySelector('.gd-bubble-name span').textContent).toBe('励まし型')
    expect(e.querySelector('b')).toBeNull()
    expect(e.innerHTML).toContain('&lt;b&gt;やったね&lt;/b&gt;<br>次も')
    const t = el(partnerBubble({ name: '', persona: 'unknown', thinking: true }))
    expect(t.querySelector('.gd-dots')).not.toBeNull()
    expect(t.querySelector('.gd-bubble-name').textContent).toContain('ミナ')
    expect(partnerName({ persona: 'logic', name: null })).toBe('セージ')
    expect(partnerName({ persona: 'rival', name: 'カイ' })).toBe('カイ')
  })
  it('MT-F07-04 QuestCard：進み具合と達成の印', () => {
    const open = el(questCard({ title: '択一を5問解く', reward: 20, current: 2, target: 5 }))
    expect(open.querySelector('.gd-quest-meta').textContent).toContain('2 / 5')
    expect(open.querySelector('.gd-stamp')).toBeNull()
    const done = el(questCard({ title: '復習', reward: 30, current: 5, target: 5 }))
    expect(done.classList.contains('gd-quest-done')).toBe(true)
    expect(done.querySelector('.gd-stamp').textContent).toBe('達成')
  })
  it('MT-F07-05 ChoiceOption：判定後は押せず、色だけでなく ○× の文字を付ける', () => {
    const c = el(choiceOption({ no: 2, body: 'S3', state: 'correct' }))
    expect(c.querySelector('.gd-choice-key').textContent).toBe('イ')
    expect(c.disabled).toBe(true)
    expect(c.querySelector('.gd-choice-mark').textContent).toBe('○ 正解')
    expect(el(choiceOption({ no: 1, body: 'x', state: 'wrong' })).textContent).toContain('× 不正解')
    const s = el(choiceOption({ no: 1, body: 'x', state: 'selected' }))
    expect(s.disabled).toBe(false)
    expect(s.getAttribute('aria-pressed')).toBe('true')
  })
  it('MT-F07-06 ScoreMeter：合格と「あと◯点」', () => {
    expect(el(scoreMeter({ score: 72 })).querySelector('.gd-verdict').textContent).toBe('○ 合格')
    expect(el(scoreMeter({ score: 45 })).querySelector('.gd-verdict').textContent).toBe('あと15点')
    expect(el(scoreMeter({ score: 130 })).querySelector('.gd-track').getAttribute('aria-valuenow')).toBe('100')
  })
  it('MT-F07-07 ReviewStage：段階と習得', () => {
    const r = el(reviewStage({ stage: 3, kind: '説明' }))
    expect(r.querySelectorAll('.gd-pip-on')).toHaveLength(2)
    expect(r.querySelector('.gd-pip-now').textContent).toBe('7日')
    expect(el(reviewStage({ stage: 6 })).querySelector('.gd-mastered').textContent).toBe('習得')
    expect(el(reviewStage({ stage: 0 })).querySelector('.gd-review-state').textContent).toBe('未学習')
  })
  it('MT-F07-08 GuildBadge：コードから紋章と名前', () => {
    const b = badgeFromCode('streak_silver')
    expect(b).toEqual({ category: 'streak', tier: 'silver', title: '継続の証（銀）' })
    expect(el(guildBadge(b)).querySelector('.gd-emblem').textContent).toBe('継')
  })
  it('MT-F07-09 エラーの文言', () => {
    expect(errorMessage({ code: 'NETWORK', status: 0 })).toBe(M02)
    expect(errorMessage({ code: 'INTERNAL_ERROR', status: 500, message: 'boom' }, '読めませんでした')).toBe('読めませんでした')
    expect(errorMessage({ code: 'NOT_FOUND', status: 404, message: '冒険が見つかりません' })).toBe('冒険が見つかりません')
  })
  it('MT-F07-10 画像があれば円の中に出し、なければ頭文字', () => {
    expect(partnerBubble({ name: 'ミナ', persona: 'encourage', imageUrl: 'https://a/x.png?a=1&b="2"' })).toContain('<img class="app-sigil-img" src="https://a/x.png?a=1&amp;b=&quot;2&quot;" alt="">')
    expect(partnerBubble({ name: 'ミナ', persona: 'encourage' })).not.toContain('<img')
    expect(imageFor({ persona: 'logic', imageUrl: 'u' }, 'logic')).toBe('u')
    expect(imageFor({ persona: 'logic', imageUrl: 'u' }, 'rival')).toBeNull()
    expect(imageFor(null, 'rival')).toBeNull()
  })
})
