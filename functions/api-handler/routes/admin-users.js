// A-19 利用者の一覧・登録・ロール変更、A-20 論理削除・復活、A-21b 再招待（詳細設計書 5.3）
import { randomUUID } from 'node:crypto'
import { AppError } from '../../shared/util/errors.js'
import { ok } from '../../shared/util/http.js'
import { decodeId, encodeId, PREFIX } from '../../shared/util/ids.js'
import { addDays, parseDbTimestamp, toIsoJst } from '../../shared/util/date-jst.js'
import { ROLES } from '../../shared/util/authz.js'
import { withTx } from '../../shared/db/tx.js'
import * as users from '../../shared/db/repositories/users.js'
import * as audit from '../../shared/db/repositories/audit.js'
import * as auth from '../../shared/db/repositories/auth.js'
import { hashPassword, generateTempPassword } from '../../shared/auth/password.js'
import { sendMail } from '../../shared/mail/smtp.js'
import { deletionMail, inviteMail } from '../../shared/mail/templates.js'
export const DELETE_AFTER_DAYS = 30
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const invalid = (field) => new AppError('VALIDATION_ERROR', undefined, { details: [{ field, code: 'INVALID' }] })
export const TEMP_PASSWORD_DAYS = 7
async function sendInvite(email, tempPassword) {
  try {
    await sendMail(inviteMail({ email, tempPassword, validDays: TEMP_PASSWORD_DAYS }))
  } catch (err) {
    throw new AppError('INTERNAL_ERROR', '招待メールを送れませんでした。メールの設定を確認してください', { cause: err?.name })
  }
}
function validRoles(roles) {
  if (!Array.isArray(roles) || roles.length === 0 || !roles.every((r) => ROLES.includes(r)) || new Set(roles).size !== roles.length) throw invalid('roles')
  return roles
}
const view = (u) => ({
  id: encodeId(PREFIX.user, u.userId), fullName: u.fullName, nickname: u.nickname ?? null, email: u.email, roles: u.roles,
  status: u.status, deleteScheduledOn: u.deleteScheduledOn ?? null, lastLoginAt: u.lastLoginAt ? toIsoJst(parseDbTimestamp(u.lastLoginAt)) : null
})
export async function list(ctx) {
  const q = ctx.query
  const rows = await users.listForAdmin({
    q: q.q ?? '', status: q.status ?? null, sort: q.sort ?? 'id', order: q.order ?? 'asc',
    limit: Math.min(Number(q.limit ?? 50) || 50, 200), offset: Math.max(Number(q.offset ?? 0) || 0, 0)
  })
  return ok({ users: rows.map(view) })
}
export async function create(ctx) {
  const { email, fullName, roles } = ctx.body()
  if (typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 254) throw invalid('email')
  if (typeof fullName !== 'string' || fullName.trim() === '' || [...fullName].length > 50) throw invalid('fullName')
  validRoles(roles)
  // 仮パスワードを作って招待メールを送る。メールを送れなかったら登録ごと取り消す
  const tempPassword = generateTempPassword()
  const hash = await hashPassword(tempPassword)
  let userId
  try {
    userId = await withTx(async (tx) => {
      const id = await users.create({ sub: randomUUID(), email, fullName: fullName.trim(), roles }, tx)
      await auth.setPassword(id, hash, { mustChange: true, tempValidDays: TEMP_PASSWORD_DAYS }, tx)
      await audit.write(ctx.user.userId, 'user.create', { type: 'user', id }, { roles }, tx)
      await sendInvite(email, tempPassword)
      return id
    })
  } catch (err) {
    if (err?.code === '23505') throw new AppError('CONFLICT', 'このメールアドレスはすでに登録されています', { details: [{ field: 'email' }] })
    throw err
  }
  return ok({ id: encodeId(PREFIX.user, userId), status: 'invited' }, 201)
}
async function loadTarget(ctx) {
  const userId = decodeId(PREFIX.user, ctx.params.id)
  const target = await users.findById(userId)
  if (!target) throw new AppError('NOT_FOUND', '利用者が見つかりません')
  return target
}
export async function update(ctx) {
  const target = await loadTarget(ctx)
  const roles = validRoles(ctx.body().roles)
  if (target.userId === ctx.user.userId && target.roles.includes('system_admin') && !roles.includes('system_admin')) {
    throw new AppError('CONFLICT', '自分のシステム管理者のロールは外せません')
  }
  const added = roles.filter((r) => !target.roles.includes(r))
  const removed = target.roles.filter((r) => !roles.includes(r))
  await withTx(async (tx) => {
    await users.setRoles(target.userId, roles, tx)
    await audit.write(ctx.user.userId, 'user.role', { type: 'user', id: target.userId }, { added, removed }, tx)
  })
  return ok({ id: encodeId(PREFIX.user, target.userId), roles })
}
export async function remove(ctx) {
  const target = await loadTarget(ctx)
  if (target.userId === ctx.user.userId) throw new AppError('CONFLICT', '自分自身は削除できません')
  if (target.status === 'deleted') throw new AppError('CONFLICT', 'すでに削除予定です')
  const deleteOn = addDays(ctx.today, DELETE_AFTER_DAYS)
  await withTx(async (tx) => {
    if (!(await users.markDeleted(target.userId, deleteOn, tx))) throw new AppError('CONFLICT', '利用者の状態が変わりました')
    await audit.write(ctx.user.userId, 'user.delete', { type: 'user', id: target.userId }, { deleteOn }, tx)
    // ログイン中の端末も、次のトークン更新でログアウトさせる（アクセストークンは最長60分有効）
    await auth.revokeAllForUser(target.userId, tx)
  })
  try {
    await sendMail(deletionMail({ ...target, deleteScheduledOn: deleteOn }))
  } catch (err) {
    ctx.log.warn({ msg: 'deletion_mail.failed', userId: target.userId, errorName: err?.name })
  }
  return ok({ id: encodeId(PREFIX.user, target.userId), status: 'deleted', deleteScheduledOn: deleteOn })
}
export async function restore(ctx) {
  const target = await loadTarget(ctx)
  if (target.status !== 'deleted') throw new AppError('CONFLICT', '削除予定の利用者ではありません')
  await withTx(async (tx) => {
    if (!(await users.restore(target.userId, tx))) throw new AppError('CONFLICT', '利用者の状態が変わりました')
    await audit.write(ctx.user.userId, 'user.restore', { type: 'user', id: target.userId }, {}, tx)
  })
  return ok({ id: encodeId(PREFIX.user, target.userId), status: 'active' })
}
// 仮パスワードを作り直して招待メールを送り直す（期限切れ・メールの紛失のとき）。まだパスワードを決めていない利用者だけ
export async function reinvite(ctx) {
  const target = await loadTarget(ctx)
  if (target.status !== 'invited') throw new AppError('CONFLICT', 'すでにログインしたことがある利用者です。パスワードを忘れたときは、ログイン画面から再設定できます')
  const tempPassword = generateTempPassword()
  const hash = await hashPassword(tempPassword)
  await withTx(async (tx) => {
    await auth.setPassword(target.userId, hash, { mustChange: true, tempValidDays: TEMP_PASSWORD_DAYS }, tx)
    await audit.write(ctx.user.userId, 'user.reinvite', { type: 'user', id: target.userId }, {}, tx)
    await sendInvite(target.email, tempPassword)
  })
  return ok({ id: encodeId(PREFIX.user, target.userId), status: 'invited' })
}
