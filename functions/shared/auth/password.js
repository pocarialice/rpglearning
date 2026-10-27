// パスワードのハッシュと強さの確認（詳細設計書 3.10 M-K01）。scrypt を使い、平文は保存もログ出力もしない
import { scrypt, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
const scryptAsync = promisify(scrypt)
export const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 }
export const MIN_LENGTH = 8
export const MAX_LENGTH = 128
// 形式：scrypt$N$r$p$salt(base64)$hash(base64)
export async function hashPassword(password, { salt = randomBytes(16) } = {}) {
  const { N, r, p, keylen } = SCRYPT
  const hash = await scryptAsync(password, salt, keylen, { N, r, p })
  return ['scrypt', N, r, p, salt.toString('base64'), hash.toString('base64')].join('$')
}
export async function verifyPassword(password, stored) {
  const parts = String(stored ?? '').split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt' || typeof password !== 'string') return false
  const [, N, r, p, salt, hash] = parts
  const expected = Buffer.from(hash, 'base64')
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length, { N: Number(N), r: Number(r), p: Number(p) })
  return timingSafeEqual(actual, expected)
}
// パスワードの決まり（AWS 版の Cognito と同じ）：8文字以上、数字・大文字・小文字を1つ以上（記号は必須にしない）
export function passwordProblems(password) {
  if (typeof password !== 'string') return ['REQUIRED']
  const problems = []
  if ([...password].length < MIN_LENGTH) problems.push('TOO_SHORT')
  if ([...password].length > MAX_LENGTH) problems.push('TOO_LONG')
  if (!/[0-9]/.test(password)) problems.push('NO_DIGIT')
  if (!/[A-Z]/.test(password)) problems.push('NO_UPPER')
  if (!/[a-z]/.test(password)) problems.push('NO_LOWER')
  return problems
}
// 仮パスワード（12文字。見間違えやすい文字を除き、数字・大文字・小文字を必ず含める）
const SETS = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789']
export function generateTempPassword(length = 12) {
  const all = SETS.join('')
  const chars = SETS.map((s) => s[randomInt(s.length)])
  while (chars.length < length) chars.push(all[randomInt(all.length)])
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}
