import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DeleteObjectCommand } from '@aws-sdk/client-s3'
vi.mock('../../../../../functions/shared/db/repositories/users.js')
vi.mock('../../../../../functions/shared/db/repositories/courses.js')
vi.mock('../../../../../functions/shared/db/repositories/partners.js')
vi.mock('../../../../../functions/shared/db/repositories/audit.js')
import * as users from '../../../../../functions/shared/db/repositories/users.js'
import * as courses from '../../../../../functions/shared/db/repositories/courses.js'
import * as partners from '../../../../../functions/shared/db/repositories/partners.js'
import * as audit from '../../../../../functions/shared/db/repositories/audit.js'
import { main } from '../../../../../functions/api-handler/index.mjs'
import { httpEvent, parse } from '../../../../fixtures/events/http.js'
import { memoryLogger } from '../../../../helpers/logger.js'
import { s3Mock, dbMock } from '../../../../helpers/mocks.js'
import { NOW } from '../../../../helpers/clock.js'
import { systemAdmin } from '../../../../fixtures/users.js'
const s3 = s3Mock()
const db = dbMock()
const call = (opts) => main(httpEvent({ groups: ['system_admin'], sub: 'sub-1', ...opts }), { log: memoryLogger(), now: NOW })
beforeEach(() => {
  db.reset()
  users.findBySub.mockResolvedValue({ ...systemAdmin })
  users.findById.mockImplementation(async (id) => ({ 2: { userId: 2, roles: ['course_admin', 'learner'], status: 'active' }, 7: { userId: 7, roles: ['learner'], status: 'active' } }[id] ?? null))
  courses.create.mockResolvedValue(5)
  courses.update.mockResolvedValue(true)
})
describe('M-H13 admin-courses（A-21）', () => {
  it('MT-H13-01 コースの登録', async () => {
    const res = await call({ method: 'POST', path: '/api/admin/courses', body: { name: '応用情報', certification: '応用情報技術者試験' } })
    expect(res.statusCode).toBe(201)
    expect(parse(res)).toEqual({ id: 'c_5' })
    expect(courses.create).toHaveBeenCalledWith({ name: '応用情報', certification: '応用情報技術者試験', description: null }, expect.anything())
    expect(audit.write.mock.calls.map((c) => c[1])).toEqual(['course.create'])
  })
  it('MT-H13-02 コース名の長さ', async () => {
    const make = (n) => call({ method: 'POST', path: '/api/admin/courses', body: { name: 'あ'.repeat(n), certification: '試験' } })
    expect((await make(50)).statusCode).toBe(201)
    expect((await make(51)).statusCode).toBe(400)
    expect(courses.create).toHaveBeenCalledTimes(1)
  })
  it('MT-H13-03 担当者の割り当て', async () => {
    const res = await call({ method: 'POST', path: '/api/admin/courses', body: { name: 'NW', certification: 'ネスペ', adminUserIds: ['u_2', 'u_7'] } })
    expect(res.statusCode).toBe(400)
    expect(parse(res).error.details[0].field).toBe('adminUserIds')
    expect(courses.create).not.toHaveBeenCalled()
  })
  it('MT-H13-04 担当者の割り当て（正常）・更新・一覧・入力の検証', async () => {
    expect((await call({ method: 'POST', path: '/api/admin/courses', body: { name: 'NW', certification: 'ネスペ', adminUserIds: ['u_2'] } })).statusCode).toBe(201)
    expect(courses.assignAdmins).toHaveBeenCalledWith(5, [2], expect.anything())
    expect(audit.write.mock.calls.map((c) => c[1])).toEqual(['course.create', 'course.assign'])
    expect((await call({ method: 'PUT', path: '/api/admin/courses/c_3', body: { name: 'NW', certification: 'ネスペ', description: '説明', adminUserIds: ['u_2'] } })).statusCode).toBe(200)
    expect(audit.write.mock.calls.slice(2).map((c) => c[1])).toEqual(['course.update', 'course.assign'])
    expect((await call({ method: 'PUT', path: '/api/admin/courses/c_3', body: { name: 'NW', certification: 'ネスペ' } })).statusCode).toBe(200)
    courses.update.mockResolvedValue(false)
    expect((await call({ method: 'PUT', path: '/api/admin/courses/c_9', body: { name: 'NW', certification: 'ネスペ' } })).statusCode).toBe(404)
    for (const body of [{ name: 'NW' }, { name: 'NW', certification: 'a'.repeat(101) }, { name: 'NW', certification: 'x', description: 1 }, { name: 'NW', certification: 'x', adminUserIds: 'u_2' }, { name: 'NW', certification: 'x', adminUserIds: ['u_99'] }]) {
      expect((await call({ method: 'POST', path: '/api/admin/courses', body })).statusCode).toBe(400)
    }
    courses.listAll.mockResolvedValue([{ courseId: 3, name: 'NW', certification: 'ネスペ', adminUserIds: [2] }])
    expect(parse(await call({ path: '/api/admin/courses' })).courses).toEqual([{ id: 'c_3', name: 'NW', certification: 'ネスペ', description: null, adminUserIds: ['u_2'] }])
  })
})
describe('M-H14 admin-partners（A-22）', () => {
  beforeEach(() => {
    s3.reset()
    s3.on(DeleteObjectCommand).resolves({})
    partners.get.mockResolvedValue({ persona: 'encourage', imageKey: 'partners/encourage-20261001090000.png' })
  })
  const put = (body) => call({ method: 'PUT', path: '/api/admin/partners/encourage/image', body })
  it('MT-H14-01 画像の準備（PNG）', async () => {
    const body = parse(await put({ action: 'prepare', contentType: 'image/png', size: 2097152 }))
    expect(body.imageKey).toBe('partners/encourage-20261020100000.png')
    const url = new URL(body.uploadUrl)
    expect(url.pathname).toBe('/rpg-test-assets/partners/encourage-20261020100000.png')
    expect(url.hostname).toBe('s3.test.example')
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900')
  })
  it('MT-H14-02 画像の準備（範囲外）', async () => {
    expect((await put({ action: 'prepare', contentType: 'image/png', size: 2097153 })).statusCode).toBe(400)
    expect((await put({ action: 'prepare', contentType: 'image/jpeg', size: 1000 })).statusCode).toBe(400)
  })
  it('MT-H14-03 画像の確定', async () => {
    const res = await put({ action: 'commit', imageKey: 'partners/encourage-20261020100000.png' })
    expect(parse(res)).toEqual({ persona: 'encourage', imageUrl: 'https://app.example.co.jp/partners/encourage-20261020100000.png' })
    expect(partners.setImage).toHaveBeenCalledWith('encourage', 'partners/encourage-20261020100000.png')
    expect(s3.commandCalls(DeleteObjectCommand)[0].args[0].input).toEqual({ Bucket: 'rpg-test-assets', Key: 'partners/encourage-20261001090000.png' })
    expect(audit.write.mock.calls[0][1]).toBe('partner.image')
  })
  it('MT-H14-04 画像を外す', async () => {
    const res = await call({ method: 'DELETE', path: '/api/admin/partners/encourage/image' })
    expect(parse(res)).toEqual({ persona: 'encourage', imageUrl: null })
    expect(partners.setImage).toHaveBeenCalledWith('encourage', null)
    expect(s3.commandCalls(DeleteObjectCommand)).toHaveLength(1)
  })
  it('MT-H14-05 取得・WebP・不正なキーや操作・知らない性格・古い画像なし', async () => {
    expect(parse(await call({ path: '/api/admin/partners/encourage/image' })).imageUrl).toBe('https://app.example.co.jp/partners/encourage-20261001090000.png')
    expect(parse(await put({ action: 'prepare', contentType: 'image/webp', size: 10 })).imageKey).toMatch(/\.webp$/)
    expect((await put({ action: 'commit', imageKey: 'partners/rival-20261020100000.png' })).statusCode).toBe(400)
    expect((await put({ action: 'commit', imageKey: '../x' })).statusCode).toBe(400)
    expect((await put({ action: 'other' })).statusCode).toBe(400)
    expect((await call({ method: 'DELETE', path: '/api/admin/partners/cool/image' })).statusCode).toBe(404)
    partners.get.mockResolvedValue(null)
    expect(parse(await call({ path: '/api/admin/partners/logic/image' })).imageUrl).toBeNull()
    await put({ action: 'commit', imageKey: 'partners/encourage-20261020100000.webp' })
    await call({ method: 'DELETE', path: '/api/admin/partners/encourage/image' })
    expect(s3.commandCalls(DeleteObjectCommand)).toHaveLength(0)
  })
  it('MT-H14-06 取得に性格名と初期名を含める', async () => {
    partners.get.mockResolvedValue({ persona: 'rival', label: 'ライバル型', defaultName: 'カイ', imageKey: null })
    expect(parse(await call({ path: '/api/admin/partners/rival/image' }))).toEqual({ persona: 'rival', label: 'ライバル型', defaultName: 'カイ', imageUrl: null })
    partners.get.mockResolvedValue(null)
    expect(parse(await call({ path: '/api/admin/partners/logic/image' }))).toMatchObject({ label: '論理型', defaultName: 'セージ' })
  })
})
