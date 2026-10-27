// 画面の状態（利用者・現在のコース・冒険ID など）
export function createStore(initial = {}) {
  let state = { ...initial }
  const listeners = new Set()
  return {
    getState: () => state,
    setState(patch) {
      state = { ...state, ...patch }
      for (const fn of [...listeners]) fn(state)
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    }
  }
}
const store = createStore({ user: null, onboarding: null, adventureId: null })
export const getState = store.getState
export const setState = store.setState
export const subscribe = store.subscribe
