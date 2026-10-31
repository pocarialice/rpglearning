// S-05 キーワード説明：パートナーの問いかけ（A-07b）を出してから入力欄を出す。入力のたびに文字数と M-03・M-04 を表示し、送信後は採点待ち（詳細設計書 6.2）
import { getContext } from '../../core/context.js'
import { partnerBubble, partnerName } from '../../components/partner-bubble.js'
import { button } from '../../components/button.js'
import { errorBand, errorMessage } from '../../components/status.js'
import { escapeHtml, aiText } from '../../logic/format.js'
import { validateExplanation, countChars, EXPLANATION_MIN, EXPLANATION_MAX } from '../../logic/validators.js'
import { pollGrading } from '../../logic/grading-poller.js'
import { progressLine } from './adventure.js'
export const M07 = '採点に時間がかかっています。もう一度お試しください'
export const M_GRADING_FAILED = '採点できませんでした。もう一度お試しください'
// 問いかけを読み込めなかったときの定型文（A-07b の定型文と同じ）
export function fallbackPrompt(keyword) {
  return { text: `「${keyword}」とは何か、定義としくみを自分の言葉で説明してください。`, angles: ['定義', 'しくみ'] }
}
export function anglesLine(angles = []) {
  if (!angles.length) return ''
  return `<p class="meta app-angles">${angles.map((a) => `<span class="app-angle">#${escapeHtml(a)}</span>`).join('')}<span>この観点で答えてね</span></p>`
}
export function validationMessage(v) {
  if (v.ok) return ''
  if (v.code === 'M-03') return `説明は${EXPLANATION_MIN}文字以上で入力してください（いま${v.params.count}文字）`
  return `説明は${EXPLANATION_MAX}文字以内で入力してください（いま${v.params.count}文字）`
}
export async function render(root, _params, { pollOptions = {} } = {}) {
  const { api, getState, setState, go } = getContext()
  const { quest, adventureId, user } = getState()
  if (!quest || quest.kind !== 'explain') return go('/home')
  const partner = { persona: user?.partner?.persona ?? 'encourage', name: partnerName(user?.partner), imageUrl: user?.partner?.imageUrl ?? null }
  root.innerHTML = `${progressLine(quest)}
<section class="gd-card app-section"><p class="meta">このキーワードを説明しよう</p><h1 class="title">${escapeHtml(quest.keyword.text)}</h1>
<details class="app-source"><summary class="meta">出典の問題文を見る</summary><p class="body">${escapeHtml(quest.question.body).replace(/\n/g, '<br>')}</p></details></section>
<div class="app-ask"></div>
<div class="app-explain-form" hidden>
<label class="label" for="explain-text">あなたの回答（${EXPLANATION_MIN}〜${EXPLANATION_MAX}文字）</label>
<textarea id="explain-text" class="app-textarea body" rows="9" aria-describedby="explain-count explain-msg"></textarea>
<div class="app-counter"><span id="explain-count" class="meta" aria-live="polite">0文字</span></div>
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
  const ask = root.querySelector('.app-ask')
  // 問いかけは出題ごとに1回だけ作る（同じ問題を開き直したときは使い回す）
  let prompt = quest.prompt ?? null
  if (!prompt) {
    ask.innerHTML = `${partnerBubble({ ...partner, thinking: true })}<p class="meta app-center" role="status">${escapeHtml(partner.name)}が質問を考えています</p>`
    try {
      prompt = (await api.apiPost('/quests/explain-question', { keywordId: quest.keyword.id })).prompt
    } catch {
      prompt = null
    }
    if (!prompt?.text) prompt = fallbackPrompt(quest.keyword.text)
    setState({ quest: { ...quest, prompt } })
  }
  ask.innerHTML = `${partnerBubble({ ...partner, html: aiText(prompt.text) })}${anglesLine(prompt.angles)}`
  form.hidden = false
  const update = () => {
    const v = validateExplanation(ta.value)
    count.textContent = `${countChars(ta.value)}文字`
    msg.textContent = ta.value.trim() === '' ? '' : validationMessage(v)
    submit.disabled = !v.ok
  }
  ta.addEventListener('input', update)
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
      const res = await api.apiPost('/gradings', { keywordId: quest.keyword.id, text: ta.value, isReview: !!quest.isReview, adventureId, prompt })
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
      setState({ result: { kind: 'explain', quest: { ...quest, prompt }, text: ta.value, res } })
      go('/quest/result')
    } catch (err) {
      showForm(err?.code === 'GRADING_TIMEOUT' ? M07 : errorMessage(err, M_GRADING_FAILED))
    }
  })
}
