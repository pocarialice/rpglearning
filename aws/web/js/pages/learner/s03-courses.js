// S-03 コース選択：受講中の印。409（M-08）ならニックネームの変更へ案内する（詳細設計書 6.2）
import { getContext } from '../../core/context.js'
import { button } from '../../components/button.js'
import { mountCourseStep } from '../../parts/course-step.js'
import { M08 } from '../../parts/nickname-step.js'
export const M_TAKEN_GUIDE = 'そのコースには同じニックネームの冒険者がいる。ニックネームを変えてから選び直そう'
export async function render(root) {
  const { api, getState, setState, go } = getContext()
  root.innerHTML = `<h1 class="display">コース選択</h1><div class="app-guide-slot"></div><div class="app-step"></div>
${button({ label: 'プロフィールへ戻る', variant: 'quiet', block: true, attrs: 'data-action="back"' })}`
  root.querySelector('[data-action="back"]').addEventListener('click', () => go('/profile'))
  const guide = root.querySelector('.app-guide-slot')
  await mountCourseStep(root.querySelector('.app-step'), {
    api,
    // コースを変えたら、途中の冒険は続けない
    onDone: (currentCourseId) => {
      setState({ user: { ...getState().user, currentCourseId }, adventureId: null, quest: null, result: null })
      go('/home')
    },
    onNicknameTaken: () => {
      guide.innerHTML = `<div class="app-error" role="alert"><p>${M08}</p><p>${M_TAKEN_GUIDE}</p></div>
${button({ label: 'ニックネームを変える', block: true, attrs: 'data-action="nickname"' })}`
      guide.querySelector('[data-action="nickname"]').addEventListener('click', () => go('/profile?edit=nickname'))
    }
  })
}
