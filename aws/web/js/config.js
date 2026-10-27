// 手元で開くときの設定。ビルド時に config/config.{env}.js で上書きする（詳細設計書 6.3）
export const CONFIG = {
  env: 'local',
  apiBase: '/api',
  cognitoDomain: 'https://rpg-dev-xxxx.auth.ap-northeast-1.amazoncognito.com',
  clientId: 'xxxxxxxxxxxxxxxxxxxxxxxxxx',
  redirectUri: 'http://localhost:8080/',
  release: 'local'
}
