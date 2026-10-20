// ハンドラのテストで vi.mock したリポジトリに既定の応答を入れる
import { vi } from 'vitest'
import { learner } from '../fixtures/users.js'
export function asLoaded(user = learner) {
  return { ...user }
}
export function resetAll(...mods) {
  for (const m of mods) for (const fn of Object.values(m)) if (vi.isMockFunction(fn)) fn.mockReset()
}
