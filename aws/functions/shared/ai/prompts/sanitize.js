// 学習者・資料の文字列をタグに入れる前の無害化
export function escapeTag(text, tag) {
  return String(text ?? '').replaceAll(`</${tag}>`, `<\\/${tag}>`)
}
export function wrap(tag, text) {
  return `<${tag}>${escapeTag(text, tag)}</${tag}>`
}
