// A-30〜A-37 ログインとアカウント作成（詳細設計書 5.4）。Cognito の代わりにアプリでパスワードとトークンを扱う。認証なしで呼べる
import { randomUUID } from 'node:crypto'
import { AppError } from '../../shared/util/errors.js'
import { ok, noContent } from '../../shared/util/http.js'
import { hashPassword, verifyPassword, passwordProblems } from '../../shared/auth/password.js'
import { signToken, verifyToken, newOpaqueToken, sha256, ACCESS_TTL_SECONDS } from '../../shared/auth/token.js'
import * as auth from '../../shared/db/repositories/auth.js'
import * as users from '../../shared/db/repositories/users.js'
import * as audit from '../../shared/db/repositories/audit.js'
import { withTx } from '../../shared/db/tx.js'
import { sendMail } from '../../shared/mail/smtp.js'
import { resetMail, signupMail, signupExistsMail } from '../../shared/mail/templates.js'
export const REFRESH_DAYS = 7
export const CHALLENGE_SECONDS = 10 * 60
export const RESET_MINUTES = 60
export const RESET_INTERVAL_SECONDS = 60
export const SIGNUP_HOURS = 24
export const SIGNUP_INTERVAL_SECONDS = 60
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// 存在しない利用者でも時間をかけて、メールアドレスの有無を応答時間から分からなくする
const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
const str = (v) => (typeof v === 'string' ? v : '')
function assertPassword(password, field = 'newPassword') {
  const problems = passwordProblems(password)
  if (problems.length) throw new AppError('VALIDATION_ERROR', 'パスワードは8文字以上で、数字・大文字・小文字を入れてください', { details: problems.map((code) => ({ field, code })) })
}
// アクセストークンとリフレッシュトークンを出す
async function issue(user, now) {
  const refreshToken = newOpaqueToken()
  await auth.saveRefreshToken(sha256(refreshToken), user.userId, REFRESH_DAYS)
  return {
    idToken: signToken({ sub: user.authSub, groups: user.roles ?? [] }, { now }),
    refreshToken, expiresIn: ACCESS_TTL_SECONDS
  }
}
// A-30 ログイン。仮パスワードのときは新しいパスワードの設定を求める（challenge）
export async function login(ctx) {
  const b = ctx.body()
  const email = str(b.email).trim()
  const password = str(b.password)
  const user = email ? await auth.findByEmail(email) : null
  const matched = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH)
  if (!user || !user.passwordHash || user.status === 'deleted') throw new AppError('LOGIN_FAILED')
  if (user.locked) throw new AppError('ACCOUNT_LOCKED')
  if (!matched) {
    await auth.recordFailure(user.userId)
    ctx.log.info({ msg: 'auth.login_failed', userId: user.userId })
    throw new AppError('LOGIN_FAILED')
  }
  await auth.recordSuccess(user.userId)
  if (user.mustChangePassword) {
    if (await auth.tempPasswordExpired(user.userId)) throw new AppError('PASSWORD_EXPIRED')
    const session = signToken({ sub: user.authSub, uid: user.userId, purpose: 'new_password' }, { ttlSeconds: CHALLENGE_SECONDS, now: ctx.now })
    return ok({ challenge: 'NEW_PASSWORD_REQUIRED', session })
  }
  ctx.log.info({ msg: 'auth.login', userId: user.userId })
  return ok(await issue(user, ctx.now))
}
// A-31 初回ログイン時の新しいパスワード
export async function newPassword(ctx) {
  const b = ctx.body()
  const claims = verifyToken(b.session, { purpose: 'new_password', now: ctx.now })
  if (!claims) throw new AppError('UNAUTHORIZED', '時間が経ちすぎました。もう一度ログインしてください')
  assertPassword(b.newPassword)
  const user = await auth.findById(claims.uid)
  if (!user || user.authSub !== claims.sub || user.status === 'deleted' || !user.mustChangePassword) throw new AppError('UNAUTHORIZED')
  await auth.setPassword(user.userId, await hashPassword(b.newPassword), { mustChange: false })
  ctx.log.info({ msg: 'auth.password_set', userId: user.userId })
  return ok(await issue(user, ctx.now))
}
// A-32 トークンの更新（リフレッシュトークンは1回で使い捨て、新しいものを返す）
export async function refresh(ctx) {
  const token = str(ctx.body().refreshToken)
  const userId = token ? await auth.consumeRefreshToken(sha256(token)) : null
  const user = userId ? await auth.findById(userId) : null
  if (!user || user.status === 'deleted' || user.mustChangePassword) throw new AppError('UNAUTHORIZED')
  return ok(await issue(user, ctx.now))
}
// A-33 ログアウト
export async function logout(ctx) {
  const token = str(ctx.body().refreshToken)
  if (token) await auth.revokeRefreshToken(sha256(token))
  return noContent()
}
// A-34 パスワードを忘れたとき。登録の有無に関わらず同じ応答を返す
export async function forgot(ctx) {
  const email = str(ctx.body().email).trim()
  const user = email ? await auth.findByEmail(email) : null
  if (user && user.status !== 'deleted' && user.passwordHash && !(await auth.recentResetExists(user.userId, RESET_INTERVAL_SECONDS))) {
    const token = newOpaqueToken()
    await auth.saveReset(sha256(token), user.userId, RESET_MINUTES)
    try {
      await sendMail(resetMail({ email: user.email, token, validMinutes: RESET_MINUTES }))
      ctx.log.info({ msg: 'auth.reset_sent', userId: user.userId })
    } catch (err) {
      ctx.log.warn({ msg: 'auth.reset_mail_failed', userId: user.userId, errorName: err?.name })
    }
  }
  return ok({ status: 'accepted' }, 202)
}
// A-35 再設定リンクからの新しいパスワード。ほかの端末のログインも切る
export async function reset(ctx) {
  const b = ctx.body()
  assertPassword(b.newPassword)
  const token = str(b.token)
  const userId = token ? await auth.consumeReset(sha256(token)) : null
  const user = userId ? await auth.findById(userId) : null
  if (!user || user.status === 'deleted') throw new AppError('VALIDATION_ERROR', 'リンクの期限が切れているか、すでに使われています', { details: [{ field: 'token', code: 'INVALID' }] })
  await auth.setPassword(user.userId, await hashPassword(b.newPassword), { mustChange: false })
  await auth.revokeAllForUser(user.userId)
  ctx.log.info({ msg: 'auth.password_reset', userId: user.userId })
  return noContent()
}
// A-36 アカウント作成の受付。確認メールを送り、登録の有無に関わらず同じ応答を返す
export async function signup(ctx) {
  const b = ctx.body()
  const email = str(b.email).trim()
  const fullName = str(b.fullName).trim()
  const invalid = (field) => new AppError('VALIDATION_ERROR', undefined, { details: [{ field, code: 'INVALID' }] })
  if (!EMAIL_RE.test(email) || email.length > 254) throw invalid('email')
  if (fullName === '' || [...fullName].length > 50) throw invalid('fullName')
  assertPassword(b.password, 'password')
  const existing = await auth.findByEmail(email)
  // パスワードのハッシュは、存在しない利用者のときも計算して応答時間をそろえる
  const passwordHash = await hashPassword(b.password)
  if (await auth.recentSignupExists(email, SIGNUP_INTERVAL_SECONDS)) return ok({ status: 'accepted' }, 202)
  const token = newOpaqueToken()
  await auth.saveSignup({ tokenHash: sha256(token), email, fullName, passwordHash: existing ? null : passwordHash, hours: SIGNUP_HOURS })
  try {
    await sendMail(existing ? signupExistsMail({ email }) : signupMail({ email, fullName, token, validHours: SIGNUP_HOURS }))
    ctx.log.info({ msg: existing ? 'auth.signup_exists_sent' : 'auth.signup_sent' })
  } catch (err) {
    ctx.log.warn({ msg: 'auth.signup_mail_failed', errorName: err?.name })
  }
  return ok({ status: 'accepted' }, 202)
}
// A-37 確認リンクからの登録。学習者として作り、そのままログインする
export async function signupVerify(ctx) {
  const token = str(ctx.body().token)
  const req = token ? await auth.consumeSignup(sha256(token)) : null
  if (!req) throw new AppError('VALIDATION_ERROR', 'リンクの期限が切れているか、すでに使われています', { details: [{ field: 'token', code: 'INVALID' }] })
  const sub = randomUUID()
  let userId
  try {
    userId = await withTx(async (tx) => {
      const id = await users.create({ sub, email: req.email, fullName: req.fullName, roles: ['learner'] }, tx)
      await auth.setPassword(id, req.passwordHash, { mustChange: false }, tx)
      await audit.write(id, 'user.signup', { type: 'user', id }, { roles: ['learner'] }, tx)
      return id
    })
  } catch (err) {
    if (err?.code === '23505') throw new AppError('CONFLICT', 'このメールアドレスはすでに登録されています。ログイン画面からログインしてください', { details: [{ field: 'email' }] })
    throw err
  }
  ctx.log.info({ msg: 'auth.signup', userId })
  return ok(await issue({ userId, authSub: sub, roles: ['learner'] }, ctx.now), 201)
}
