import { describe, it, expect, beforeEach } from 'vitest'
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { storageClient, putObject, getBytes, getText, getStream, deleteObject, presignPut, UPLOAD_URL_SECONDS } from '../../../../../functions/shared/storage/object-storage.js'
import { s3Mock, awsError } from '../../../../helpers/mocks.js'
const s3 = s3Mock()
const obj = (text, extra = {}) => ({ Body: { transformToString: async () => text, transformToByteArray: async () => new TextEncoder().encode(text) }, ...extra })
beforeEach(() => s3.reset())
describe('M-O01 storage/object-storage（さくらのオブジェクトストレージ）', () => {
  it('MT-O01-01 接続先（S3互換・パス形式）', async () => {
    const c = storageClient()
    expect(c).toBe(storageClient())
    expect(c.config.forcePathStyle).toBe(true)
    expect(await c.config.region()).toBe('jp-north-1')
    expect((await c.config.endpoint()).hostname).toBe('s3.test.example')
    expect(await c.config.credentials()).toMatchObject({ accessKeyId: 'test-key', secretAccessKey: 'test-secret' })
  })
  it('MT-O01-02 置く・読む・消す', async () => {
    s3.on(GetObjectCommand).resolves(obj('中身'))
    await putObject('b', 'k', 'x', 'text/plain')
    expect(s3.commandCalls(PutObjectCommand)[0].args[0].input).toEqual({ Bucket: 'b', Key: 'k', Body: 'x', ContentType: 'text/plain' })
    expect(new TextDecoder().decode(await getBytes('b', 'k'))).toBe('中身')
    expect(await getText('b', 'k')).toBe('中身')
    await deleteObject('b', 'k')
    expect(s3.commandCalls(DeleteObjectCommand)[0].args[0].input).toEqual({ Bucket: 'b', Key: 'k' })
  })
  it('MT-O01-03 ないときは null、ほかのエラーは投げる', async () => {
    s3.on(GetObjectCommand).rejects(awsError('NoSuchKey'))
    expect(await getText('b', 'k')).toBeNull()
    expect(await getStream('b', 'k')).toBeNull()
    s3.on(GetObjectCommand).rejects(awsError('AccessDenied'))
    await expect(getText('b', 'k')).rejects.toMatchObject({ name: 'AccessDenied' })
    await expect(getStream('b', 'k')).rejects.toMatchObject({ name: 'AccessDenied' })
  })
  it('MT-O01-04 画像を流す', async () => {
    s3.on(GetObjectCommand).resolves(obj('png', { ContentType: 'image/png', ContentLength: 3 }))
    expect(await getStream('b', 'partners/a.png')).toMatchObject({ contentType: 'image/png', contentLength: 3 })
  })
  it('MT-O01-05 署名付きURL（PUT・15分・Content-Type を署名に含める）', async () => {
    const url = new URL(await presignPut('rpg-test-import', 'uploads/1/a.pdf', 'application/pdf'))
    expect(url.origin).toBe('https://s3.test.example')
    expect(url.pathname).toBe('/rpg-test-import/uploads/1/a.pdf')
    expect(url.searchParams.get('X-Amz-Expires')).toBe(String(UPLOAD_URL_SECONDS))
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type')
  })
})
