// 環境変数を起動時に読み、足りなければ例外にする（詳細設計書 2.4.6）
export function requireEnv(names) {
  const missing = names.filter((n) => !process.env[n])
  if (missing.length > 0) throw new Error(`環境変数がありません: ${missing.join(', ')}`)
  return Object.fromEntries(names.map((n) => [n, process.env[n]]))
}
