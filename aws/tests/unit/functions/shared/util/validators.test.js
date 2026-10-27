import { describe, it, expect } from 'vitest'
import { assertValid, validateNickname } from '../../../../../functions/shared/util/validators.js'
describe('M-U07 validators（Lambda側の再公開）', () => {
  it('MT-U07-29 ok:false を VALIDATION_ERROR に変換する', () => {
    expect(() => assertValid(validateNickname('たろう'))).not.toThrow()
    expect(() => assertValid(validateNickname('あ'))).toThrow(expect.objectContaining({
      code: 'VALIDATION_ERROR', status: 400, details: [expect.objectContaining({ field: 'nickname' })]
    }))
  })
})
