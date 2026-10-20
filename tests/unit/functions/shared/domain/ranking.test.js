import { describe, it, expect } from 'vitest'
import { rankRows } from '../../../../../functions/shared/domain/ranking.js'
const rows = (pairs) => pairs.map(([nickname, weeklyExp]) => ({ nickname, weeklyExp }))
const view = (r) => r.map((x) => [x.nickname, x.rank])
describe('M-G05 ranking', () => {
  it('MT-G05-01 同点なし', () => expect(view(rankRows(rows([['C', 100], ['A', 300], ['B', 200]])))).toEqual([['A', 1], ['B', 2], ['C', 3]]))
  it('MT-G05-02 同点は同順位', () => expect(view(rankRows(rows([['A', 100], ['B', 100], ['C', 50]])))).toEqual([['A', 1], ['B', 1], ['C', 3]]))
  it('MT-G05-03 同点の並び順', () => expect(view(rankRows(rows([['さくら', 100], ['あおい', 100]])))).toEqual([['あおい', 1], ['さくら', 1]]))
  it('MT-G05-04 0 EXP は除く', () => expect(view(rankRows(rows([['A', 10], ['B', 0], ['C', -5]])))).toEqual([['A', 1]]))
  it('MT-G05-05 空', () => expect(rankRows([])).toEqual([]))
  it('MT-G05-06 全員同点', () => expect(rankRows(rows([['A', 50], ['B', 50], ['C', 50]])).map((x) => x.rank)).toEqual([1, 1, 1]))
})
