// 画面と同じ入力チェックを再公開し、ok:false を VALIDATION_ERROR に変換する
import { AppError } from './errors.js'
export * from '../../../web/js/logic/validators.js'
export function assertValid(result) {
  if (result.ok) return
  throw new AppError('VALIDATION_ERROR', undefined, {
    details: [{ field: result.field, code: result.code, params: result.params }]
  })
}
