// Button：primary は1画面に1つ。block で横幅いっぱい
import { escapeHtml, cx } from './_util.js'
export function button({ label, variant = 'secondary', block = false, size = 'md', disabled = false, attrs = '' }) {
  return `<button type="button" class="${cx('gd-btn', `gd-btn-${variant}`, size === 'sm' && 'gd-btn-sm', block && 'gd-btn-block')}"${disabled ? ' disabled' : ''}${attrs ? ` ${attrs}` : ''}>${escapeHtml(label)}</button>`
}
