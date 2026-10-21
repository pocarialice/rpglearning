// AIパートナーと名前を選ぶ（A-03）。初回の流れと、あとで作る S-09 で使う
import { partnerBubble, PERSONA_LABEL, DEFAULT_NAME } from '../components/partner-bubble.js'
import { button } from '../components/button.js'
import { errorBand, errorMessage } from '../components/status.js'
import { escapeHtml } from '../logic/format.js'
import { validatePartnerName } from '../logic/validators.js'
export const M_PARTNER_ERROR = '仲間を決められませんでした。もう一度お試しください'
// 外部設計書 3.6.1 の性格とホームのひとこと例
export const PERSONA_INTRO = {
  encourage: { trait: '明るく寄り添う。小さな前進を見つけて褒める', sample: '昨日より3問多く解けてるよ。今日もいこう' },
  logic: { trait: '冷静で分析的。根拠と効率を重視する', sample: '今日の復習は5問です。説明問題から始めるのが効率的です' },
  rival: { trait: '負けず嫌いで競争心をあおる。ただし相手を責めない', sample: '今週はまだ俺の方が上だな。追いつけるか？' }
}
export function partnerNameMessage(v) {
  if (v.ok) return ''
  if (v.params.reason === 'chars') return '名前に使えるのは、ひらがな・カタカナ・漢字・英数字です'
  return `名前は10文字以内で入力してください（いま${v.params.count}文字）`
}
// onDone({ persona, name }) は決まったときに呼ぶ。名前が空なら初期名になる
export function mountPartnerStep(el, { api, persona: initial = null, onDone }) {
  let persona = initial
  el.innerHTML = `<h2 class="title">旅の仲間を選ぶ</h2>
<div class="app-stack app-personas" role="radiogroup" aria-label="AIパートナー">${Object.keys(PERSONA_LABEL).map((p) => `
<button type="button" class="app-persona" role="radio" aria-checked="false" data-persona="${p}">
${partnerBubble({ name: DEFAULT_NAME[p], persona: p, text: PERSONA_INTRO[p].sample })}<span class="meta">${PERSONA_INTRO[p].trait}</span></button>`).join('')}</div>
<section class="gd-card app-section"><label class="label" for="partner-name">仲間の名前（1〜10文字、省略できる）</label>
<input id="partner-name" class="app-input body" type="text" maxlength="20" aria-describedby="partner-msg">
<p id="partner-msg" class="meta app-hint"></p></section>
<div class="app-error-slot"></div>
${button({ label: 'この仲間と冒険する', variant: 'primary', block: true, disabled: true, attrs: 'data-action="partner"' })}`
  const input = el.querySelector('#partner-name')
  const msg = el.querySelector('#partner-msg')
  const submit = el.querySelector('[data-action="partner"]')
  const slot = el.querySelector('.app-error-slot')
  const update = () => {
    for (const b of el.querySelectorAll('[data-persona]')) b.setAttribute('aria-checked', String(b.dataset.persona === persona))
    input.placeholder = persona ? `${DEFAULT_NAME[persona]}（初期名）` : ''
    const v = validatePartnerName(input.value)
    msg.textContent = partnerNameMessage(v)
    submit.disabled = !persona || !v.ok
  }
  el.querySelector('.app-personas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-persona]')
    if (!b) return
    persona = b.dataset.persona
    update()
  })
  input.addEventListener('input', update)
  update()
  submit.addEventListener('click', async () => {
    if (!persona || !validatePartnerName(input.value).ok) return
    submit.disabled = true
    slot.innerHTML = ''
    try {
      onDone(await api.apiPut('/me/partner', { persona, name: input.value }))
    } catch (err) {
      slot.innerHTML = errorBand(errorMessage(err, M_PARTNER_ERROR))
      update()
    }
  })
}
