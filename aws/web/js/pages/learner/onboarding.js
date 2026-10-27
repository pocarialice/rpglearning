// 初回の流れ「はじめての冒険」：ニックネーム → コース → パートナーの3段階（外部設計書 3.3.1、詳細設計書 6.2）
// どこまで済んだかは A-01 の onboarding で決めるため、途中で読み込み直しても続きから始まる
import { getContext } from '../../core/context.js'
import { mountNicknameStep } from '../../parts/nickname-step.js'
import { mountCourseStep } from '../../parts/course-step.js'
import { mountPartnerStep } from '../../parts/partner-step.js'
export const STEPS = [
  { key: 'needNickname', label: 'ニックネーム' },
  { key: 'needCourse', label: 'コース' },
  { key: 'needPartner', label: '仲間' }
]
export const NOTICE_NICKNAME_TAKEN = '選んだコースに同じニックネームの冒険者がいる。別の名前にしよう'
export async function render(root) {
  const { api, getState, setState, go } = getContext()
  const { onboarding, user } = getState()
  const index = STEPS.findIndex((s) => onboarding?.[s.key])
  if (index < 0) return go('/home')
  // 矢印型のボックスで流れを示す。済んだ段階は「済」、今の段階は塗りで示す（色だけに頼らない）
  const steps = STEPS.map((s, i) => {
    const state = i < index ? 'done' : i === index ? 'now' : 'todo'
    const mark = state === 'done' ? '済' : String(i + 1)
    return `<li class="app-step-${state}"${state === 'now' ? ' aria-current="step"' : ''}><span class="app-step-no" aria-hidden="true">${mark}</span><span class="app-step-label">${s.label}</span>${state === 'done' ? '<span class="app-sr-only">（済み）</span>' : ''}</li>`
  }).join('')
  root.innerHTML = `<h1 class="display app-onboarding-title">はじめての冒険</h1>
<p class="meta">ステップ ${index + 1} / ${STEPS.length}</p><ol class="app-steps">${steps}</ol><div class="app-step"></div>`
  const el = root.querySelector('.app-step')
  // 1段階済むごとに状態を更新し、次の段階を描き直す
  const finish = (patch, onboardingPatch) => {
    const next = { ...getState().onboarding, ...onboardingPatch }
    setState({ user: { ...getState().user, ...patch }, onboarding: next })
    if (STEPS.some((s) => next[s.key])) return render(root)
    go('/home')
  }
  const key = STEPS[index].key
  if (key === 'needNickname') {
    mountNicknameStep(el, {
      api, value: user?.nickname ?? '', notice: getState().onboardingNotice ?? '',
      onDone: (nickname) => {
        setState({ onboardingNotice: null })
        finish({ nickname }, { needNickname: false })
      }
    })
  } else if (key === 'needCourse') {
    await mountCourseStep(el, {
      api,
      onDone: (currentCourseId) => finish({ currentCourseId }, { needCourse: false }),
      // コースの中でニックネームが重なったら、ニックネームの段階に戻す
      onNicknameTaken: () => {
        setState({ onboardingNotice: NOTICE_NICKNAME_TAKEN })
        finish({}, { needNickname: true })
      }
    })
  } else {
    mountPartnerStep(el, { api, persona: user?.partner?.persona ?? null, onDone: (partner) => finish({ partner }, { needPartner: false }) })
  }
}
