// 画面モジュールが使う共通の道具（api・画面移動・状態）。main.js が起動時に設定し、テストでは差し替える
let current = null
export function setContext(ctx) {
  current = ctx
}
export function getContext() {
  if (!current) throw new Error('context が設定されていません')
  return current
}
