// Bedrock での抽出と正規化（詳細設計書 4.4・7.4）
import { AppError } from '../shared/util/errors.js'
import { converse } from '../shared/ai/bedrock.js'
import { extractJson, validateShape, EXTRACTION_SCHEMA } from '../shared/ai/json-guard.js'
import { buildExtractionPrompt } from '../shared/ai/prompts/extraction.js'
export const TEXT_CHUNK_CHARS = 8000
export const MAX_CHOICES = 10
export const MAX_KEYWORDS = 3
// テキストを段落（空行）の切れ目で、max 文字以下のかたまりに分ける。1段落が max を超えるときだけ途中で切る
export function splitText(text, max = TEXT_CHUNK_CHARS) {
  const paragraphs = String(text).split(/\n{2,}/).filter((p) => p.trim() !== '')
  const chunks = []
  let cur = ''
  for (const p of paragraphs) {
    const pieces = []
    for (let i = 0; i < p.length; i += max) pieces.push(p.slice(i, i + max))
    for (const piece of pieces) {
      const next = cur ? `${cur}\n\n${piece}` : piece
      if (next.length <= max) {
        cur = next
      } else {
        chunks.push(cur)
        cur = piece
      }
    }
  }
  if (cur) chunks.push(cur)
  return chunks
}
const clean = (s) => (typeof s === 'string' ? s.trim() : '')
// 抽出した1問を保存できる形にする。問題文が空なら null（保存しない・数えない）
export function normalizeDraft(q) {
  const body = clean(q?.body)
  if (!body) return null
  const choices = (Array.isArray(q.choices) ? q.choices : []).map(clean).filter(Boolean).slice(0, MAX_CHOICES)
  const correctOk = Number.isInteger(q.correct) && q.correct >= 1 && q.correct <= 4 && q.correct <= choices.length
  // キーワードは前後の空白を除き、重複（大文字小文字を区別しない）を除いて先頭から3つ。表記は最初に出たものを残す
  const seen = new Set()
  const keywords = []
  for (const k of Array.isArray(q.keywords) ? q.keywords : []) {
    const v = clean(k)
    if (!v || [...v].length > 50 || seen.has(v.toLowerCase())) continue
    seen.add(v.toLowerCase())
    keywords.push(v)
    if (keywords.length === MAX_KEYWORDS) break
  }
  return {
    body: [...body].slice(0, 4000).join(''),
    choices: choices.map((c) => [...c].slice(0, 1000).join('')),
    correct: correctOk ? q.correct : null,
    explanation: clean(q.explanation),
    keywords,
    status: choices.length === 4 && correctOk ? 'draft' : 'needs_review'
  }
}
export async function extractChunk(chunk, { log }) {
  const prompt = buildExtractionPrompt(chunk)
  const res = await converse({
    modelId: process.env.MODEL_HIGH, system: prompt.system, messages: prompt.messages, maxTokens: 8000, temperature: 0,
    timeoutMs: 120000, purpose: 'extraction', logger: log
  })
  const obj = extractJson(res.text)
  const shape = validateShape(obj, EXTRACTION_SCHEMA)
  if (!shape.ok) throw new AppError('AI_ERROR', '抽出結果の形が崩れていました')
  return obj.questions
}
