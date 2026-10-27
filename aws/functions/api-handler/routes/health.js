// A-00 ヘルスチェック（配置時に Lambda を直接呼び出して使う）
import { query } from '../../shared/db/data-api.js'
import { ok } from '../../shared/util/http.js'
export async function get() {
  await query('SELECT 1 AS ok', {}, { resumeRetries: 0 })
  return ok({ status: 'ok' })
}
