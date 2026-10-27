// PDF から文字を取り出す（AI が PDF をそのまま読めないとき。詳細設計書 4.4）。unpdf（pdf.js）を使う
import { extractText, getDocumentProxy } from 'unpdf'
import { PermanentImportError, CHUNK_PAGES, PAGE_LIMIT } from './pdf-splitter.js'
// 10ページずつのかたまりの文字を返す。文字がない（画像だけの）PDFは取り込めない
export async function pdfTextChunks(bytes, { chunkPages = CHUNK_PAGES, pageLimit = PAGE_LIMIT, extract = defaultExtract } = {}) {
  let pages
  try {
    pages = await extract(bytes)
  } catch {
    throw new PermanentImportError('PDFとして読めませんでした。ファイルを確認してください')
  }
  if (pages.length > pageLimit) throw new PermanentImportError(`${pageLimit}ページ以内に分けて取り込んでください`)
  if (pages.every((t) => t.trim() === '')) throw new PermanentImportError('PDFから文字を読み取れませんでした（画像だけのPDFは、いまのAIでは取り込めません）')
  const chunks = []
  for (let start = 0; start < pages.length; start += chunkPages) {
    chunks.push(pages.slice(start, start + chunkPages).join('\n\n'))
  }
  return chunks
}
async function defaultExtract(bytes) {
  const pdf = await getDocumentProxy(new Uint8Array(bytes))
  const { text } = await extractText(pdf, { mergePages: false })
  return text
}
