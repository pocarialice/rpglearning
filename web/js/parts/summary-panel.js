// 学習サマリ（A-13・A-14）のアコーディオン。ふだんは閉じていて、開いたときに読み込む（AIのコメントを作るのは開いたときだけ）
// 中身はノートアプリに貼れる Markdown。「コピーする」でクリップボードに入れる
import { button } from '../components/button.js'
import { loading, errorBand, errorMessage } from '../components/status.js'
import { escapeHtml } from '../logic/format.js'
export const M_SUMMARY_ERROR = '学習サマリを読み込めませんでした。もう一度お試しください'
export const M_SUMMARY_EMPTY = 'この日に解いた問題はありません'
export const M_COPIED = 'クリップボードにコピーしました'
export const M_COPY_FAILED = 'コピーできませんでした。テキストを選んでコピーしてください'
export const todayJst = (now = new Date()) => new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
// navigator.clipboard が使えない環境（http・古いブラウザ）では、選択してコピーするやり方に切り替える
export async function copyText(text, doc = document) {
  try {
    if (globalThis.navigator?.clipboard?.writeText) {
      await globalThis.navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 下の方法を試す
  }
  const area = doc.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.className = 'app-sr-only'
  doc.body.appendChild(area)
  area.select()
  let done = false
  try {
    done = typeof doc.execCommand === 'function' && doc.execCommand('copy')
  } catch {
    done = false
  }
  area.remove()
  return !!done
}
// path(date) は A-13／A-14 のパスを返す。withDate：日付を選べるようにする（S-08）
export function mountSummaryPanel(el, { api, path, label = '学習サマリ', withDate = false, today = todayJst() }) {
  const dateField = withDate
    ? `<div class="app-summary-date"><label class="label" for="summary-date">学習日</label><input id="summary-date" class="app-input body" type="date" value="${escapeHtml(today)}" max="${escapeHtml(today)}"></div>`
    : ''
  el.innerHTML = `<details class="gd-card app-summary"><summary class="app-summary-head"><span class="label">${escapeHtml(label)}</span><span class="meta">Markdown でコピー</span></summary>
<div class="app-summary-body">${dateField}<div class="app-summary-slot"></div></div></details>`
  const details = el.querySelector('details')
  const slot = el.querySelector('.app-summary-slot')
  const dateInput = el.querySelector('#summary-date')
  let loaded = false
  let seq = 0
  const load = async () => {
    loaded = true
    const mine = ++seq
    slot.innerHTML = loading('学習サマリを読み込み中')
    let res
    try {
      res = await api.apiGet(path(dateInput?.value || today))
    } catch (err) {
      if (mine !== seq) return
      loaded = false
      slot.innerHTML = `${errorBand(errorMessage(err, M_SUMMARY_ERROR))}${button({ label: 'もう一度読み込む', size: 'sm', attrs: 'data-action="summary-reload"' })}`
      slot.querySelector('[data-action="summary-reload"]').addEventListener('click', load)
      return
    }
    if (mine !== seq) return
    if (!res.markdown) {
      slot.innerHTML = `<p class="meta app-center">${M_SUMMARY_EMPTY}</p>`
      return
    }
    slot.innerHTML = `<p class="meta">学習時間 ${escapeHtml(res.studyTime)}・${Number(res.answerCount)}問</p>
<pre class="app-md" tabindex="0" aria-label="学習サマリの Markdown"></pre>
${button({ label: 'コピーする', block: true, attrs: 'data-action="summary-copy"' })}<p class="meta app-copy-status" role="status" aria-live="polite"></p>`
    slot.querySelector('.app-md').textContent = res.markdown
    const status = slot.querySelector('.app-copy-status')
    slot.querySelector('[data-action="summary-copy"]').addEventListener('click', async () => {
      status.textContent = (await copyText(res.markdown)) ? M_COPIED : M_COPY_FAILED
    })
  }
  details.addEventListener('toggle', () => {
    if (details.open && !loaded) load()
  })
  dateInput?.addEventListener('change', () => {
    if (!dateInput.value) return
    if (details.open) load()
    else loaded = false
  })
  return { load }
}
