// マイグレーションを適用する（詳細設計書 8.7・11.6）。使い方：DATABASE_URL=... RELEASE_NO=... node scripts/migrate.mjs
import { resolve } from 'node:path'
import { getPool } from '../functions/shared/db/client.js'
import { migrate } from '../functions/shared/db/migrate.js'
const pool = getPool()
try {
  const applied = await migrate({ pool, dir: resolve(import.meta.dirname, '../db/migrations'), release: process.env.RELEASE_NO ?? null })
  console.log(applied.length ? `適用しました: ${applied.join(', ')}` : '適用するマイグレーションはありません')
} catch (err) {
  console.error(err.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
