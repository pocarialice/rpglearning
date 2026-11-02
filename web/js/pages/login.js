// S-01 ログイン（外部設計書 3.7 S-01）。初回の新しいパスワード、パスワードを忘れたとき、再設定リンクからの設定、アカウントの作成を含む
import { button } from '../components/button.js'
import { errorBand } from '../components/status.js'
import { escapeHtml } from '../logic/format.js'
export const M_LOGIN_FAILED = 'メールアドレスかパスワードが正しくありません'
export const M_PASSWORD_RULE = '8文字以上で、数字・大文字・小文字を1つ以上入れてください'
export const M_FORGOT_SENT = '登録されているメールアドレスなら、再設定のメールを送りました。メールのリンクを1時間以内に開いてください'
export const M_RESET_DONE = 'パスワードを変更しました。新しいパスワードでログインしてください'
export const M_RESET_INVALID = 'リンクの期限が切れているか、すでに使われています。もう一度「パスワードを忘れたとき」からやり直してください'
export const M_NETWORK = '通信できませんでした。もう一度お試しください'
export const M_SIGNUP_SENT = '確認のメールを送りました。メールのリンクを24時間以内に開くと、登録が終わります'
export const M_SIGNUP_INVALID = 'リンクの期限が切れているか、すでに使われています。もう一度「アカウントを作る」からやり直してください'
export const M_SIGNUP_VERIFYING = 'アカウントを登録しています…'
export const M_SIGNUP_INPUT = '名前・メールアドレス・パスワードを入れてください'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const signupOk = ({ fullName, email, password, password2 }) => fullName.trim() !== '' && [...fullName.trim()].length <= 50
  && EMAIL_RE.test(email.trim()) && passwordOk(password) && password === password2
