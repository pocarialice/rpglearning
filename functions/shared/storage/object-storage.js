// オブジェクトストレージ（さくらのクラウド。S3 互換 API）の読み書き（詳細設計書 3.9 M-S01）
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
export const UPLOAD_URL_SECONDS = 900
let client
export function storageClient() {
  client ??= new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || 'jp-north-1',
    forcePathStyle: true,
    credentials: process.env.S3_ACCESS_KEY_ID
      ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
      : undefined
  })
  return client
}
export async function putObject(bucket, key, body, contentType) {
  await storageClient().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }))
}
export async function getBytes(bucket, key) {
  const res = await storageClient().send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  return new Uint8Array(await res.Body.transformToByteArray())
}
// ないときは null
export async function getText(bucket, key) {
  try {
    const res = await storageClient().send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    return await res.Body.transformToString()
  } catch (err) {
    if (err?.name === 'NoSuchKey') return null
    throw err
  }
}
// 画面へそのまま流す用（キャラクター画像の配信）。ないときは null
export async function getStream(bucket, key) {
  try {
    const res = await storageClient().send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    return { body: res.Body, contentType: res.ContentType, contentLength: res.ContentLength }
  } catch (err) {
    if (err?.name === 'NoSuchKey') return null
    throw err
  }
}
export async function deleteObject(bucket, key) {
  await storageClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}
// 署名付きURL（PUT、15分、Content-Type 固定）。content-type を署名に含め、違う種類のファイルを置けないようにする
export function presignPut(bucket, key, contentType) {
  return getSignedUrl(storageClient(), new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }), {
    expiresIn: UPLOAD_URL_SECONDS, signableHeaders: new Set(['content-type'])
  })
}
