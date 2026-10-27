import { describe, it, expect, vi, beforeEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
vi.mock('../../../functions/shared/db/migrate.js', () => ({ migrate: vi.fn(async () => ['V003']) }))
vi.mock('../../../server/worker.mjs', () => ({ startWorker: vi.fn(() => ({ stop: vi.fn(async () => {}) })) }))
import { migrate } from '../../../functions/shared/db/migrate.js'
import { startWorker } from '../../../server/worker.mjs'
import { checkEnv, start, COMMON_ENV } from '../../../server/main.mjs'
import { memoryLogger } from '../../helpers/logger.js'
const full = () => ({ ...process.env, PORT: '0' })
beforeEach(() => {
  migrate.mockClear()
  startWorker.mockClear()
})
describe('M-S03 server/main（コンテナの入口）', () => {
  it('MT-S03-01 役割ごとに要る環境変数', () => {
    expect(checkEnv('api', full())).toEqual(['api'])
    expect(checkEnv('worker', full())).toEqual(['worker'])
    expect(checkEnv('all', full())).toEqual(['api', 'worker'])
    expect(() => checkEnv('batch', full())).toThrow('ROLE は api・worker・all のどれか')
    const env = full()
    delete env.DATABASE_URL
    delete env.AUTH_SECRET
    expect(() => checkEnv('api', env)).toThrow('環境変数がありません: DATABASE_URL, AUTH_SECRET')
    expect(() => checkEnv('worker', { ...full(), AUTH_SECRET: '' })).not.toThrow()
    expect(() => checkEnv('api', { ...full(), AUTH_SECRET: 'short' })).toThrow('AUTH_SECRET は32文字以上')
    expect(COMMON_ENV).toContain('S3_ENDPOINT')
  })
  it('MT-S03-02 AI の切り替えに要る設定', () => {
    expect(() => checkEnv('api', { ...full(), AI_PROVIDER: 'sakura', AI_API_KEY: '' })).toThrow('AI_API_KEY')
    expect(() => checkEnv('api', { ...full(), AI_PROVIDER: 'bedrock', AI_API_KEY: '' })).not.toThrow()
    expect(() => checkEnv('api', { ...full(), AI_PROVIDER: '', AI_API_KEY: 'k' })).not.toThrow()
    expect(() => checkEnv('api', { ...full(), AI_PROVIDER: 'openai' })).toThrow('AI_PROVIDER は sakura・bedrock')
  })
  it('MT-S03-03 api と worker を起動して止める（マイグレーションつき）', async () => {
    const log = memoryLogger()
    const stop = await start({ env: { ...full(), ROLE: 'all', MIGRATE_ON_START: 'true', RELEASE_NO: 'r1', WEB_ROOT: resolve('web') }, log })
    expect(migrate).toHaveBeenCalledWith(expect.objectContaining({ release: 'r1', dir: resolve('db/migrations') }))
    expect(log.lines.find((l) => l.msg === 'migrate.done').applied).toEqual(['V003'])
    expect(log.lines.find((l) => l.msg === 'http.listen')).toMatchObject({ release: 'r1' })
    expect(startWorker).toHaveBeenCalledWith({ gradingConcurrency: 2, importConcurrency: 1 })
    await stop()
  })
  it('MT-S03-04 worker だけ・マイグレーションなし', async () => {
    const log = memoryLogger()
    const stop = await start({ env: { ...full(), ROLE: 'worker', WORKER_GRADING_CONCURRENCY: '3', WORKER_IMPORT_CONCURRENCY: '2' }, log })
    expect(migrate).not.toHaveBeenCalled()
    expect(startWorker).toHaveBeenCalledWith({ gradingConcurrency: 3, importConcurrency: 2 })
    expect(log.lines.some((l) => l.msg === 'http.listen')).toBe(false)
    await stop()
  })
  it('MT-S03-05 node server/main.mjs で起動して、設定が足りなければ止まる', () => {
    const r = spawnSync(process.execPath, [resolve('server/main.mjs')], { env: { PATH: process.env.PATH, ROLE: 'api' }, encoding: 'utf8', timeout: 20000 })
    expect(r.status).toBe(1)
    expect(r.stdout).toContain('server.start_failed')
    expect(r.stdout).toContain('環境変数がありません')
  })
})
