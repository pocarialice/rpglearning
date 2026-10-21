// S-09 AIパートナー選択：キャラクターを変えると名前は新しいキャラクターの初期名に戻る（外部設計書 3.6.2）
import { getContext } from '../../core/context.js'
import { button } from '../../components/button.js'
import { mountPartnerStep } from '../../parts/partner-step.js'
export async function render(root) {
  const { api, getState, setState, go } = getContext()
  const partner = getState().user?.partner ?? null
  root.innerHTML = '<h1 class="display">AIパートナー選択</h1><div class="app-step"></div>'
  const el = root.querySelector('.app-step')
  mountPartnerStep(el, {
    api, persona: partner?.persona ?? null, name: partner?.name ?? '', submitLabel: 'この仲間にする',
    extra: button({ label: 'やめる', variant: 'quiet', block: true, attrs: 'data-action="back"' }),
    onDone: (next) => {
      setState({ user: { ...getState().user, partner: { ...partner, ...next } } })
      go('/profile')
    }
  })
  el.querySelector('[data-action="back"]').addEventListener('click', () => go('/profile'))
}
