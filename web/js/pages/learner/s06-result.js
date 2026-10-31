// S-06 結果・フィードバック：A-08／A-10 の結果を表示する。「次の問題へ」で A-07、10問目のあとは「ホームへ」（詳細設計書 6.2）
import { getContext } from '../../core/context.js'
import { choiceOption } from '../../components/choice-option.js'
import { scoreMeter } from '../../components/score-meter.js'
import { expBar } from '../../components/exp-bar.js'
import { reviewStage } from '../../components/review-stage.js'
import { partnerBubble, partnerName, imageFor } from '../../components/partner-bubble.js'
import { questCard } from '../../components/quest-card.js'
import { guildBadge, badgeFromCode } from '../../components/guild-badge.js'
import { button } from '../../components/button.js'
import { errorBand, errorMessage } from '../../components/status.js'
import { escapeHtml, formatDate, formatExp } from '../../logic/format.js'
import { goNextQuest } from './adventure.js'
export const M_NEXT_ERROR = '次の問題を読み込めませんでした。もう一度お試しください'
const nl2br = (s) => escapeHtml(s).replace(/\n/g, '<br>')
function choiceState(no, selected, correctChoice) {
  if (no === correctChoice) return 'correct'
  if (no === selected) return 'wrong'
  return 'dim'
}
function choiceSection({ quest, selected, res }, partner) {
  const verdict = res.correct ? '<p class="app-verdict app-verdict-correct">○ 正解</p>' : '<p class="app-verdict app-verdict-wrong">× 不正解</p>'
  const options = quest.question.choices.map((c) => choiceOption({ no: c.no, body: c.body, state: choiceState(c.no, selected, res.correctChoice) })).join('')
  const explanation = res.explanation && res.explanation !== res.comment?.text
    ? `<section class="gd-card app-section"><h2 class="title">解説</h2><p class="body">${nl2br(res.explanation)}</p></section>` : ''
  return `<section class="gd-card app-section"><h1 class="app-sr-only">結果</h1>${verdict}<p class="question">${nl2br(quest.question.body)}</p></section>
<div class="app-stack">${options}</div>
${partnerBubble({ name: res.comment?.partnerName, persona: res.comment?.persona, text: res.comment?.text ?? '', imageUrl: imageFor(partner, res.comment?.persona) })}${explanation}`
}
// 問いかけと観点ごとの答え方（A-10 の prompt）。古い採点には prompt がないので、そのときは出さない
export const ANGLE_MARK = { full: '○', partial: '△', none: '×' }
export const ANGLE_LABEL = { full: '答えられた', partial: '一部', none: 'まだ' }
function promptSection(prompt, comment) {
  if (!prompt?.text) return ''
  const angles = (prompt.angles ?? []).map((a) => {
    const mark = ANGLE_MARK[a.status] ? `<span class="app-angle-mark app-angle-${a.status}" aria-hidden="true">${ANGLE_MARK[a.status]}</span><span class="app-sr-only">${ANGLE_LABEL[a.status]}</span>` : ''
    return `<li><span class="app-angle">#${escapeHtml(a.label)}</span>${mark}</li>`
  }).join('')
  return `<p class="meta">${escapeHtml(partnerName({ persona: comment?.persona, partnerName: comment?.partnerName }))}の質問</p><p class="body">${nl2br(prompt.text)}</p>${angles ? `<ul class="app-angle-results">${angles}</ul>` : ''}`
}
function explainSection({ quest, res }, partner) {
  const missing = res.missingPoints?.length
    ? `<p class="meta">足りない観点</p><ul class="app-list">${res.missingPoints.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>` : ''
  const model = res.modelAnswer ? `<p class="meta app-model-label">模範説明</p><p>${nl2br(res.modelAnswer)}</p>` : ''
  return `<section class="gd-card app-section"><h1 class="title">${escapeHtml(quest.keyword.text)}</h1>${promptSection(res.prompt, res.comment)}${scoreMeter({ score: res.score, foot: missing })}</section>
${partnerBubble({ name: res.comment?.partnerName, persona: res.comment?.persona, html: `<p>${nl2br(res.comment?.text ?? '')}</p>${model}`, imageUrl: imageFor(partner, res.comment?.persona) })}`
}
function expSection(exp) {
  if (!exp) return ''
  const notes = []
  if (exp.levelUp) notes.push(`<p class="app-levelup">レベルアップ　Lv.${Number(exp.level)}</p>`)
  if (exp.reviewBonus) notes.push('<p class="meta">復習ボーナスを含む</p>')
  if (exp.questExp) notes.push(`<p class="meta">依頼の報酬 +${formatExp(exp.questExp)} EXP を含む</p>`)
  return `<section class="gd-card app-section" aria-label="獲得EXP">${expBar({ level: exp.level, exp: exp.expInLevel, next: exp.next, gain: exp.gained })}${notes.join('')}</section>`
}
function reviewSection(kind, review) {
  if (!review) return ''
  const next = review.nextDate && review.stage < 6 ? `<p class="meta">次の復習 ${escapeHtml(formatDate(review.nextDate))}</p>` : ''
  return `<section class="gd-card app-section"><h2 class="label">復習段階</h2>${reviewStage({ stage: review.stage, kind: kind === 'choice' ? '択一' : '説明' })}${next}</section>`
}
function achievements(res, titles = {}) {
  const quests = (res.quests ?? []).filter((q) => q.achievedNow)
  const badges = res.badges ?? []
  if (quests.length === 0 && badges.length === 0) return ''
  const qs = quests.map((q) => questCard({ title: titles[q.id] ?? '本日の依頼', reward: q.reward, current: q.progress, target: q.target, done: true })).join('')
  const bs = badges.length ? `<div class="app-badges">${badges.map((code) => guildBadge(badgeFromCode(code))).join('')}</div>` : ''
  return `<section class="app-section" aria-labelledby="achieve-h"><h2 id="achieve-h" class="title">達成</h2><div class="app-stack">${qs}${bs}</div></section>`
}
export async function render(root) {
  const { api, getState, setState, go } = getContext()
  const { result, questTitles } = getState()
  if (!result) return go('/home')
  const { kind, quest, res } = result
  const last = quest.index >= quest.total
  const actions = last
    ? button({ label: 'ホームへ', variant: 'primary', block: true, attrs: 'data-action="home"' })
    : `${button({ label: '次の問題へ', variant: 'primary', block: true, attrs: 'data-action="next"' })}${button({ label: 'ホームへ', variant: 'quiet', block: true, attrs: 'data-action="home"' })}`
  root.innerHTML = `<p class="meta app-progress">${Number(quest.index)} / ${Number(quest.total)}問</p>
${kind === 'choice' ? choiceSection(result, getState().user?.partner) : explainSection(result, getState().user?.partner)}
${expSection(res.exp)}${reviewSection(kind, res.review)}${achievements(res, questTitles)}
<div class="app-error-slot"></div><div class="app-actions">${actions}</div>`
  root.querySelector('[data-action="home"]').addEventListener('click', () => {
    setState({ result: null, quest: null, ...(last ? { adventureId: null } : {}) })
    go('/home')
  })
  const next = root.querySelector('[data-action="next"]')
  next?.addEventListener('click', async () => {
    next.disabled = true
    try {
      await goNextQuest({ api, getState, setState, go })
    } catch (err) {
      root.querySelector('.app-error-slot').innerHTML = errorBand(errorMessage(err, M_NEXT_ERROR))
      next.disabled = false
    }
  })
}