// 画面の決まり（サーバーと同じ）。ボタンを押せるかどうかに使う
export const passwordOk = (v) => [...v].length >= 8 && /[0-9]/.test(v) && /[A-Z]/.test(v) && /[a-z]/.test(v)
const field = (id, label, type, autocomplete, extra = '') => `<label class="label" for="${id}">${label}</label>
<input id="${id}" class="app-input body" type="${type}" autocomplete="${autocomplete}" ${extra}>`
const message = (err) => (err?.code === 'NETWORK' ? M_NETWORK : err?.message && err.message !== err.code ? err.message : M_NETWORK)
function frame(root, title, inner) {
  root.innerHTML = `<section class="gd-card app-section app-login"><h1 class="display">${escapeHtml(title)}</h1>${inner}</section>`
}
// auth：createAuth の戻り値。win：location（再設定リンクの token を読む）と reload に使う
const hashToken = (win, name) => (new RegExp(`^#/${name}\\?`).test(win.location.hash) ? new URLSearchParams(win.location.hash.split('?')[1]).get('token') : null)
export function renderLogin(root, { auth, win = window, notice = '' }) {
  const token = hashToken(win, 'reset')
  if (token) return renderReset(root, { auth, win, token })
  const signupToken = hashToken(win, 'signup')
  if (signupToken) return renderVerifySignup(root, { auth, win, token: signupToken })
  renderSignIn(root, { auth, win, notice })
}
function renderSignIn(root, { auth, win, notice = '' }) {
  frame(root, 'RPG学習アプリ', `<p class="body">ギルドに入るには、ログインしてください</p>
${notice ? `<div class="app-notice" role="status">${escapeHtml(notice)}</div>` : ''}
${field('login-email', 'メールアドレス', 'email', 'username')}
${field('login-password', 'パスワード', 'password', 'current-password')}
<div class="app-error-slot"></div>
${button({ label: 'ログイン', variant: 'primary', block: true, attrs: 'data-action="login"' })}
${button({ label: 'パスワードを忘れたとき', variant: 'quiet', block: true, attrs: 'data-action="forgot"' })}
<p class="body app-login-divider">はじめての方は</p>
${button({ label: 'アカウントを作る', variant: 'secondary', block: true, attrs: 'data-action="signup"' })}`)
  const slot = root.querySelector('.app-error-slot')
  const submit = root.querySelector('[data-action="login"]')
  submit.addEventListener('click', async () => {
    const email = root.querySelector('#login-email').value.trim()
    const password = root.querySelector('#login-password').value
    slot.innerHTML = ''
    if (!email || !password) {
      slot.innerHTML = errorBand(M_LOGIN_FAILED)
      return
    }
    submit.disabled = true
    try {
      const res = await auth.signIn(email, password)
      if (res.challenge) return renderNewPassword(root, { auth, win, session: res.session })
      win.location.reload()
    } catch (err) {
      slot.innerHTML = errorBand(message(err))
      submit.disabled = false
    }
  })
  root.querySelector('[data-action="forgot"]').addEventListener('click', () => renderForgot(root, { auth, win }))
  root.querySelector('[data-action="signup"]').addEventListener('click', () => renderSignup(root, { auth, win }))
}
// 新しいパスワードの入力欄（確認つき）。onSubmit(password) が終わるまでボタンを押せなくする
function passwordForm(root, { title, lead, label, onSubmit }) {
  frame(root, title, `<p class="body">${escapeHtml(lead)}</p>
${field('new-password', '新しいパスワード', 'password', 'new-password', 'aria-describedby="new-password-rule"')}
<p id="new-password-rule" class="meta app-hint">${M_PASSWORD_RULE}</p>
${field('new-password2', '新しいパスワード（確認）', 'password', 'new-password')}
<div class="app-error-slot"></div>
${button({ label, variant: 'primary', block: true, disabled: true, attrs: 'data-action="set-password"' })}`)
  const p1 = root.querySelector('#new-password')
  const p2 = root.querySelector('#new-password2')
  const submit = root.querySelector('[data-action="set-password"]')
  const slot = root.querySelector('.app-error-slot')
  const update = () => { submit.disabled = !(passwordOk(p1.value) && p1.value === p2.value) }
  p1.addEventListener('input', update)
  p2.addEventListener('input', update)
  submit.addEventListener('click', async () => {
    submit.disabled = true
    slot.innerHTML = ''
    try {
      await onSubmit(p1.value)
    } catch (err) {
      slot.innerHTML = errorBand(message(err))
      update()
    }
  })
}
function renderNewPassword(root, { auth, win, session }) {
  passwordForm(root, {
    title: '新しいパスワード', lead: '仮パスワードでログインしました。これから使うパスワードを決めてください', label: 'このパスワードにする',
    onSubmit: async (password) => {
      await auth.completeNewPassword(session, password)
      win.location.reload()
    }
  })
}
function renderReset(root, { auth, win, token }) {
  passwordForm(root, {
    title: 'パスワードの再設定', lead: '新しいパスワードを決めてください', label: 'パスワードを変更する',
    onSubmit: async (password) => {
      try {
        await auth.resetPassword(token, password)
      } catch (err) {
        if (err?.status === 400) throw Object.assign(new Error(M_RESET_INVALID), { code: 'RESET_INVALID' })
        throw err
      }
      win.history.replaceState(null, '', win.location.pathname)
      renderSignIn(root, { auth, win, notice: M_RESET_DONE })
    }
  })
}
function renderForgot(root, { auth, win }) {
  frame(root, 'パスワードを忘れたとき', `<p class="body">登録しているメールアドレスに、パスワードを再設定するためのリンクを送ります</p>
${field('forgot-email', 'メールアドレス', 'email', 'username')}
<div class="app-error-slot"></div>
${button({ label: '再設定のメールを送る', variant: 'primary', block: true, attrs: 'data-action="send"' })}
${button({ label: 'ログインに戻る', variant: 'quiet', block: true, attrs: 'data-action="back"' })}`)
  const slot = root.querySelector('.app-error-slot')
  const submit = root.querySelector('[data-action="send"]')
  submit.addEventListener('click', async () => {
    const email = root.querySelector('#forgot-email').value.trim()
    if (!email) return
    submit.disabled = true
    slot.innerHTML = ''
    try {
      await auth.forgot(email)
      renderSignIn(root, { auth, win, notice: M_FORGOT_SENT })
    } catch (err) {
      slot.innerHTML = errorBand(message(err))
      submit.disabled = false
    }
  })
  root.querySelector('[data-action="back"]').addEventListener('click', () => renderSignIn(root, { auth, win }))
}
// A-36 アカウントの作成。入力がそろうまでボタンを押せなくする
function renderSignup(root, { auth, win }) {
  frame(root, 'アカウントを作る', `<p class="body">登録すると、学習者としてギルドに入れます。入力したメールアドレスに確認のメールを送ります</p>
${field('signup-name', '名前', 'text', 'name', 'maxlength="50"')}
${field('signup-email', 'メールアドレス', 'email', 'email')}
${field('signup-password', 'パスワード', 'password', 'new-password', 'aria-describedby="signup-password-rule"')}
<p id="signup-password-rule" class="meta app-hint">${M_PASSWORD_RULE}</p>
${field('signup-password2', 'パスワード（確認）', 'password', 'new-password')}
<div class="app-error-slot"></div>
${button({ label: '確認のメールを送る', variant: 'primary', block: true, disabled: true, attrs: 'data-action="signup-send"' })}
${button({ label: 'ログインに戻る', variant: 'quiet', block: true, attrs: 'data-action="back"' })}`)
  const val = (id) => root.querySelector(`#${id}`).value
  const values = () => ({ fullName: val('signup-name'), email: val('signup-email'), password: val('signup-password'), password2: val('signup-password2') })
  const submit = root.querySelector('[data-action="signup-send"]')
  const slot = root.querySelector('.app-error-slot')
  const update = () => { submit.disabled = !signupOk(values()) }
  for (const id of ['signup-name', 'signup-email', 'signup-password', 'signup-password2']) root.querySelector(`#${id}`).addEventListener('input', update)
  submit.addEventListener('click', async () => {
    const v = values()
    slot.innerHTML = ''
    if (!signupOk(v)) {
      slot.innerHTML = errorBand(M_SIGNUP_INPUT)
      return
    }
    submit.disabled = true
    try {
      await auth.signUp(v.email.trim(), v.fullName.trim(), v.password)
      renderSignIn(root, { auth, win, notice: M_SIGNUP_SENT })
    } catch (err) {
      slot.innerHTML = errorBand(message(err))
      update()
    }
  })
  root.querySelector('[data-action="back"]').addEventListener('click', () => renderSignIn(root, { auth, win }))
}
// A-37 確認リンクを開いたとき。登録できたらログインした状態で読み込み直す
async function renderVerifySignup(root, { auth, win, token }) {
  frame(root, 'アカウントの登録', `<p class="body" role="status">${M_SIGNUP_VERIFYING}</p><div class="app-error-slot"></div>`)
  const leave = () => win.history.replaceState(null, '', win.location.pathname)
  try {
    await auth.verifySignup(token)
    leave()
    win.location.reload()
  } catch (err) {
    const text = err?.status === 400 ? M_SIGNUP_INVALID : message(err)
    frame(root, 'アカウントの登録', `<div class="app-error-slot">${errorBand(text)}</div>
${button({ label: 'ログインに戻る', variant: 'quiet', block: true, attrs: 'data-action="back"' })}`)
    root.querySelector('[data-action="back"]').addEventListener('click', () => {
      leave()
      renderSignIn(root, { auth, win })
    })
  }
}
