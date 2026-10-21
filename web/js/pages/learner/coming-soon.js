// まだ作っていない画面の仮置き（S-03・S-07〜S-10・初回の流れ）。下部ナビから開いたときに迷わないようにする
import { getContext } from '../../core/context.js'
import { button } from '../../components/button.js'
export async function render(root) {
  const { go } = getContext()
  root.innerHTML = `<section class="gd-card app-section"><h1 class="title">準備中</h1><p class="body">この画面はまだ準備中。ホームから冒険に出よう</p>
${button({ label: 'ホームへ戻る', variant: 'primary', block: true, attrs: 'data-action="home"' })}</section>`
  root.querySelector('[data-action="home"]').addEventListener('click', () => go('/home'))
}
