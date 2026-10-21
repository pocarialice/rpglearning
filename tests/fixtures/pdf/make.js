// テスト用の白紙PDF（pdf-lib で作る）
import { PDFDocument } from 'pdf-lib'
export async function blankPdf(pages) {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) doc.addPage([200, 200])
  return doc.save()
}
