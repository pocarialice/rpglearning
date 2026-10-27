// AI の差し替え口（詳細設計書 3.6）。AI_PROVIDER=sakura（既定）/ bedrock で呼び出し先を切り替える
import { AppError } from '../util/errors.js'
import * as sakura from './sakura.js'
import * as bedrock from './bedrock.js'
const PROVIDERS = { sakura, bedrock }
export const provider = () => process.env.AI_PROVIDER || 'sakura'
// PDF・画像をそのまま読めるか（読めないときは、取り込みで PDF を文字にしてから渡す）
export const supportsDocuments = () => provider() === 'bedrock'
// 引数と戻り値は bedrock.converse と同じ（{ text, usage, stopReason }）
export function converse(args) {
  const p = PROVIDERS[provider()]
  if (!p) throw new AppError('INTERNAL_ERROR', `AI_PROVIDER が正しくありません: ${provider()}`)
  return p.converse(args)
}
