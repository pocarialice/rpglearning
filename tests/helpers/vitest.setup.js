// 外部へ実際に接続するテストを防ぐ（モジュールテスト仕様書 2.3）
import { beforeEach, vi } from 'vitest'
beforeEach(() => {
  globalThis.fetch = vi.fn(async () => {
    throw new Error('テストからネットワークへ接続しようとしました')
  })
  process.env.APP_ENV = 'prod'
  process.env.DB_CLUSTER_ARN = 'arn:aws:rds:ap-northeast-1:123456789012:cluster:rpg-test-db'
  process.env.DB_SECRET_ARN = 'arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:rpg-test-db'
  process.env.DB_NAME = 'rpg'
  process.env.MAIL_FROM = 'no-reply@app.example.co.jp'
  process.env.APP_URL = 'https://app.example.co.jp'
})
