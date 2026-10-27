// S-08 プロフィール：レベル → 学習記録 → バッジ → メニュー（外部設計書 3.7、詳細設計書 6.2）
// #/profile?edit=nickname で開くとニックネームの編集ダイアログを開く（S-03 の M-08 からの案内）
import { getContext } from '../../core/context.js'
import { expBar } from '../../components/exp-bar.js'
import { guildBadge } from '../../components/guild-badge.js'
import { button } from '../../components/button.js'
import { openDialog } from '../../components/dialog.js'
import { loading, errorBand, errorMessage } from '../../components/status.js'
import { escapeHtml, formatDate, formatExp, formatPct } from '../../logic/format.js'
import { mountNicknameStep } from '../../parts/nickname-step.js'
export const M_PROFILE_ERROR = 'プロフィールを読み込めませんでした。もう一度お試しください'
const MENU = [
  ['/courses', 'コースを選び直す'],
  ['/partner', 'AIパートナーを選び直す'],
  ['/settings/notify', '通知設定']
]
function statTile(label, value) {
  return `<div class="app-stat"><span class="meta">${label}</span><span class="numeral">${value}</span></div>`
}
function badgeItem(b) {
  const earned = !!b.earnedAt
  const badge = guildBadge({ category: b.category, tier: b.tier, title: b.name, date: earned ? formatDate(b.earnedAt) : '', locked: !earned })
  return `<li class="app-badge-item">${badge}${earned ? '' : `<p class="caption app-badge-cond">${escapeHtml(b.condition)}</p>`}</li>`
}
export async function render(root, params = {}) {
  const { api, getState, setState, go, config, auth } = getContext()
  root.innerHTML = loading()
  let stats, badges
  try {
    ;[stats, { badges }] = await Promise.all([api.apiGet('/me/stats'), api.apiGet('/me/badges')])
  } catch (err) {
    root.innerHTML = `${errorBand(errorMessage(err, M_PROFILE_ERROR))}${button({ label: 'もう一度読み込む', block: true, attrs: 'data-action="reload"' })}`
    root.querySelector('[data-action="reload"]').addEventListener('click', () => render(root, params))
    return
  }
  const nickname = getState().user?.nickname ?? ''
  const release = config?.release ? `<p class="caption app-release">リリース ${escapeHtml(config.release)}</p>` : ''
  root.innerHTML = `<h1 class="display">プロフィール</h1>
<section class="gd-card app-section" aria-label="レベル">
<div class="app-profile-name"><p class="title app-nickname">${escapeHtml(nickname)}</p>${button({ label: 'ニックネームを変える', variant: 'quiet', size: 'sm', attrs: 'data-action="edit-nickname"' })}</div>
${expBar({ level: stats.level, exp: stats.expInLevel, next: stats.next, title: `累計 ${formatExp(stats.totalExp)} EXP` })}</section>
<section class="gd-card app-section" aria-labelledby="stats-h"><h2 id="stats-h" class="title">学習記録</h2>
<div class="app-stats">${statTile('網羅率', formatPct(stats.coveragePct))}${statTile('正答率', formatPct(stats.correctPct))}${statTile('連続学習', `${Number(stats.streakDays)}<small class="meta"> 日</small>`)}${statTile('習得済み', `${Number(stats.mastered)}<small class="meta"> 問</small>`)}</div></section>
<section class="app-section" aria-labelledby="badges-h"><h2 id="badges-h" class="title">バッジ</h2>
<ul class="gd-card app-badge-list">${badges.map(badgeItem).join('')}</ul></section>
<nav class="gd-card app-section app-menu" aria-label="プロフィールのメニュー">${MENU.map(([path, label]) => button({ label, variant: 'quiet', block: true, attrs: `data-go="${path}"` })).join('')}
${button({ label: 'ログアウトする', variant: 'quiet', block: true, attrs: 'data-action="logout"' })}</nav>${release}`
  root.querySelector('.app-menu').addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]')
    if (b) go(b.dataset.go)
  })
  root.querySelector('[data-action="logout"]').addEventListener('click', () => auth.logout())
  const nameEl = root.querySelector('.app-nickname')
  const editNickname = () => openDialog({
    title: 'ニックネームを変える',
    mount: (body, close) => {
      mountNicknameStep(body, {
        api, value: getState().user?.nickname ?? '', framed: false, submitLabel: 'この名前に変える',
        extra: button({ label: 'やめる', variant: 'quiet', block: true, attrs: 'data-action="cancel"' }),
        onDone: (next) => {
          setState({ user: { ...getState().user, nickname: next } })
          nameEl.textContent = next
          close()
        }
      })
      body.querySelector('[data-action="cancel"]').addEventListener('click', close)
    }
  })
  root.querySelector('[data-action="edit-nickname"]').addEventListener('click', editNickname)
  if (params.edit === 'nickname') editNickname()
}
