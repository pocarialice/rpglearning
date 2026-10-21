// ニックネームの登録（A-02）。初回の流れと、あとで作る S-08 の編集ダイアログで使う
import { button } from '../components/button.js'
import { errorBand, errorMessage } from '../components/status.js'
import { escapeHtml } from '../logic/format.js'
import { validateNickname } from '../logic/validators.js'
export const M08 = 'このニックネームはすでに使われています'
export const M_NICKNAME_ERROR = 'ニックネームを登録できませんでした。もう一度お試しください'
export function nicknameMessage(v) {
  if (v.ok) return ''
  if (v.params.reason === 'chars') return 'ニックネームに使えるのは、ひらがな・カタカナ・漢字・英数字・「_」「-」です'
  return `ニックネームは2〜12文字で入力してください（いま${v.params.count}文字）`
}
// notice：重複でこの段階に戻ってきたときの案内。onDone(nickname) は登録できたときに呼ぶ
export function mountNicknameStep(el, { api, value = '', notice = '', onDone }) {
  el.innerHTML = `<section class="gd-card app-section"><h2 class="title">ギルドでの呼び名</h2>
<p class="body">ランキングに出る名前。本名は学習者どうしには表示しない</p>
${notice ? `<div class="app-notice" role="status">${escapeHtml(notice)}</div>` : ''}
<label class="label" for="nickname">ニックネーム（2〜12文字）</label>
<input id="nickname" class="app-input body" type="text" autocomplete="nickname" maxlength="20" value="${escapeHtml(value)}" aria-describedby="nickname-msg">
<p id="nickname-msg" class="meta app-hint"></p>
<div class="app-error-slot"></div>
${button({ label: 'この名前で登録する', variant: 'primary', block: true, disabled: true, attrs: 'data-action="nickname"' })}</section>`
  const input = el.querySelector('#nickname')
  const msg = el.querySelector('#nickname-msg')
  const submit = el.querySelector('[data-action="nickname"]')
  const slot = el.querySelector('.app-error-slot')
  const update = () => {
    const v = validateNickname(input.value)
    msg.textContent = input.value.trim() === '' ? '' : nicknameMessage(v)
    submit.disabled = !v.ok
  }
  input.addEventListener('input', update)
  update()
  submit.addEventListener('click', async () => {
    if (!validateNickname(input.value).ok) return
    submit.disabled = true
    slot.innerHTML = ''
    try {
      const res = await api.apiPut('/me/profile', { nickname: input.value.trim() })
      onDone(res.nickname)
    } catch (err) {
      slot.innerHTML = errorBand(err?.status === 409 ? M08 : errorMessage(err, M_NICKNAME_ERROR))
      update()
    }
  })
}
