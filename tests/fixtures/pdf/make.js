// テスト用のPDF（pdf-lib で作る）
import { PDFDocument, StandardFonts } from 'pdf-lib'
export async function blankPdf(pages) {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) doc.addPage([200, 200])
  return doc.save()
}
// 1ページに1行ずつ文字を書いたPDF（AI が PDF を読めないときの文字の取り出しの確認用）
export async function textPdf(lines) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const line of lines) doc.addPage([300, 100]).drawText(line, { x: 10, y: 50, size: 12, font })
  return doc.save()
}
