// ChoiceOption：四肢択一の選択肢1つ。state は idle・selected・correct・wrong・dim
import { escapeHtml, cx } from './_util.js'
export const CHOICE_KEYS = ['ア', 'イ', 'ウ', 'エ']
const MARK = { correct: '○ 正解', wrong: '× 不正解' }
export function choiceOption({ no, body, state = 'idle' }) {
  const locked = state === 'correct' || state === 'wrong' || state === 'dim'
  const mark = MARK[state] ? `<span class="gd-choice-mark">${MARK[state]}</span>` : ''
  return `<button type="button" class="${cx('gd-choice', state !== 'idle' && `gd-choice-${state}`)}" data-choice="${escapeHtml(no)}" aria-pressed="${state === 'selected'}"${locked ? ' disabled' : ''}>
<span class="gd-choice-key">${CHOICE_KEYS[no - 1] ?? escapeHtml(no)}</span><span class="gd-choice-text">${escapeHtml(body)}</span>${mark}</button>`
}
