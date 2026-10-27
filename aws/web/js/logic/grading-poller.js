// 採点結果の確認（詳細設計書 6.1）。A-10 を2秒ごとに呼び、30秒または 504 で GRADING_TIMEOUT
import { ApiError } from '../core/api.js'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
export async function pollGrading(id, { apiGet, intervalMs = 2000, limitMs = 30000 }) {
  const started = Date.now()
  for (;;) {
    try {
      const res = await apiGet(`/gradings/${id}`)
      if (res.status !== 'processing') return res
    } catch (err) {
      if (err?.code === 'GRADING_TIMEOUT' || err?.status === 504) throw new ApiError('GRADING_TIMEOUT', 504)
      if (err?.code !== 'NETWORK') throw err // 一時的な通信エラーだけは続ける
    }
    if (Date.now() - started + intervalMs >= limitMs) throw new ApiError('GRADING_TIMEOUT', 504)
    await sleep(intervalMs)
  }
}
