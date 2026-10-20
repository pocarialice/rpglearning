// 外部へ実際に接続するテストを防ぐ（モジュールテスト仕様書 2.3）
import { beforeEach, afterEach, vi } from 'vitest'
// 各関数の index.mjs は読み込み時に環境変数を確かめるため、ファイルの読み込み前に設定しておく
const ENV = {
  APP_ENV: 'prod',
  DB_CLUSTER_ARN: 'arn:aws:rds:ap-northeast-1:123456789012:cluster:rpg-test-db',
  DB_SECRET_ARN: 'arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:rpg-test-db',
  DB_NAME: 'rpg',
  MODEL_HIGH: 'model-high',
  MODEL_LIGHT: 'model-light',
  GRADING_FUNCTION: 'rpg-test-grading-worker',
  IMPORT_BUCKET: 'rpg-test-import',
  ASSETS_BUCKET: 'rpg-test-assets',
  NOTIFY_BUCKET: 'rpg-test-notify',
  USER_POOL_ID: 'ap-northeast-1_TEST',
  MAIL_FROM: 'no-reply@app.example.co.jp',
  APP_URL: 'https://app.example.co.jp',
  // 署名付きURLの計算用（ダミー。送信はしない）
  AWS_REGION: 'ap-northeast-1',
  AWS_ACCESS_KEY_ID: 'AKIATESTTESTTESTTEST',
  AWS_SECRET_ACCESS_KEY: 'test-secret'
}
Object.assign(process.env, ENV)
beforeEach(() => {
  Object.assign(process.env, ENV)
  globalThis.fetch = vi.fn(async () => {
    throw new Error('テストからネットワークへ接続しようとしました')
  })
})
afterEach(() => {
  vi.useRealTimers()
})
