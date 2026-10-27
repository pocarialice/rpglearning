// GuildBadge：獲得バッジ。コードは「カテゴリ_段階」（例 mastery_bronze）
import { escapeHtml } from './_util.js'
const GLYPH = { mastery: '習', coverage: '網', explain: '説', streak: '継', review: '復' }
export const BADGE_NAME = { mastery: '習得の証', coverage: '網羅の証', explain: '説明の達人', streak: '継続の証', review: '忘却への勝利' }
const TIER_NAME = { bronze: '銅', silver: '銀', gold: '金' }
export function badgeFromCode(code) {
  const [category, tier] = String(code).split('_')
  return { category, tier: TIER_NAME[tier] ? tier : 'bronze', title: `${BADGE_NAME[category] ?? 'バッジ'}（${TIER_NAME[tier] ?? '銅'}）` }
}
export function guildBadge({ category, title, tier = 'bronze', date = '', locked = false }) {
  const t = locked ? 'locked' : tier
  return `<div class="gd-badge"><div class="gd-emblem gd-emblem-${t}" aria-hidden="true">${GLYPH[category] ?? '?'}</div>
<div class="gd-badge-name">${escapeHtml(title)}</div><div class="gd-badge-date">${locked ? '未獲得' : escapeHtml(date)}</div></div>`
}
