// S-13 利用者・コース・権限管理：タブで利用者とコースを切り替える（外部設計書 3.8、詳細設計書 6.2）
// 利用者：A-19 一覧・登録・ロール変更、A-20 論理削除（M-10 の確認）・復活。コース：A-21 一覧・登録・編集・担当者の割り当て
import { getContext } from '../../core/context.js'
import { button } from '../../components/button.js'
import { openDialog } from '../../components/dialog.js'
import { loading, errorBand, errorMessage } from '../../components/status.js'
import { escapeHtml, formatDate, formatDateTime } from '../../logic/format.js'
export const PAGE_SIZE = 50
export const ROLE_LABEL = { learner: '学習者', course_admin: 'コース管理者', system_admin: 'システム管理者' }
export const STATUS_LABEL = { active: '有効', invited: '招待中', deleted: '削除予定' }
export const M10 = (name) => `${name}さんを削除します。30日後に学習履歴を含めて完全に削除されます`
export const M_USERS_ERROR = '利用者を読み込めませんでした。もう一度お試しください'
export const M_COURSES_ERROR = 'コースを読み込めませんでした。もう一度お試しください'
export const M_SAVE_ERROR = '保存できませんでした。もう一度お試しください'
const FIELD_MESSAGE = {
  email: 'メールアドレスの形を確かめてください', fullName: '氏名は1〜50文字で入力してください', roles: 'ロールを1つ以上選んでください',
  name: 'コース名は1〜50文字で入力してください', certification: '資格名は1〜100文字で入力してください', description: '説明は1000文字以内で入力してください',
  adminUserIds: '担当者に選べるのは、有効なコース管理者だけです'
}
// 入力エラー（400）は欄の名前から文言を作り、それ以外は API の文言か「〜できませんでした」
function saveMessage(err) {
  const field = err?.details?.[0]?.field
  if (err?.status === 400 && FIELD_MESSAGE[field]) return FIELD_MESSAGE[field]
  return errorMessage(err, M_SAVE_ERROR)
}
const roleChecks = (selected) => Object.entries(ROLE_LABEL).map(([r, l]) =>
  `<label class="app-radio"><input type="checkbox" name="role" value="${r}"${selected.includes(r) ? ' checked' : ''}> ${l}</label>`).join('')
