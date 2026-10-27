// A-22 キャラクター画像の取得・差し替え・削除
import { DeleteObjectCommand } from '@aws-sdk/client-s3'
import { AppError } from '../../shared/util/errors.js'
import { ok } from '../../shared/util/http.js'
import { PERSONAS } from '../../shared/ai/persona.js'
import * as partners from '../../shared/db/repositories/partners.js'
import * as audit from '../../shared/db/repositories/audit.js'
import { s3Client, presignPut } from '../lib/aws.js'
import { imageUrl } from './me.js'
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024
export const IMAGE_TYPES = { 'image/png': 'png', 'image/webp': 'webp' }
const invalid = (field) => new AppError('VALIDATION_ERROR', undefined, { details: [{ field, code: 'INVALID' }] })
function personaOf(ctx) {
  const persona = ctx.params.persona
  if (!Object.hasOwn(PERSONAS, persona)) throw new AppError('NOT_FOUND', 'パートナーが見つかりません')
  return persona
}
// yyyyMMddHHmmss（JST）
const stamp = (now) => new Date(now.getTime() + 9 * 3600 * 1000).toISOString().replace(/[-:T]/g, '').slice(0, 14)
const deleteImage = (key) => s3Client().send(new DeleteObjectCommand({ Bucket: process.env.ASSETS_BUCKET, Key: key }))
export async function get(ctx) {
  const persona = personaOf(ctx)
  const p = await partners.get(persona)
  // S-14 の一覧に性格名と初期名も出す
  return ok({ persona, label: p?.label ?? PERSONAS[persona].label, defaultName: p?.defaultName ?? PERSONAS[persona].defaultName, imageUrl: imageUrl(p?.imageKey) })
}
export async function put(ctx) {
  const persona = personaOf(ctx)
  const b = ctx.body()
  if (b.action === 'prepare') {
    const ext = IMAGE_TYPES[b.contentType]
    if (!ext) throw invalid('contentType')
    if (!Number.isInteger(b.size) || b.size < 1 || b.size > IMAGE_MAX_BYTES) throw invalid('size')
    const imageKey = `partners/${persona}-${stamp(ctx.now)}.${ext}`
    const uploadUrl = await presignPut(process.env.ASSETS_BUCKET, imageKey, b.contentType)
    return ok({ imageKey, uploadUrl })
  }
  if (b.action === 'commit') {
    const re = new RegExp(`^partners/${persona}-\\d{14}\\.(png|webp)$`)
    if (typeof b.imageKey !== 'string' || !re.test(b.imageKey)) throw invalid('imageKey')
    const old = (await partners.get(persona))?.imageKey ?? null
    await partners.setImage(persona, b.imageKey)
    await audit.write(ctx.user.userId, 'partner.image', { type: 'partner' }, { persona, action: 'commit' })
    if (old && old !== b.imageKey) await deleteImage(old)
    return ok({ persona, imageUrl: imageUrl(b.imageKey) })
  }
  throw invalid('action')
}
export async function remove(ctx) {
  const persona = personaOf(ctx)
  const old = (await partners.get(persona))?.imageKey ?? null
  await partners.setImage(persona, null)
  await audit.write(ctx.user.userId, 'partner.image', { type: 'partner' }, { persona, action: 'delete' })
  if (old) await deleteImage(old)
  return ok({ persona, imageUrl: null })
}
