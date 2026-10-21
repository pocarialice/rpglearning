// PDFを10ページずつに分ける（詳細設計書 4.4。pdf-lib を使う）
import { PDFDocument } from 'pdf-lib'
export const CHUNK_PAGES = 10
export const PAGE_LIMIT = 50
// 再試行しても結果が変わらない失敗（ページ上限超え・PDFとして読めない）
export class PermanentImportError extends Error {
  constructor(message) {
    super(message)
    this.name = 'PermanentImportError'
  }
}
export async function splitPdf(bytes, { chunkPages = CHUNK_PAGES, pageLimit = PAGE_LIMIT } = {}) {
  let src
  try {
    src = await PDFDocument.load(bytes, { ignoreEncryption: false })
  } catch {
    throw new PermanentImportError('PDFとして読めませんでした。ファイルを確認してください')
  }
  const total = src.getPageCount()
  if (total > pageLimit) throw new PermanentImportError(`${pageLimit}ページ以内に分けて取り込んでください`)
  const chunks = []
  for (let start = 0; start < total; start += chunkPages) {
    const end = Math.min(start + chunkPages, total)
    const out = await PDFDocument.create()
    const pages = await out.copyPages(src, Array.from({ length: end - start }, (_, i) => start + i))
    for (const p of pages) out.addPage(p)
    chunks.push({ name: `p${start + 1}-${end}`, pages: end - start, bytes: await out.save() })
  }
  return chunks
}
