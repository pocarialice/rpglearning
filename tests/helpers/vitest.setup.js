// 外部へ実際に接続するテストを防ぐ（モジュールテスト仕様書 2.3）
import { beforeEach, afterEach, vi } from 'vitest'
import { setPool } from '../../functions/shared/db/client.js'
import { setTransport } from '../../functions/shared/mail/smtp.js'
// サーバーの起動時の確認（server/main.mjs）と同じ名前の環境変数を、ファイルの読み込み前に設定しておく
const ENV = {
  APP_ENV: 'prod',
  DATABASE_URL: 'postgres://test:test@127.0.0.1:1/rpg',
  MODEL_HIGH: 'model-high',
  MODEL_LIGHT: 'model-light',
  // 既存の AI のテストは Bedrock のモックで書いている。さくらのAI Engine は ai/sakura.test.js で確かめる
  AI_PROVIDER: 'bedrock',
  AI_BASE_URL: 'https://ai.test/v1',
  AI_API_KEY: 'test-ai-key',
  IMPORT_BUCKET: 'rpg-test-import',
  ASSETS_BUCKET: 'rpg-test-assets',
  NOTIFY_BUCKET: 'rpg-test-notify',
  MAIL_FROM: 'no-reply@app.example.co.jp',
  APP_URL: 'https://app.example.co.jp',
  AUTH_SECRET: 'test-secret-test-secret-test-secret-0123',
  SMTP_HOST: '127.0.0.1',
  // 署名付きURLの計算用（ダミー。送信はしない）
  S3_ENDPOINT: 'https://s3.test.example',
  S3_REGION: 'jp-north-1',
  S3_ACCESS_KEY_ID: 'test-key',
  S3_SECRET_ACCESS_KEY: 'test-secret',
  AWS_REGION: 'ap-northeast-1',
  AWS_ACCESS_KEY_ID: 'AKIATESTTESTTESTTEST',
  AWS_SECRET_ACCESS_KEY: 'test-secret'
}
Object.assign(process.env, ENV)
// DB とメールは、テストで差し替えない限り使えないもの（呼ぶと失敗する）にしておく
const refuse = (what) => async () => { throw new Error(`テストから${what}へ接続しようとしました`) }
const refusingPool = { query: refuse('DB'), connect: refuse('DB'), end: async () => {} }
const refusingTransport = { sendMail: refuse('SMTP') }
beforeEach(() => {
  Object.assign(process.env, ENV)
  delete process.env.ALERT_EMAIL
  delete process.env.MAIL_SCHEDULE_ENABLED
  setPool(refusingPool)
  setTransport(refusingTransport)
  globalThis.fetch = vi.fn(async () => {
    throw new Error('テストからネットワークへ接続しようとしました')
  })
})
afterEach(() => {
  vi.useRealTimers()
})
