// JSON構造化ログ（詳細設計書 2.4.5）。個人情報のキーは自動で伏せ字にする
import { toIsoJst } from './date-jst.js'
export const REDACT_KEYS = ['text', 'explanationText', 'email', 'fullName', 'idToken', 'authorization', 'password', 'newPassword', 'tempPassword', 'refreshToken', 'session', 'token']
const LEVELS = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40 }
function minLevel() {
  return process.env.APP_ENV === 'dev' ? LEVELS.DEBUG : LEVELS.INFO
}
function sanitize(value, seen = new WeakSet()) {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, code: value.code, stack: value.stack }
  }
  if (Array.isArray(value)) return value.map((v) => sanitize(v, seen))
  if (value && typeof value === 'object') {
    if (seen.has(value)) return '[Circular]'
    seen.add(value)
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = REDACT_KEYS.includes(k) ? '[REDACTED]' : sanitize(v, seen)
    }
    return out
  }
  return value
}
export function createLogger(fn, ctx = {}) {
  const base = { fn, requestId: ctx.requestId ?? null }
  if (ctx.userId !== undefined) base.userId = ctx.userId
  const write = (level) => (fields = {}) => {
    if (LEVELS[level] < minLevel()) return
    const line = { level, ts: toIsoJst(new Date(), { ms: true }), ...base, ...sanitize(fields) }
    console.log(JSON.stringify(line))
  }
  return {
    debug: write('DEBUG'),
    info: write('INFO'),
    warn: write('WARN'),
    error: write('ERROR'),
    child: (extra) => createLogger(fn, { ...ctx, ...extra })
  }
}
