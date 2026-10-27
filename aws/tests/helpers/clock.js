// 基準日時（JST 2026-10-20 火 10:00）
import { vi } from 'vitest'
export const NOW = new Date('2026-10-20T01:00:00Z')
export const TODAY = '2026-10-20'
export function useClock(at = NOW) {
  vi.useFakeTimers()
  vi.setSystemTime(at)
}
