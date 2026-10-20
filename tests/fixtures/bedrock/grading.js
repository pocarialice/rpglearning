export const gradingJson = {
  accuracy: 40, coverage: 20, concreteness: 12, score: 72,
  modelAnswer: 'DNSは名前とIPアドレスを対応付ける仕組みです。', missingPoints: ['キャッシュ'], comment: 'よく書けてるね！'
}
export const gradingText = JSON.stringify(gradingJson)
export const gradingWithProse = `採点結果です。\n${gradingText}\n以上です。`
export const gradingInCodeBlock = '```json\n' + gradingText + '\n```'
export const gradingBroken = '{"accuracy":40, "coverage":'
export const extractionJson = {
  questions: [{ body: '問1', choices: ['ア', 'イ', 'ウ', 'エ'], correct: 2, explanation: '解説', keywords: ['DNS'] }]
}
export function converseOutput(text, usage = { inputTokens: 1500, outputTokens: 300 }) {
  return { output: { message: { role: 'assistant', content: [{ text }] } }, usage, stopReason: 'end_turn' }
}
