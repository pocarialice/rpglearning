import { describe, it, expect } from 'vitest'
import { requireEnv } from '../../../../../functions/shared/util/env.js'
describe('M-U08 env', () => {
  it('MT-U08-01 環境変数の読み取り', () => {
    expect(requireEnv(['DB_NAME'])).toEqual({ DB_NAME: 'rpg' })
    expect(() => requireEnv(['DB_NAME', 'NO_SUCH_VAR_X'])).toThrow('環境変数がありません: NO_SUCH_VAR_X')
  })
})