// フォームの欄（form.name などはフォーム自身の属性と重なるため使わない）
const field = (form, name) => form.elements.namedItem(name)
const readRoles = (el) => [...el.querySelectorAll('input[name="role"]:checked')].map((i) => i.value)
// ダイアログの中のフォーム：送信中はボタンを止め、失敗したら文言を出して戻す
function dialogForm({ title, fields, submitLabel, onSubmit }) {
  openDialog({
    title,
    mount: (body, close) => {
      body.innerHTML = `<form class="app-dialog-form" novalidate>${fields}<div class="app-dialog-msg"></div>
<div class="app-toolbar app-toolbar-end">${button({ label: 'やめる', variant: 'quiet', attrs: 'data-action="cancel"' })}${button({ label: submitLabel, variant: 'primary', attrs: 'data-action="submit"' })}</div></form>`
      body.querySelector('[data-action="cancel"]').addEventListener('click', close)
      const form = body.querySelector('form')
      const submit = body.querySelector('[data-action="submit"]')
      const send = async () => {
        submit.disabled = true
        body.querySelector('.app-dialog-msg').innerHTML = ''
        try {
          await onSubmit(form)
          close()
        } catch (err) {
          body.querySelector('.app-dialog-msg').innerHTML = errorBand(saveMessage(err))
          submit.disabled = false
        }
      }
      submit.addEventListener('click', send)
      form.addEventListener('submit', (e) => { e.preventDefault(); send() })
      form.querySelector('input, textarea')?.focus()
    }
  })
}
// ---- 利用者タブ ----
function userRow(u, meId) {
  const me = u.id === meId
  const status = u.status === 'deleted'
    ? `<span class="app-status app-status-failed">削除予定</span><p class="meta">${escapeHtml(formatDate(u.deleteScheduledOn))} に完全に削除</p>`
    : `<span class="app-status app-status-${u.status === 'active' ? 'done' : 'waiting'}">${STATUS_LABEL[u.status] ?? escapeHtml(u.status)}</span>`
  const ops = u.status === 'deleted'
    ? button({ label: '復活する', size: 'sm', attrs: `data-restore="${escapeHtml(u.id)}"` })
    : `${button({ label: 'ロールを変える', size: 'sm', attrs: `data-roles="${escapeHtml(u.id)}"` })}${u.status === 'invited' ? button({ label: '招待を送り直す', size: 'sm', attrs: `data-reinvite="${escapeHtml(u.id)}"` }) : ''}${me ? '' : button({ label: '削除する', size: 'sm', variant: 'quiet', attrs: `data-delete="${escapeHtml(u.id)}"` })}`
  return `<tr><td>${escapeHtml(u.fullName)}${me ? '<span class="meta">（あなた）</span>' : ''}</td><td>${escapeHtml(u.nickname ?? '-')}</td><td>${escapeHtml(u.email)}</td>
<td>${u.roles.map((r) => ROLE_LABEL[r] ?? escapeHtml(r)).join('・')}</td><td>${status}</td><td>${u.lastLoginAt ? escapeHtml(formatDateTime(u.lastLoginAt)) : '-'}</td>
<td><div class="app-row-ops">${ops}</div></td></tr>`
}
async function usersTab(el, ctx) {
  const { api, getState } = ctx
  const meId = getState().user?.userId
  const state = { q: '', status: '', offset: 0, rows: [] }
  el.innerHTML = `<div class="app-toolbar">
<form class="app-search" role="search"><label class="app-field"><span class="label">氏名・ニックネーム・メールで探す</span><input type="search" class="app-input body" name="q"></label>
<label class="app-field"><span class="label">状態</span><select class="app-input body" name="status"><option value="">すべて</option>${Object.entries(STATUS_LABEL).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
${button({ label: '探す', attrs: 'data-action="search"' })}</form>
${button({ label: '利用者を登録する', variant: 'primary', attrs: 'data-action="create-user"' })}</div>
<div class="app-error-slot" data-msg></div><div class="app-table-wrap" data-users></div><div class="app-toolbar app-pager"></div>`
  const tableEl = el.querySelector('[data-users]')
  const msg = el.querySelector('[data-msg]')
  const pager = el.querySelector('.app-pager')
  const load = async () => {
    tableEl.innerHTML = loading()
    const qs = new URLSearchParams({ q: state.q, limit: String(PAGE_SIZE), offset: String(state.offset) })
    if (state.status) qs.set('status', state.status)
    try {
      state.rows = (await api.apiGet(`/admin/users?${qs}`)).users ?? []
    } catch (err) {
      tableEl.innerHTML = errorBand(errorMessage(err, M_USERS_ERROR))
      return
    }
    tableEl.innerHTML = state.rows.length === 0 ? '<p class="body">当てはまる利用者がいない</p>'
      : `<table class="app-table"><thead><tr><th scope="col">氏名</th><th scope="col">ニックネーム</th><th scope="col">メール</th><th scope="col">ロール</th><th scope="col">状態</th><th scope="col">最終ログイン</th><th scope="col"><span class="app-sr-only">操作</span></th></tr></thead>
<tbody>${state.rows.map((u) => userRow(u, meId)).join('')}</tbody></table>`
    pager.innerHTML = `${state.offset > 0 ? button({ label: `前の${PAGE_SIZE}件`, size: 'sm', attrs: 'data-page="-1"' }) : '<span></span>'}${state.rows.length === PAGE_SIZE ? button({ label: `次の${PAGE_SIZE}件`, size: 'sm', attrs: 'data-page="1"' }) : ''}`
  }
  const done = (text) => { msg.innerHTML = `<div class="app-notice" role="status">${escapeHtml(text)}</div>`; return load() }
  const find = (id) => state.rows.find((u) => u.id === id)
  el.querySelector('.app-search').addEventListener('submit', (e) => { e.preventDefault(); el.querySelector('[data-action="search"]').click() })
  el.querySelector('[data-action="search"]').addEventListener('click', () => {
    const f = el.querySelector('.app-search')
    Object.assign(state, { q: field(f, 'q').value.trim(), status: field(f, 'status').value, offset: 0 })
    msg.innerHTML = ''
    load()
  })
  pager.addEventListener('click', (e) => {
    const b = e.target.closest('[data-page]')
    if (!b) return
    state.offset = Math.max(0, state.offset + Number(b.dataset.page) * PAGE_SIZE)
    load()
  })
  el.querySelector('[data-action="create-user"]').addEventListener('click', () => dialogForm({
    title: '利用者を登録する', submitLabel: '招待メールを送る',
    fields: `<p class="meta">登録すると、仮のパスワードを書いた招待メールが届く</p>
<label class="app-field"><span class="label">氏名（50文字まで）</span><input class="app-input body" name="fullName" maxlength="50" autocomplete="off"></label>
<label class="app-field"><span class="label">メールアドレス</span><input class="app-input body" type="email" name="email" autocomplete="off"></label>
<fieldset class="app-radios"><legend class="label">ロール</legend>${roleChecks(['learner'])}</fieldset>`,
    onSubmit: async (form) => {
      await api.apiPost('/admin/users', { fullName: field(form, 'fullName').value.trim(), email: field(form, 'email').value.trim(), roles: readRoles(form) })
      await done(`${field(form, 'fullName').value.trim()}さんを登録し、招待メールを送った`)
    }
  }))
  tableEl.addEventListener('click', async (e) => {
    const roles = e.target.closest('[data-roles]')
    const del = e.target.closest('[data-delete]')
    const restore = e.target.closest('[data-restore]')
    const reinvite = e.target.closest('[data-reinvite]')
    if (reinvite) {
      // 仮パスワードの期限（7日）が切れた・招待メールが届かないとき
      const u = find(reinvite.dataset.reinvite)
      reinvite.disabled = true
      try {
        await api.apiPost(`/admin/users/${encodeURIComponent(u.id)}/reinvite`)
        await done(`${u.fullName}さんに新しい仮パスワードで招待メールを送り直した`)
      } catch (err) {
        msg.innerHTML = errorBand(saveMessage(err))
        reinvite.disabled = false
      }
    } else if (roles) {
      const u = find(roles.dataset.roles)
      dialogForm({
        title: `${u.fullName}さんのロール`, submitLabel: 'ロールを変える',
        fields: `<fieldset class="app-radios"><legend class="label">ロール（1つ以上）</legend>${roleChecks(u.roles)}</fieldset>`,
        onSubmit: async (form) => {
          await api.apiPut(`/admin/users/${encodeURIComponent(u.id)}`, { roles: readRoles(form) })
          await done(`${u.fullName}さんのロールを変えた`)
        }
      })
    } else if (del) {
      const u = find(del.dataset.delete)
      dialogForm({
        title: '利用者を削除する', submitLabel: '削除する',
        fields: `<p class="body">${escapeHtml(M10(u.fullName))}</p><p class="meta">30日のあいだは「復活する」で元に戻せる</p>`,
        onSubmit: async () => {
          await api.apiPost(`/admin/users/${encodeURIComponent(u.id)}/delete`)
          await done(`${u.fullName}さんを削除予定にした`)
        }
      })
    } else if (restore) {
      const u = find(restore.dataset.restore)
      restore.disabled = true
      try {
        await api.apiPost(`/admin/users/${encodeURIComponent(u.id)}/restore`)
        await done(`${u.fullName}さんを復活した`)
      } catch (err) {
        msg.innerHTML = errorBand(saveMessage(err))
        restore.disabled = false
      }
    }
  })
  await load()
}
// ---- コースタブ ----
function courseFields(c, admins) {
  const checks = admins.length === 0 ? '<p class="meta">選べるコース管理者がいない。利用者タブでロールを付けてください</p>'
    : admins.map((a) => `<label class="app-radio"><input type="checkbox" name="admin" value="${escapeHtml(a.id)}"${c.adminUserIds?.includes(a.id) ? ' checked' : ''}> ${escapeHtml(a.fullName)}</label>`).join('')
  return `<label class="app-field"><span class="label">コース名（50文字まで）</span><input class="app-input body" name="name" maxlength="50" value="${escapeHtml(c.name ?? '')}"></label>
<label class="app-field"><span class="label">資格名（100文字まで）</span><input class="app-input body" name="certification" maxlength="100" value="${escapeHtml(c.certification ?? '')}"></label>
<label class="app-field"><span class="label">説明（任意、1000文字まで）</span><textarea class="app-textarea body" name="description" rows="3" maxlength="1000">${escapeHtml(c.description ?? '')}</textarea></label>
<fieldset class="app-radios"><legend class="label">担当のコース管理者</legend>${checks}</fieldset>`
}
const readCourse = (form) => ({
  name: field(form, 'name').value.trim(), certification: field(form, 'certification').value.trim(), description: field(form, 'description').value.trim() || null,
  adminUserIds: [...form.querySelectorAll('input[name="admin"]:checked')].map((i) => i.value)
})
async function coursesTab(el, ctx) {
  const { api } = ctx
  el.innerHTML = `<div class="app-toolbar app-toolbar-end">${button({ label: 'コースを登録する', variant: 'primary', attrs: 'data-action="create-course"' })}</div>
<div class="app-error-slot" data-msg></div><div class="app-table-wrap" data-courses>${loading()}</div>`
  const tableEl = el.querySelector('[data-courses]')
  const msg = el.querySelector('[data-msg]')
  let courses = []
  let admins = []
  const load = async () => {
    try {
      // 担当者の候補：有効なコース管理者（パイロットの規模のため200件で足りる）
      const [c, u] = await Promise.all([api.apiGet('/admin/courses'), api.apiGet('/admin/users?limit=200')])
      courses = c.courses ?? []
      admins = (u.users ?? []).filter((x) => x.status !== 'deleted' && x.roles.includes('course_admin'))
    } catch (err) {
      tableEl.innerHTML = errorBand(errorMessage(err, M_COURSES_ERROR))
      return
    }
    const nameOf = (id) => admins.find((a) => a.id === id)?.fullName ?? '（無効な利用者）'
    tableEl.innerHTML = courses.length === 0 ? '<p class="body">まだコースがない</p>'
      : `<table class="app-table"><thead><tr><th scope="col">コース名</th><th scope="col">資格名</th><th scope="col">担当のコース管理者</th><th scope="col"><span class="app-sr-only">操作</span></th></tr></thead>
<tbody>${courses.map((c) => `<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.certification)}</td><td>${c.adminUserIds.length ? c.adminUserIds.map((id) => escapeHtml(nameOf(id))).join('、') : '<span class="meta">未割り当て</span>'}</td>
<td>${button({ label: '編集する', size: 'sm', attrs: `data-edit-course="${escapeHtml(c.id)}"` })}</td></tr>`).join('')}</tbody></table>`
  }
  const done = (text) => { msg.innerHTML = `<div class="app-notice" role="status">${escapeHtml(text)}</div>`; return load() }
  el.querySelector('[data-action="create-course"]').addEventListener('click', () => dialogForm({
    title: 'コースを登録する', submitLabel: '登録する', fields: courseFields({}, admins),
    onSubmit: async (form) => {
      const body = readCourse(form)
      await api.apiPost('/admin/courses', body)
      await done(`「${body.name}」を登録した`)
    }
  }))
  tableEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-edit-course]')
    if (!b) return
    const c = courses.find((x) => x.id === b.dataset.editCourse)
    dialogForm({
      title: 'コースを編集する', submitLabel: '保存する', fields: courseFields(c, admins),
      onSubmit: async (form) => {
        const body = readCourse(form)
        await api.apiPut(`/admin/courses/${encodeURIComponent(c.id)}`, body)
        await done(`「${body.name}」を保存した`)
      }
    })
  })
  await load()
}
const TABS = [['users', '利用者'], ['courses', 'コース']]
export async function render(root, params = {}) {
  const ctx = getContext()
  const tab = params.tab === 'courses' ? 'courses' : 'users'
  root.innerHTML = `<h1 class="title app-admin-title">利用者・コース・権限管理</h1>
<div class="app-tabs" role="tablist" aria-label="管理する対象">${TABS.map(([k, l]) => `<button type="button" role="tab" class="app-tab" id="tab-${k}" aria-selected="${k === tab}" aria-controls="panel" data-tab="${k}"${k === tab ? '' : ' tabindex="-1"'}>${l}</button>`).join('')}</div>
<section id="panel" role="tabpanel" aria-labelledby="tab-${tab}" class="app-section app-tabpanel"></section>`
  const tablist = root.querySelector('[role="tablist"]')
  tablist.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]')
    if (b && b.dataset.tab !== tab) ctx.go(b.dataset.tab === 'users' ? '/admin/users' : '/admin/users?tab=courses')
  })
  // ←→ でタブを移る（WAI-ARIA のタブの操作）
  tablist.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const next = TABS[(TABS.findIndex(([k]) => k === tab) + 1) % TABS.length][0]
    ctx.go(next === 'users' ? '/admin/users' : '/admin/users?tab=courses')
  })
  const panel = root.querySelector('#panel')
  if (tab === 'users') await usersTab(panel, ctx)
  else await coursesTab(panel, ctx)
}
