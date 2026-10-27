// S-04 演習（四肢択一）：選ぶまで「答える」を押せない。結果は S-06 へ（詳細設計書 6.2）
import { getContext } from '../../core/context.js'
import { choiceOption } from '../../components/choice-option.js'
import { button } from '../../components/button.js'
import { errorBand, errorMessage } from '../../components/status.js'
import { escapeHtml } from '../../logic/format.js'
import { progressLine } from './adventure.js'
export const M_ANSWER_ERROR = '解答を送れませんでした。もう一度お試しください'
export async function render(root) {
  const { api, getState, setState, go } = getContext()
  const { quest, adventureId } = getState()
  if (!quest || quest.kind !== 'choice') return go('/home')
  const choices = quest.question.choices
  root.innerHTML = `${progressLine(quest)}
<section class="gd-card app-section"><h1 class="app-sr-only">四肢択一</h1><p class="question">${escapeHtml(quest.question.body).replace(/\n/g, '<br>')}</p></section>
<div class="app-stack app-choices" role="group" aria-label="選択肢"></div>
<div class="app-error-slot"></div>
${button({ label: '答える', variant: 'primary', block: true, disabled: true, attrs: 'data-action="answer"' })}`
  const list = root.querySelector('.app-choices')
  const answer = root.querySelector('[data-action="answer"]')
  let selected = null
  const draw = () => {
    list.innerHTML = choices.map((c) => choiceOption({ no: c.no, body: c.body, state: c.no === selected ? 'selected' : 'idle' })).join('')
  }
  draw()
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-choice]')
    if (!btn || answer.dataset.busy) return
    selected = Number(btn.dataset.choice)
    draw()
    list.querySelector(`[data-choice="${selected}"]`).focus()
    answer.disabled = false
  })
  answer.addEventListener('click', async () => {
    if (selected === null) return
    answer.disabled = true
    answer.dataset.busy = '1'
    answer.textContent = '答え合わせ中…'
    try {
      const res = await api.apiPost('/answers/choice', { questionId: quest.question.id, choiceNo: selected, adventureId })
      setState({ result: { kind: 'choice', quest, selected, res } })
      go('/quest/result')
    } catch (err) {
      root.querySelector('.app-error-slot').innerHTML = errorBand(errorMessage(err, M_ANSWER_ERROR))
      delete answer.dataset.busy
      answer.textContent = '答える'
      answer.disabled = false
    }
  })
}
