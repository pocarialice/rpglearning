// fetch の共通処理（詳細設計書 6.1）。DB起動中の再試行、401 で1回だけトークン更新
export class ApiError extends Error {
  constructor(code, status, { message, details } = {}) {
    super(message ?? code)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    if (details !== undefined) this.details = details
  }
}
export const RESUME_DELAYS_MS = [2000, 4000, 8000]
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
// auth は { getIdToken, refresh, login } を持つ。onResuming(attempt) は M-01 の表示に使う
export function createApi({ auth, base = '/api', fetchFn = (...a) => globalThis.fetch(...a), onResuming = () => {}, onLoginRequired = () => auth.login() } = {}) {
  async function send(method, path, body) {
    const headers = { Authorization: `Bearer ${await auth.getIdToken()}` }
    const init = { method, headers }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
      init.body = JSON.stringify(body)
    }
    try {
      return await fetchFn(`${base}${path}`, init)
    } catch (err) {
      throw new ApiError('NETWORK', 0, { message: err?.message })
    }
  }
  async function readError(res) {
    let data = null
    try {
      data = await res.json()
    } catch {
      // JSONでない応答（リバースプロキシのエラーなど）
    }
    const e = data?.error ?? {}
    return new ApiError(e.code ?? `HTTP_${res.status}`, res.status, { message: e.message, details: e.details })
  }
  async function request(method, path, body, { raw = false } = {}) {
    let refreshed = false
    for (let resume = 0; ; ) {
      const res = await send(method, path, body)
      if (res.ok) {
        if (res.status === 204) return null
        return raw ? res.text() : res.json()
      }
      if (res.status === 401) {
        if (refreshed) {
          onLoginRequired()
          throw new ApiError('UNAUTHORIZED', 401)
        }
        refreshed = true
        try {
          await auth.refresh()
        } catch {
          onLoginRequired()
          throw new ApiError('UNAUTHORIZED', 401)
        }
        continue
      }
      const err = await readError(res)
      if (err.code === 'DB_RESUMING' && resume < RESUME_DELAYS_MS.length) {
        onResuming(resume + 1)
        await sleep(RESUME_DELAYS_MS[resume])
        resume++
        continue
      }
      throw err
    }
  }
  return {
    apiGet: (path, opts) => request('GET', path, undefined, opts),
    apiPost: (path, body) => request('POST', path, body),
    apiPut: (path, body) => request('PUT', path, body),
    apiDelete: (path) => request('DELETE', path)
  }
}
