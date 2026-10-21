// A-19 利用者の一覧・登録・ロール変更、A-20 論理削除・復活（詳細設計書 5.3）
import {
  AdminCreateUserCommand, AdminAddUserToGroupCommand, AdminRemoveUserFromGroupCommand,
  AdminDisableUserCommand, AdminEnableUserCommand
} from '@aws-sdk/client-cognito-identity-provider'
import { AppError } from '../../shared/util/errors.js'
import { ok } from '../../shared/util/http.js'
import { decodeId, encodeId, PREFIX } from '../../shared/util/ids.js'
import { addDays, parseDbTimestamp, toIsoJst } from '../../shared/util/date-jst.js'
import { ROLES } from '../../shared/util/authz.js'
import { withTx } from '../../shared/db/tx.js'
import * as users from '../../shared/db/repositories/users.js'
import * as audit from '../../shared/db/repositories/audit.js'
import { sendMail } from '../../shared/mail/ses.js'
import { deletionMail } from '../../shared/mail/templates.js'
import { cognitoClient } from '../lib/aws.js'
export const DELETE_AFTER_DAYS = 30
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const invalid = (field) => new AppError('VALIDATION_ERROR', undefined, { details: [{ field, code: 'INVALID' }] })
const pool = () => process.env.USER_POOL_ID
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
  // Cognito が先に失敗したらDBに書かない
  let sub
  try {
    const res = await cognitoClient().send(new AdminCreateUserCommand({
      UserPoolId: pool(), Username: email, DesiredDeliveryMediums: ['EMAIL'],
      UserAttributes: [{ Name: 'email', Value: email }, { Name: 'email_verified', Value: 'true' }, { Name: 'name', Value: fullName }]
    }))
    sub = res.User?.Attributes?.find((a) => a.Name === 'sub')?.Value ?? res.User?.Username
  } catch (err) {
    if (err?.name === 'UsernameExistsException') throw new AppError('CONFLICT', 'このメールアドレスはすでに登録されています', { details: [{ field: 'email' }] })
    throw err
  }
  for (const role of roles) {
    await cognitoClient().send(new AdminAddUserToGroupCommand({ UserPoolId: pool(), Username: sub, GroupName: role }))
  }
  const userId = await withTx(async (tx) => {
    const id = await users.create({ sub, email, fullName: fullName.trim(), roles }, tx)
    await audit.write(ctx.user.userId, 'user.create', { type: 'user', id }, { roles }, tx)
    return id
  })
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
  for (const role of added) await cognitoClient().send(new AdminAddUserToGroupCommand({ UserPoolId: pool(), Username: target.cognitoSub, GroupName: role }))
  for (const role of removed) await cognitoClient().send(new AdminRemoveUserFromGroupCommand({ UserPoolId: pool(), Username: target.cognitoSub, GroupName: role }))
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
  })
  await cognitoClient().send(new AdminDisableUserCommand({ UserPoolId: pool(), Username: target.cognitoSub }))
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
  await cognitoClient().send(new AdminEnableUserCommand({ UserPoolId: pool(), Username: target.cognitoSub }))
  return ok({ id: encodeId(PREFIX.user, target.userId), status: 'active' })
}
