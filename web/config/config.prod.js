// prod 環境の設定（詳細設計書 6.3）。値は構築手順書の V-08・V-09。release は build-web.mjs がリリース番号に置き換える
export const CONFIG = {
  env: 'prod',
  apiBase: '/api',
  cognitoDomain: 'https://rpg-prod-xxxx.auth.ap-northeast-1.amazoncognito.com',
  clientId: 'xxxxxxxxxxxxxxxxxxxxxxxxxx',
  redirectUri: 'https://dxxxxxxxxxxxx.cloudfront.net/',
  release: '__RELEASE__'
}
