// 出力JSONの取り出しと形の検証（詳細設計書 3.6 M-A02）
const PAIRS = { '{': '}', '[': ']' }
// 最初の { または [ から対応する閉じ括弧までを取り出す。文字列の中の括弧は数えない
export function extractJson(text) {
  if (typeof text !== 'string') return null
  for (let start = 0; start < text.length; start++) {
    if (!PAIRS[text[start]]) continue
    const end = findClose(text, start)
    if (end < 0) continue
    try {
      return JSON.parse(text.slice(start, end + 1))
    } catch {
      // 次の候補を探す
    }
  }
  return null
}
function findClose(text, start) {
  const stack = []
  let inString = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (ch === '\\') i++
      else if (ch === '"') inString = false
    } else if (ch === '"') {
      inString = true
    } else if (PAIRS[ch]) {
      stack.push(PAIRS[ch])
    } else if (ch === '}' || ch === ']') {
      if (stack.pop() !== ch) return -1
      if (stack.length === 0) return i
    }
  }
  return -1
}
// schema = { key: { type: 'int'|'string'|'array'|'nullableInt', min, max, required, items } }
export function validateShape(obj, schema) {
  const errors = []
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: [{ key: '(root)', reason: 'object' }] }
  for (const [key, rule] of Object.entries(schema)) {
    const v = obj[key]
    if (v === undefined || v === null) {
      if (rule.required !== false) errors.push({ key, reason: 'required' })
      continue
    }
    const reason = check(v, rule)
    if (reason) errors.push({ key, reason })
  }
  return { ok: errors.length === 0, errors }
}
function check(v, rule) {
  if (rule.type === 'int') {
    if (!Number.isInteger(v)) return 'type'
    if (v < rule.min || v > rule.max) return 'range'
    return null
  }
  if (rule.type === 'string') {
    if (typeof v !== 'string') return 'type'
    const len = [...v].length
    if (len < rule.min || len > rule.max) return 'length'
    return null
  }
  // array
  if (!Array.isArray(v)) return 'type'
  if (v.length < rule.min || v.length > rule.max) return 'length'
  if (rule.items && !v.every((x) => check(x, rule.items) === null)) return 'items'
  return null
}
// 採点結果の形（詳細設計書 7.3）
export const GRADING_SCHEMA = {
  accuracy: { type: 'int', min: 0, max: 50 },
  coverage: { type: 'int', min: 0, max: 30 },
  concreteness: { type: 'int', min: 0, max: 20 },
  modelAnswer: { type: 'string', min: 1, max: 500 }, // 指示は空白・改行を除いて400文字まで。小見出しの改行の分だけ余裕を持たせる
  missingPoints: { type: 'array', min: 0, max: 3, items: { type: 'string', min: 1, max: 200 } },
  comment: { type: 'string', min: 1, max: 300 }
}
// 抽出結果の形（詳細設計書 7.4）。中身の正規化は extractor が行う
export const EXTRACTION_SCHEMA = {
  questions: { type: 'array', min: 0, max: 200 }
}
