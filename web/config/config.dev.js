// dev 環境の設定（詳細設計書 6.3）。API は画面と同じドメインの /api で受ける。release は build-web.mjs がリリース番号に置き換える
export const CONFIG = {
  env: 'dev',
  apiBase: '/api',
  release: '__RELEASE__'
}
