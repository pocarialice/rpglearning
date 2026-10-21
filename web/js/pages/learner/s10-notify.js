// S-10 通知設定：メール通知のオン／オフと送信時刻（6:00〜22:00 の30分刻み）。プッシュ通知は Phase 2 のため「準備中」（外部設計書 3.7）
import { getContext } from '../../core/context.js'
import { button } from '../../components/button.js'
import { loading, errorBand, errorMessage } from '../../components/status.js'
import { validateNotifyTime } from '../../logic/validators.js'
export const M09 = '変更は明日の通知から反映されます'
export const M_NOTIFY_LOAD_ERROR = '通知設定を読み込めませんでした。もう一度お試しください'
export const M_NOTIFY_SAVE_ERROR = '通知設定を保存できませんでした。もう一度お試しください'
// 06:00, 06:30, … 22:00
export const SEND_TIMES = Array.from({ length: 33 }, (_, i) => `${String(6 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`)
function toggle({ id, label, checked, disabled = false, desc }) {
  return `<div class="app-toggle"><div><label class="label" for="${id}">${label}</label><p id="${id}-desc" class="meta">${desc}</p></div>
<div class="app-switch-wrap"><span class="meta app-switch-state" data-state-for="${id}" aria-hidden="true">${checked ? 'オン' : 'オフ'}</span>
<input id="${id}" type="checkbox" role="switch" class="app-switch" aria-describedby="${id}-desc"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}></div></div>`
}
export async function render(root) {
  const { api, go } = getContext()
  root.innerHTML = loading()
  let current
  try {
    current = await api.apiGet('/me/notify')
  } catch (err) {
    root.innerHTML = `${errorBand(errorMessage(err, M_NOTIFY_LOAD_ERROR))}${button({ label: 'もう一度読み込む', block: true, attrs: 'data-action="reload"' })}`
    root.querySelector('[data-action="reload"]').addEventListener('click', () => render(root))
    return
  }
  const options = SEND_TIMES.map((t) => `<option value="${t}"${t === current.sendTime ? ' selected' : ''}>${t}</option>`).join('')
  root.innerHTML = `<h1 class="display">通知設定</h1>
<section class="gd-card app-section" aria-labelledby="mail-h"><h2 id="mail-h" class="title">メール通知</h2>
${toggle({ id: 'email-enabled', label: 'メールで知らせる', checked: current.emailEnabled, desc: 'その日の復習の数と、本日の依頼を送る' })}
<label class="label" for="send-time">送る時刻</label>
<select id="send-time" class="app-input body"${current.emailEnabled ? '' : ' disabled'}>${options}</select></section>
<section class="gd-card app-section" aria-labelledby="push-h"><div class="app-course-head"><h2 id="push-h" class="title">プッシュ通知</h2><span class="app-chip">準備中</span></div>
${toggle({ id: 'push-enabled', label: 'ブラウザに知らせる', checked: false, disabled: true, desc: 'いまは使えない。次の段階で使えるようになる' })}</section>
<div class="app-result-slot"></div>
${button({ label: '設定を保存する', variant: 'primary', block: true, disabled: true, attrs: 'data-action="save"' })}
${button({ label: 'プロフィールへ戻る', variant: 'quiet', block: true, attrs: 'data-action="back"' })}`
  const email = root.querySelector('#email-enabled')
  const time = root.querySelector('#send-time')
  const save = root.querySelector('[data-action="save"]')
  const slot = root.querySelector('.app-result-slot')
  let saved = { ...current }
  // 保存した値から変わったときだけ「保存する」を押せる
  const update = () => {
    time.disabled = !email.checked
    root.querySelector('[data-state-for="email-enabled"]').textContent = email.checked ? 'オン' : 'オフ'
    save.disabled = (email.checked === saved.emailEnabled && time.value === saved.sendTime) || !validateNotifyTime(time.value).ok
  }
  email.addEventListener('change', () => { slot.innerHTML = ''; update() })
  time.addEventListener('change', () => { slot.innerHTML = ''; update() })
  update()
  save.addEventListener('click', async () => {
    save.disabled = true
    try {
      const res = await api.apiPut('/me/notify', { emailEnabled: email.checked, sendTime: time.value })
      saved = { emailEnabled: res.emailEnabled, sendTime: res.sendTime }
      slot.innerHTML = `<div class="app-notice" role="status">保存した。${M09}</div>`
    } catch (err) {
      slot.innerHTML = errorBand(errorMessage(err, M_NOTIFY_SAVE_ERROR))
    }
    update()
  })
  root.querySelector('[data-action="back"]').addEventListener('click', () => go('/profile'))
}
