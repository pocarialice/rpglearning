// dev 環境の設定（詳細設計書 6.3）。値は構築手順書の V-08・V-09。release は build-web.mjs がリリース番号に置き換える
export const CONFIG = {
  env: 'dev',
  apiBase: '/api',
  cognitoDomain: 'https://rpg-dev-rpgstudy.auth.ap-northeast-1.amazoncognito.com',
  clientId: '3cs1ket1i6u3mfhna1afnu97k0',
  redirectUri: 'https://dpeitrg9c5wmy.cloudfront.net/',
  release: '__RELEASE__'
}
