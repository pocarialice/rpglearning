import { describe, it, expect } from 'vitest'
import { encodeId, decodeId } from '../../../../../functions/shared/util/ids.js'
const VE = { code: 'VALIDATION_ERROR' }
describe('M-U02 ids', () => {
  it('MT-U02-01 変換', () => {
    expect(encodeId('q_', 42)).toBe('q_42')
  })
  it('MT-U02-02 逆変換', () => {
    expect(decodeId('q_', 'q_42')).toBe(42)
  })
  it('MT-U02-03 接頭辞の違い', () => {
    expect(() => decodeId('q_', 'kw_42')).toThrow(expect.objectContaining(VE))
  })
  it('MT-U02-04 下限', () => {
    expect(decodeId('q_', 'q_1')).toBe(1)
    expect(() => decodeId('q_', 'q_0')).toThrow(expect.objectContaining(VE))
  })
  it('MT-U02-05 上限', () => {
    expect(decodeId('q_', 'q_9007199254740991')).toBe(9007199254740991)
    expect(() => decodeId('q_', 'q_9007199254740992')).toThrow(expect.objectContaining(VE))
  })
  it.each(['q_abc', 'q_-1', 'q_1.5', 'q_', 'q_01'])('MT-U02-06 数字以外 %s', (s) => {
    expect(() => decodeId('q_', s)).toThrow(expect.objectContaining(VE))
  })
  it.each([null, 42])('MT-U02-07 文字列以外 %s', (s) => {
    expect(() => decodeId('q_', s)).toThrow(expect.objectContaining(VE))
  })
})
