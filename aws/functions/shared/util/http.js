// 応答の組み立てと本文の読み取り（詳細設計書 3.1 M-U06）
import { AppError } from './errors.js'
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
export function ok(body, status = 200) {
  return { statusCode: status, headers: { ...JSON_HEADERS }, body: JSON.stringify(body ?? {}) }
}
export function noContent() {
  return { statusCode: 204, headers: { 'Cache-Control': 'no-store' }, body: '' }
}
export function csv(text, filename) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store'
    },
    body: text
  }
}
export function parseBody(event) {
  const raw = event?.body
  if (raw === undefined || raw === null || raw === '') return {}
  const text = event.isBase64Encoded ? Buffer.from(raw, 'base64').toString('utf8') : raw
  try {
    return JSON.parse(text)
  } catch {
    throw new AppError('VALIDATION_ERROR', '本文がJSONとして読めません', { details: [{ field: 'body' }] })
  }
}
