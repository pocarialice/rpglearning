// 画面の登録（詳細設計書 6.2）。読み込みは必要になってから行う
const LEARNER = ['learner']
export const PAGES = [
  ['/home', () => import('./learner/s02-home.js'), LEARNER],
  ['/quest/choice', () => import('./learner/s04-choice.js'), LEARNER],
  ['/quest/explain', () => import('./learner/s05-explain.js'), LEARNER],
  ['/quest/result', () => import('./learner/s06-result.js'), LEARNER],
  ['/onboarding', () => import('./learner/onboarding.js'), LEARNER],
  ['/courses', () => import('./learner/s03-courses.js'), LEARNER],
  ['/ranking', () => import('./learner/s07-ranking.js'), LEARNER],
  ['/profile', () => import('./learner/s08-profile.js'), LEARNER],
  ['/partner', () => import('./learner/s09-partner.js'), LEARNER],
  ['/settings/notify', () => import('./learner/s10-notify.js'), LEARNER]
]
export function registerPages(router) {
  for (const [path, load, roles] of PAGES) router.register(path, load, roles)
}
