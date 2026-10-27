// A-00 ヘルスチェック（AppRun・コンテナのヘルスチェックと、配置後の確認に使う。認証なし）
import { query } from '../../shared/db/client.js'
import { ok } from '../../shared/util/http.js'
export async function get() {
  await query('SELECT 1 AS ok')
  return ok({ status: 'ok' })
}
