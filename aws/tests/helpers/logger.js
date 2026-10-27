// ログを配列にためるテスト用ロガー
export function memoryLogger() {
  const lines = []
  const make = (level) => (fields = {}) => lines.push({ level, ...fields })
  const log = { lines, debug: make('DEBUG'), info: make('INFO'), warn: make('WARN'), error: make('ERROR') }
  log.child = () => log
  return log
}
