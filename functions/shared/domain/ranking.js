// 週間ランキングの順位づけ（詳細設計書 3.5 M-G05）
export function rankRows(rows) {
  const sorted = rows
    .filter((r) => r.weeklyExp > 0)
    .sort((a, b) => b.weeklyExp - a.weeklyExp || a.nickname.localeCompare(b.nickname, 'ja'))
  let rank = 0
  return sorted.map((r, i) => {
    if (i === 0 || r.weeklyExp !== sorted[i - 1].weeklyExp) rank = i + 1
    return { ...r, rank }
  })
}
