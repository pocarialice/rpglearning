// EXPバーのアニメーション用に、獲得前の位置から獲得後の位置までの道のりをレベルごとの区間に分ける
// 必要EXPの式はサーバー（functions/shared/domain/exp.js の requiredExp）と同じにする
export function requiredExp(lv) {
  return Math.ceil(Math.round(100 * lv ** 1.2 * 1e6) / 1e6)
}
// exp：A-08／A-10 の exp（level・expInLevel・next・gained・questExp）
// 戻り値：[{ level, from, to, next }] を古い順に。増えていなければ空
export function expSegments(exp) {
  if (!exp) return []
  let rest = Math.max(0, Number(exp.gained ?? 0) + Number(exp.questExp ?? 0))
  let level = Number(exp.level)
  let to = Number(exp.expInLevel ?? 0)
  let next = Number(exp.next)
  const segments = []
  while (rest > 0 && level >= 1) {
    const from = Math.max(0, to - rest)
    if (to > from) segments.unshift({ level, from, to, next })
    rest -= to - from
    if (rest <= 0 || level <= 1) break
    level -= 1
    next = requiredExp(level)
    to = next
  }
  // ちょうど次のレベルの 0 で止まったときも、最後は今のレベルで終える
  const lv = Number(exp.level)
  if (segments.length && segments[segments.length - 1].level !== lv) segments.push({ level: lv, from: 0, to: 0, next: Number(exp.next) })
  return segments
}
