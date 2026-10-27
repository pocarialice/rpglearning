// QuestCard：デイリークエスト1件
import { escapeHtml, cx, pct } from './_util.js'
export function questCard({ title, reward = 0, current = 0, target = 1, done }) {
  const isDone = done ?? current >= target
  const track = isDone ? '' : `<div class="gd-track"><div class="gd-fill" style="width:${pct(current, target)}%"></div></div>`
  return `<div class="${cx('gd-card', 'gd-quest', isDone && 'gd-quest-done')}"><div class="gd-quest-body">
<p class="gd-quest-title">${escapeHtml(title)}</p>
<div class="gd-quest-meta"><span class="gd-quest-reward">報酬 ${escapeHtml(reward)} EXP</span><span>${isDone ? '達成済み' : `${escapeHtml(current)} / ${escapeHtml(target)}`}</span></div>
${track}</div>${isDone ? '<span class="gd-stamp">達成</span>' : ''}</div>`
}
