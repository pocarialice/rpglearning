// 画面の登録（詳細設計書 6.2）。読み込みは必要になってから行う
const LEARNER = ['learner']
const soon = () => import('./learner/coming-soon.js')
export const PAGES = [
  ['/home', () => import('./learner/s02-home.js'), LEARNER],
  ['/quest/choice', () => import('./learner/s04-choice.js'), LEARNER],
  ['/quest/explain', () => import('./learner/s05-explain.js'), LEARNER],
  ['/quest/result', () => import('./learner/s06-result.js'), LEARNER],
  ['/onboarding', () => import('./learner/onboarding.js'), LEARNER],
  ['/courses', soon, LEARNER],
  ['/ranking', soon, LEARNER],
  ['/profile', soon, LEARNER],
  ['/partner', soon, LEARNER],
  ['/settings/notify', soon, LEARNER]
]
export function registerPages(router) {
  for (const [path, load, roles] of PAGES) router.register(path, load, roles)
}
