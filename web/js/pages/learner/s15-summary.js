// S-15 冒険のまとめ：A-07 が冒険を終えたときに返すまとめを表示する。解答数・正解数・説明の平均点・EXP・かかった時間・累計の学習時間
import { getContext } from '../../core/context.js'
import { partnerBubble, partnerName } from '../../components/partner-bubble.js'
import { button } from '../../components/button.js'
import { escapeHtml, formatDuration, formatExp } from '../../logic/format.js'
function tile(label, value, wide = false) {
  return `<div class="app-stat${wide ? ' app-stat-wide' : ''}"><span class="meta">${label}</span><span class="numeral">${value}</span></div>`
}
const unit = (s) => `<small class="meta"> ${s}</small>`
export function cheer(s) {
  if (s.answered > 0 && s.correct === s.answered) return `${Number(s.answered)}問ぜんぶ正解！すごいね`
  return `${Number(s.answered)}問おつかれさま。この調子でいこう`
}
export async function render(root) {
  const { getState, setState, go } = getContext()
  const s = getState().summary
  if (!s) return go('/home')
  const partner = getState().user?.partner
  const explain = s.explainCount > 0 && s.explainAvgScore !== null
    ? tile('説明の平均点', `${Number(s.explainAvgScore)}${unit('点')}`) : ''
  root.innerHTML = `${s.notice ? `<div class="app-notice" role="status">${escapeHtml(s.notice)}</div>` : ''}
<h1 class="display">冒険のまとめ</h1>
${partnerBubble({ name: partnerName(partner), persona: partner?.persona, text: cheer(s), imageUrl: partner?.imageUrl ?? null })}
<section class="gd-card app-section" aria-labelledby="summary-h"><h2 id="summary-h" class="title">今回の冒険</h2>
<div class="app-stats">${tile('正解', `${Number(s.correct)}${unit(`/ ${Number(s.answered)}問`)}`)}${tile('獲得EXP', `+${formatExp(s.expGained)}`)}${explain}
${tile('かかった時間', escapeHtml(formatDuration(s.studySeconds)), !explain)}${tile('累計の学習時間', escapeHtml(formatDuration(s.totalStudySeconds)), true)}</div>
<p class="caption">学習時間は1問あたり10分までで数えます</p></section>
<div class="app-actions">${button({ label: 'ホームへ', variant: 'primary', block: true, attrs: 'data-action="home"' })}</div>`
  root.querySelector('[data-action="home"]').addEventListener('click', () => {
    setState({ summary: null })
    go('/home')
  })
}
