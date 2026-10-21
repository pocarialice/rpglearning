// S-05 キーワード説明：入力のたびに文字数と M-03〜05 を表示し、送信後は採点待ち（詳細設計書 6.2）
import { getContext } from '../../core/context.js'
import { partnerBubble, partnerName } from '../../components/partner-bubble.js'
import { button } from '../../components/button.js'
import { errorBand, errorMessage } from '../../components/status.js'
import { escapeHtml } from '../../logic/format.js'
import { validateExplanation, countChars, EXPLANATION_MIN, EXPLANATION_MAX } from '../../logic/validators.js'
import { pollGrading } from '../../logic/grading-poller.js'
import { progressLine } from './adventure.js'
export const HEADING_TEMPLATE = '【定義】\n\n【しくみ】\n\n【具体例】\n'
export const M07 = '採点に時間がかかっています。もう一度お試しください'
export const M_GRADING_FAILED = '採点できませんでした。もう一度お試しください'
export function validationMessage(v) {
  if (v.ok) return ''
  if (v.code === 'M-03') return `説明は${EXPLANATION_MIN}文字以上で入力してください（いま${v.params.count}文字）`
  if (v.code === 'M-04') return `説明は${EXPLANATION_MAX}文字以内で入力してください（いま${v.params.count}文字）`
  return '200文字を超えたので、【】で小見出しを付けてください'
}
export async function render(root, _params, { pollOptions = {} } = {}) {
  const { api, getState, setState, go } = getContext()
  const { quest, adventureId, user } = getState()
  if (!quest || quest.kind !== 'explain') return go('/home')
  const partner = { persona: user?.partner?.persona ?? 'encourage', name: partnerName(user?.partner) }
  root.innerHTML = `${progressLine(quest)}
<section class="gd-card app-section"><p class="meta">このキーワードを説明しよう</p><h1 class="title">${escapeHtml(quest.keyword.text)}</h1>
<details class="app-source"><summary class="meta">出典の問題文を見る</summary><p class="body">${escapeHtml(quest.question.body).replace(/\n/g, '<br>')}</p></details></section>
<div class="app-explain-form">
<label class="label" for="explain-text">説明（${EXPLANATION_MIN}〜${EXPLANATION_MAX}文字）</label>
<textarea id="explain-text" class="app-textarea body" rows="9" aria-describedby="explain-count explain-msg"></textarea>
<div class="app-counter"><span id="explain-count" class="meta" aria-live="polite">0文字</span>${button({ label: '見出しを入れる', variant: 'quiet', size: 'sm', attrs: 'data-action="heading"' })}</div>
<p id="explain-msg" class="meta app-hint"></p>
<div class="app-error-slot"></div>
${button({ label: '採点してもらう', variant: 'primary', block: true, disabled: true, attrs: 'data-action="submit"' })}</div>
<div class="app-waiting" hidden></div>`
  const form = root.querySelector('.app-explain-form')
  const waiting = root.querySelector('.app-waiting')
  const ta = root.querySelector('#explain-text')
  const count = root.querySelector('#explain-count')
  const msg = root.querySelector('#explain-msg')
  const submit = root.querySelector('[data-action="submit"]')
  const errorSlot = root.querySelector('.app-error-slot')
  const update = () => {
    const v = validateExplanation(ta.value)
    count.textContent = `${countChars(ta.value)}文字`
    msg.textContent = ta.value.trim() === '' ? '' : validationMessage(v)
    submit.disabled = !v.ok
  }
  ta.addEventListener('input', update)
  root.querySelector('[data-action="heading"]').addEventListener('click', () => {
    ta.value = ta.value.trim() === '' ? HEADING_TEMPLATE : `${ta.value.replace(/\n*$/, '')}\n${HEADING_TEMPLATE}`
    update()
    ta.focus()
  })
  const showForm = (message) => {
    waiting.hidden = true
    waiting.innerHTML = ''
    form.hidden = false
    errorSlot.innerHTML = errorBand(message)
    update()
  }
  submit.addEventListener('click', async () => {
    if (!validateExplanation(ta.value).ok) return
    submit.disabled = true
    errorSlot.innerHTML = ''
    let gradingId
    try {
      const res = await api.apiPost('/gradings', { keywordId: quest.keyword.id, text: ta.value, isReview: !!quest.isReview, adventureId })
      gradingId = res.gradingId
    } catch (err) {
      return showForm(errorMessage(err, M_GRADING_FAILED))
    }
    form.hidden = true
    waiting.hidden = false
    waiting.innerHTML = `${partnerBubble({ ...partner, thinking: true })}<p class="meta app-center" role="status">${escapeHtml(partner.name)}が採点しています</p>`
    try {
      const res = await pollGrading(gradingId, { apiGet: api.apiGet, ...pollOptions })
      if (res.status !== 'done') return showForm(M_GRADING_FAILED)
      setState({ result: { kind: 'explain', quest, text: ta.value, res } })
      go('/quest/result')
    } catch (err) {
      showForm(err?.code === 'GRADING_TIMEOUT' ? M07 : errorMessage(err, M_GRADING_FAILED))
    }
  })
}
