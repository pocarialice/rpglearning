// S-14 AIパートナー設定：画像を選ぶ → プレビュー → 差し替える（prepare → オブジェクトストレージへ PUT → commit の3段階）。「画像を外す」で頭文字に戻す
// 見本表示だけは学習者画面と同じ PartnerBubble を使う（外部設計書 3.8）
import { getContext } from '../../core/context.js'
import { button } from '../../components/button.js'
import { openDialog } from '../../components/dialog.js'
import { partnerBubble, PERSONA_LABEL } from '../../components/partner-bubble.js'
import { loading, errorBand, errorMessage } from '../../components/status.js'
import { escapeHtml } from '../../logic/format.js'
import { PERSONA_INTRO } from '../../parts/partner-step.js'
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024
export const IMAGE_TYPES = ['image/png', 'image/webp']
export const M_PARTNERS_ERROR = 'AIパートナーを読み込めませんでした。もう一度お試しください'
export const M_IMAGE_ERROR = '画像を差し替えられませんでした。もう一度お試しください'
export function imageMessage(file) {
  if (!file) return ''
  if (!IMAGE_TYPES.includes(file.type)) return 'PNG か WebP の画像を選んでください'
  if (file.size > IMAGE_MAX_BYTES) return '画像は2MBまでにしてください'
  return ''
}
function card(p, preview) {
  const shown = preview ?? p.imageUrl
  return `<section class="gd-card app-section app-partner-card" aria-labelledby="p-${p.persona}" data-persona-card="${p.persona}">
<h2 id="p-${p.persona}" class="label">${escapeHtml(p.label)}<span class="meta">・初期名 ${escapeHtml(p.defaultName)}</span></h2>
<p class="meta">いまの画像：${p.imageUrl ? '設定済み' : 'なし（名前の頭文字を表示）'}</p>
<div class="app-partner-sample"><p class="caption">学習者画面での見え方${preview ? '（プレビュー）' : ''}</p>
${partnerBubble({ name: p.defaultName, persona: p.persona, text: PERSONA_INTRO[p.persona].sample, imageUrl: shown })}</div>
<label class="app-field"><span class="label">新しい画像（PNG・WebP、2MBまで。正方形・512×512px 以上、透過背景がおすすめ）</span>
<input type="file" class="body" accept="${IMAGE_TYPES.join(',')}" data-file></label>
<p class="meta app-hint" data-msg></p><div class="app-card-result"></div>
<div class="app-toolbar app-toolbar-end">${p.imageUrl ? button({ label: '画像を外す', variant: 'quiet', attrs: 'data-action="remove"' }) : ''}${button({ label: '差し替える', attrs: `data-action="replace"${preview ? '' : ' disabled'}` })}</div></section>`
}
export async function render(root) {
  const { api } = getContext()
  const title = '<h1 class="title app-admin-title">AIパートナー設定</h1><p class="meta">差し替えると、全学習者の画面の紋章が変わる</p>'
  root.innerHTML = `${title}${loading()}`
  let list
  try {
    list = await Promise.all(Object.keys(PERSONA_LABEL).map((p) => api.apiGet(`/admin/partners/${p}/image`)))
  } catch (err) {
    root.innerHTML = `${title}${errorBand(errorMessage(err, M_PARTNERS_ERROR))}<div class="app-toolbar">${button({ label: 'もう一度読み込む', attrs: 'data-action="reload"' })}</div>`
    root.querySelector('[data-action="reload"]').addEventListener('click', () => render(root))
    return
  }
  root.innerHTML = `${title}<div class="app-partner-grid"></div>`
  const grid = root.querySelector('.app-partner-grid')
  const previews = {}
  // 1枚のカードだけを描き直す（ほかのカードの選択中の画像は残す）
  const draw = (p, notice = '') => {
    const old = grid.querySelector(`[data-persona-card="${p.persona}"]`)
    const html = card(p, previews[p.persona]?.url ?? null)
    if (old) old.outerHTML = html
    else grid.insertAdjacentHTML('beforeend', html)
    if (notice) grid.querySelector(`[data-persona-card="${p.persona}"] .app-card-result`).innerHTML = notice
  }
  const clearPreview = (persona) => {
    if (previews[persona]) URL.revokeObjectURL(previews[persona].url)
    delete previews[persona]
  }
  list.forEach((p) => draw(p))
  const byPersona = (el) => list.find((p) => p.persona === el.closest('[data-persona-card]').dataset.personaCard)
  grid.addEventListener('change', (e) => {
    if (!e.target.matches('[data-file]')) return
    const p = byPersona(e.target)
    const file = e.target.files?.[0]
    clearPreview(p.persona)
    const m = imageMessage(file)
    if (file && !m) previews[p.persona] = { file, url: URL.createObjectURL(file) }
    draw(p)
    grid.querySelector(`[data-persona-card="${p.persona}"] [data-msg]`).textContent = m
  })
  grid.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-action]')
    if (!b) return
    const p = byPersona(b)
    const out = b.closest('[data-persona-card]').querySelector('.app-card-result')
    if (b.dataset.action === 'replace') {
      const pre = previews[p.persona]
      if (!pre) return
      b.disabled = true
      out.innerHTML = ''
      try {
        const { imageKey, uploadUrl } = await api.apiPut(`/admin/partners/${p.persona}/image`, { action: 'prepare', contentType: pre.file.type, size: pre.file.size })
        const put = await globalThis.fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': pre.file.type }, body: pre.file })
        if (!put.ok) throw new Error(`upload ${put.status}`)
        const res = await api.apiPut(`/admin/partners/${p.persona}/image`, { action: 'commit', imageKey })
        p.imageUrl = res.imageUrl
        clearPreview(p.persona)
        draw(p, '<div class="app-notice" role="status">差し替えた</div>')
      } catch (err) {
        out.innerHTML = errorBand(err?.name === 'ApiError' ? errorMessage(err, M_IMAGE_ERROR) : M_IMAGE_ERROR)
        b.disabled = false
      }
    } else if (b.dataset.action === 'remove') {
      openDialog({
        title: '画像を外す',
        mount: (body, close) => {
          body.innerHTML = `<p class="body">${escapeHtml(p.label)}の画像を外すと、全学習者の画面で名前の頭文字の表示に戻ります</p><div class="app-dialog-msg"></div>
<div class="app-toolbar app-toolbar-end">${button({ label: 'やめる', variant: 'quiet', attrs: 'data-action="cancel"' })}${button({ label: '外す', variant: 'primary', attrs: 'data-action="confirm"' })}</div>`
          body.querySelector('[data-action="cancel"]').addEventListener('click', close)
          body.querySelector('[data-action="confirm"]').addEventListener('click', async (ev) => {
            ev.target.disabled = true
            try {
              await api.apiDelete(`/admin/partners/${p.persona}/image`)
              p.imageUrl = null
              close()
              draw(p, '<div class="app-notice" role="status">画像を外した</div>')
            } catch (err) {
              body.querySelector('.app-dialog-msg').innerHTML = errorBand(errorMessage(err, M_IMAGE_ERROR))
              ev.target.disabled = false
            }
          })
        }
      })
    }
  })
}
