// S-11 問題取り込み・レビュー（詳細設計書 6.2）
// 取り込み：A-13 → PDF・画像は署名付きURLへ PUT。取り込み状況は5秒ごとに再取得し、待機中・抽出中がなくなったら止める
// 登録済みの問題：A-15b でコースの問題（下書きも含む）を一覧にし、状態・取り込みで絞り込む。チェックした問題は A-16b でまとめて公開・削除する
// 修正：下書き・要確認の問題をダイアログで修正し（A-15）、公開する（A-16）。学習者の見え方を横に出し、保存・公開したら次の下書きへ進む
import { getContext } from '../../core/context.js'
import { button } from '../../components/button.js'
import { openDialog } from '../../components/dialog.js'
import { loading, errorBand, errorMessage } from '../../components/status.js'
import { CHOICE_KEYS, choiceOption } from '../../components/choice-option.js'
import { escapeHtml, formatDateTime } from '../../logic/format.js'
import { validateImportRequest, validateQuestionDraft, IMPORT_CONTENT_TYPES, IMPORT_TEXT_MAX } from '../../logic/validators.js'
import { pickCourse, courseSelect, bindCourseSelect, M_NO_COURSE } from './_course.js'
export const POLL_MS = 5000
export const M12 = '選択肢を4つそろえてから公開してください'
export const M_IMPORT_ERROR = '取り込みを始められませんでした。もう一度お試しください'
export const M_UPLOAD_ERROR = 'ファイルを送れませんでした。もう一度お試しください'
export const M_LIST_ERROR = '取り込み状況を読み込めませんでした。もう一度お試しください'
export const M_SAVE_ERROR = '問題を保存できませんでした。もう一度お試しください'
export const M_QUESTIONS_ERROR = '登録済みの問題を読み込めませんでした。もう一度お試しください'
export const M_BULK_ERROR = 'まとめて処理できませんでした。もう一度お試しください'
export const STATUS_LABEL = { waiting: '待機中', extracting: '抽出中', done: '完了', failed: '失敗' }
export const DRAFT_LABEL = { draft: '下書き', needs_review: '要確認', published: '公開済み' }
const SOURCE_LABEL = { pdf: 'PDF', image: '画像', text: 'テキスト' }
const FIELD_LABEL = { body: '問題文', choices: '選択肢', correct: '正解', explanation: '解説', keywords: 'キーワード' }
const running = (list) => list.some((j) => j.status === 'waiting' || j.status === 'extracting')
export function importMessage(v) {
  if (v.ok) return ''
  if (v.field === 'text') return `テキストは1〜${IMPORT_TEXT_MAX.toLocaleString('ja-JP')}文字で貼り付けてください`
  if (v.field === 'size') return 'ファイルは20MBまでにしてください'
  if (v.field === 'contentType') return 'PDF を選んだときは PDF、画像を選んだときは PNG か JPEG のファイルを選んでください'
  return 'ファイルを選んでください'
}
function importForm() {
  const radios = Object.entries(SOURCE_LABEL).map(([v, l], i) => `<label class="app-radio"><input type="radio" name="source" value="${v}"${i === 0 ? ' checked' : ''}> ${l}</label>`).join('')
  return `<section class="gd-card app-section" aria-labelledby="import-h"><h2 id="import-h" class="label">取り込む</h2>
<fieldset class="app-radios"><legend class="meta">資料の種類（PDF・画像は20MBまで）</legend>${radios}</fieldset>
<div data-file><input type="file" class="body" accept="${IMPORT_CONTENT_TYPES.pdf.join(',')}" aria-label="取り込むファイル"></div>
<div data-text hidden><textarea class="app-textarea body" rows="8" aria-label="取り込むテキスト" placeholder="問題文・選択肢・正解・解説を貼り付ける"></textarea></div>
<p class="meta app-hint" data-import-msg></p><div class="app-import-result"></div>
<div class="app-toolbar app-toolbar-end">${button({ label: '取り込む', attrs: 'data-action="import" data-ctrl-enter disabled' })}</div></section>`
}
function importsTable(list, selected) {
  if (list.length === 0) return '<p class="body">まだ取り込みがない</p>'
  const rows = list.map((j) => `<tr${j.importId === selected ? ' aria-current="true" class="app-row-on"' : ''}>
<td>${escapeHtml(formatDateTime(j.createdAt))}</td><td>${escapeHtml(j.fileName)}<span class="meta">（${SOURCE_LABEL[j.sourceType] ?? ''}）</span></td>
<td><span class="app-status app-status-${escapeHtml(j.status)}">${STATUS_LABEL[j.status] ?? escapeHtml(j.status)}</span>${j.errorMessage ? `<p class="meta">${escapeHtml(j.errorMessage)}</p>` : ''}</td>
<td class="app-num">${Number(j.extractedCount ?? 0)}問</td>
<td>${j.status === 'done' ? button({ label: '問題を見る', size: 'sm', attrs: `data-open-import="${escapeHtml(j.importId)}"` }) : ''}</td></tr>`).join('')
  return `<table class="app-table"><thead><tr><th scope="col">受け付けた日時</th><th scope="col">ファイル</th><th scope="col">状態</th><th scope="col" class="app-num">抽出件数</th><th scope="col"><span class="app-sr-only">操作</span></th></tr></thead><tbody>${rows}</tbody></table>`
}
// 公開できる形か（選択肢4つ・正解・解説がそろっている）
export const isPublishable = (d) => validateQuestionDraft({ ...d, correct: d.correctChoice }).ok
// 修正できる（＝レビューを待っている）問題
export const isReviewable = (d) => d.status === 'draft' || d.status === 'needs_review'
const nl2br = (s) => escapeHtml(s).replace(/\n/g, '<br>')
const QUESTION_FILTER = { '': 'すべて', published: '公開済み', draft: '下書き', needs_review: '要確認' }
function questionFilter(value) {
  const opts = Object.entries(QUESTION_FILTER).map(([v, l]) => `<option value="${v}"${v === value ? ' selected' : ''}>${l}</option>`).join('')
  return `<label class="app-field"><span class="label">状態</span><select class="app-input body" data-question-filter>${opts}</select></label>`
}
function bulkBar(count) {
  const off = count === 0 ? ' disabled' : ''
  return `<span class="meta" data-selected-count>${count}問を選んでいる</span>${button({ label: '選んだ問題を削除する', variant: 'quiet', size: 'sm', attrs: `data-bulk="delete"${off}` })}${button({ label: '選んだ問題を公開する', variant: 'primary', size: 'sm', attrs: `data-bulk="publish"${off}` })}`
}
// 登録済みの問題。「中身を見る」で問題文・選択肢・正解・解説・キーワードを開く。修正は下書き・要確認だけ
function questionsTable(list, selected) {
  if (list.length === 0) return '<p class="body">この条件の問題はない</p>'
  const detail = (d) => {
    const choices = d.choices.map((c, i) => `<li>${CHOICE_KEYS[i] ?? i + 1}　${escapeHtml(c)}${d.correctChoice === i + 1 ? '<span class="meta">（正解）</span>' : ''}</li>`).join('')
    return `<details class="app-source"><summary class="meta">中身を見る</summary><p class="body">${nl2br(d.body)}</p><ul class="app-list body">${choices}</ul>
<p class="meta">解説：${escapeHtml(d.explanation || '（なし）')}</p><p class="meta">キーワード：${escapeHtml(d.keywords.join('、') || '（なし）')}</p></details>`
  }
  const all = list.every((d) => selected.has(d.id))
  const some = !all && list.some((d) => selected.has(d.id))
  const rows = list.map((d) => `<tr${selected.has(d.id) ? ' class="app-row-on"' : ''}>
<td><input type="checkbox" data-select="${escapeHtml(d.id)}" aria-label="選ぶ：${escapeHtml(d.bodyHead)}"${selected.has(d.id) ? ' checked' : ''}></td>
<td>${escapeHtml(d.bodyHead)}${[...d.body].length > 40 ? '…' : ''}${detail(d)}</td>
<td>${d.choiceCount === 4 ? '四肢択一' : `選択肢${Number(d.choiceCount)}つ`}</td>
<td class="app-num">${Number(d.keywordCount)}</td><td><span class="app-status app-status-${escapeHtml(d.status)}">${DRAFT_LABEL[d.status] ?? escapeHtml(d.status)}</span></td>
<td>${isReviewable(d) ? button({ label: '修正する', size: 'sm', attrs: `data-edit="${escapeHtml(d.id)}"` }) : ''}</td></tr>`).join('')
  return `<p class="meta">${list.length}問</p><table class="app-table"><thead><tr>
<th scope="col"><input type="checkbox" data-select-all aria-label="表示している問題をすべて選ぶ"${all ? ' checked' : ''}${some ? ' data-some' : ''}></th>
<th scope="col">問題文の先頭</th><th scope="col">形式</th><th scope="col" class="app-num">キーワード</th><th scope="col">状態</th><th scope="col"><span class="app-sr-only">操作</span></th></tr></thead><tbody>${rows}</tbody></table>`
}
// 確認ダイアログ。「やめる」で閉じ、確定ボタンで run を呼ぶ。失敗したらダイアログの中に出す
function confirmDialog({ title, message, confirmLabel, run, fallback = M_SAVE_ERROR }) {
  openDialog({
    title,
    mount: (body, close) => {
      body.innerHTML = `<p class="body">${escapeHtml(message)}</p>
<div class="app-toolbar app-toolbar-end">${button({ label: 'やめる', variant: 'quiet', attrs: 'data-action="cancel"' })}${button({ label: confirmLabel, variant: 'primary', attrs: 'data-action="confirm"' })}</div><div class="app-dialog-msg"></div>`
      body.querySelector('[data-action="cancel"]').addEventListener('click', close)
      body.querySelector('[data-action="confirm"]').addEventListener('click', async (e) => {
        e.target.disabled = true
        try {
          await run(close)
        } catch (err) {
          body.querySelector('.app-dialog-msg').innerHTML = errorBand(errorMessage(err, fallback))
          e.target.disabled = false
        }
      })
    }
  })
}
function editorForm(d) {
  const choices = CHOICE_KEYS.map((k, i) => `<div class="app-choice-edit"><label class="app-radio"><input type="radio" name="correct" value="${i + 1}"${d.correctChoice === i + 1 ? ' checked' : ''}> 正解</label>
<label class="app-field"><span class="label">${k}</span><input class="app-input body" data-choice-input="${i}" value="${escapeHtml(d.choices[i] ?? '')}"></label></div>`).join('')
  const extra = d.choices.length > 4 ? `<div class="app-notice" role="status">抽出した選択肢が${d.choices.length}つあった。5つ目からは表示していない。4つに整えて保存してください</div>` : ''
  const kws = [0, 1, 2].map((i) => `<input class="app-input body" data-keyword-input="${i}" maxlength="50" aria-label="キーワード${i + 1}" value="${escapeHtml(d.keywords[i] ?? '')}">`).join('')
  return `<div class="app-editor">${extra}
<label class="app-field"><span class="label">問題文</span><textarea class="app-textarea body" rows="4" data-field="body">${escapeHtml(d.body)}</textarea></label>
<fieldset class="app-choices-edit"><legend class="label">選択肢と正解</legend>${choices}</fieldset>
<label class="app-field"><span class="label">解説</span><textarea class="app-textarea body" rows="3" data-field="explanation">${escapeHtml(d.explanation ?? '')}</textarea></label>
<fieldset class="app-keywords"><legend class="label">キーワード（3つまで、各50文字まで）</legend>${kws}</fieldset></div>`
}
// 学習者エリアの見え方（S-04 四肢択一・S-06 結果と同じ部品）。after なら正解と解説を出す
export function previewHtml(q, after = false) {
  const choices = q.choices.map((body, i) => choiceOption({ no: i + 1, body, state: after ? (q.correctChoice === i + 1 ? 'correct' : 'dim') : 'idle' })).join('')
  const explanation = after && q.explanation.trim() ? `<section class="gd-card app-section"><h2 class="title">解説</h2><p class="body">${nl2br(q.explanation)}</p></section>` : ''
  return `<section class="gd-card app-section"><p class="question">${nl2br(q.body)}</p></section><div class="app-stack">${choices || '<p class="meta">選択肢がまだない</p>'}</div>${explanation}`
}
function editorShell(d, pos, total) {
  const tabs = [['before', '答える前'], ['after', '答えたあと']].map(([k, l], i) => `<button type="button" role="tab" class="app-tab" aria-selected="${i === 0}" data-preview-tab="${k}"${i === 0 ? '' : ' tabindex="-1"'}>${l}</button>`).join('')
  return `<p class="meta" data-editor-pos>レビューを待っている問題 ${pos}／${total}　<span class="app-status app-status-${escapeHtml(d.status)}">${DRAFT_LABEL[d.status] ?? escapeHtml(d.status)}</span></p>
<div class="app-editor-grid">${editorForm(d)}
<section class="app-preview" aria-labelledby="preview-h"><h3 id="preview-h" class="label">学習者の見え方</h3>
<div class="app-tabs" role="tablist" aria-label="学習者の見え方">${tabs}</div><div class="app-preview-body" inert></div></section></div>
<div class="app-editor-msg"></div>
<div class="app-toolbar app-editor-actions">${button({ label: '← 前へ', variant: 'quiet', size: 'sm', attrs: `data-action="prev"${pos === 1 ? ' disabled' : ''}` })}${button({ label: '次へ →', variant: 'quiet', size: 'sm', attrs: `data-action="next"${pos === total ? ' disabled' : ''}` })}
<span class="app-toolbar-gap"></span>${button({ label: '削除する', variant: 'quiet', attrs: 'data-action="delete"' })}${button({ label: '保存して次へ', attrs: 'data-action="save" data-ctrl-enter' })}${button({ label: '公開して次へ', variant: 'primary', attrs: 'data-action="publish"' })}</div>`
}
// 入力欄から A-15 に送る形を作る。空の選択肢・キーワードは送らない（正解が空の選択肢を指していたら未設定にする）
export function readEditor(el) {
  const raw = [...el.querySelectorAll('[data-choice-input]')].map((i) => i.value.trim())
  const checked = Number(el.querySelector('input[name="correct"]:checked')?.value ?? 0)
  const choices = raw.filter((c) => c !== '')
  const correctChoice = checked && raw[checked - 1] !== '' ? raw.slice(0, checked).filter((c) => c !== '').length : null
  return {
    body: el.querySelector('[data-field="body"]').value,
    choices,
    correctChoice,
    explanation: el.querySelector('[data-field="explanation"]').value,
    keywords: [...el.querySelectorAll('[data-keyword-input]')].map((i) => i.value.trim()).filter((k) => k !== '')
  }
}
export async function render(root, params = {}) {
  const { api, getState, setState, go } = getContext()
  const courses = getState().user?.adminCourses ?? []
  const courseId = pickCourse(courses, params, getState())
  const title = '<h1 class="title app-admin-title">問題取り込み・レビュー</h1>'
  if (!courseId) {
    root.innerHTML = `${title}<div class="app-notice" role="status">${M_NO_COURSE}</div>`
    return
  }
  setState({ adminCourseId: courseId })
  root.innerHTML = `${title}<div class="app-toolbar">${courseSelect(courses, courseId)}</div>${importForm()}
<section class="app-section" aria-labelledby="imports-h"><h2 id="imports-h" class="label">取り込み状況</h2><div class="app-imports">${loading()}</div></section>
<section class="app-section" aria-labelledby="questions-h"><h2 id="questions-h" class="label" tabindex="-1">登録済みの問題</h2>
<div class="app-toolbar">${questionFilter('')}<div class="app-import-filter" data-import-filter></div></div>
<div class="app-toolbar app-toolbar-end app-bulk" data-bulk-bar>${bulkBar(0)}</div>
<div class="app-questions-msg"></div><div class="app-questions">${loading()}</div></section>`
  bindCourseSelect(root, { path: '/admin/import', setState, go })
  const listEl = root.querySelector('.app-imports')
  let imports = []
  let importFilter = params.import ?? null
  let timer = null
  // ---- 取り込み状況（5秒ごと）----
  const loadImports = async () => {
    clearTimeout(timer)
    if (!listEl.isConnected) return // 別の画面に移ったら止める
    try {
      imports = (await api.apiGet(`/admin/imports?course=${encodeURIComponent(courseId)}`)).imports ?? []
      listEl.innerHTML = importsTable(imports, importFilter)
    } catch (err) {
      listEl.innerHTML = errorBand(errorMessage(err, M_LIST_ERROR))
      return
    }
    if (running(imports)) timer = setTimeout(loadImports, POLL_MS)
  }
  listEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-open-import]')
    if (!b) return
    importFilter = b.dataset.openImport
    listEl.innerHTML = importsTable(imports, importFilter)
    loadQuestions().then(() => root.querySelector('#questions-h').focus())
  })
  // ---- 取り込みの登録 ----
  const form = root.querySelector('[aria-labelledby="import-h"]')
  const fileInput = form.querySelector('input[type="file"]')
  const textInput = form.querySelector('textarea')
  const msg = form.querySelector('[data-import-msg]')
  const result = form.querySelector('.app-import-result')
  const submit = form.querySelector('[data-action="import"]')
  const source = () => form.querySelector('input[name="source"]:checked').value
  const request = () => {
    const type = source()
    if (type === 'text') return { courseId, sourceType: 'text', text: textInput.value }
    const f = fileInput.files?.[0]
    return { courseId, sourceType: type, fileName: f?.name, contentType: f?.type, size: f?.size, file: f }
  }
  const update = () => {
    const type = source()
    form.querySelector('[data-file]').hidden = type === 'text'
    form.querySelector('[data-text]').hidden = type !== 'text'
    if (type !== 'text') fileInput.accept = IMPORT_CONTENT_TYPES[type].join(',')
    const req = request()
    const v = validateImportRequest(req)
    const touched = type === 'text' ? textInput.value !== '' : !!req.file
    msg.textContent = touched ? importMessage(v) : ''
    submit.disabled = !v.ok
  }
  form.addEventListener('change', update)
  textInput.addEventListener('input', update)
  update()
  submit.addEventListener('click', async () => {
    const { file, ...req } = request()
    if (!validateImportRequest(req).ok) return
    submit.disabled = true
    result.innerHTML = ''
    let res
    try {
      res = await api.apiPost('/admin/imports', req)
    } catch (err) {
      result.innerHTML = errorBand(errorMessage(err, M_IMPORT_ERROR))
      return update()
    }
    if (res.uploadUrl) {
      try {
        const put = await globalThis.fetch(res.uploadUrl, { method: 'PUT', headers: { 'Content-Type': req.contentType }, body: file })
        if (!put.ok) throw new Error(`upload ${put.status}`)
        // 置き終えたことを伝えて、抽出を始めてもらう（A-13b）
        await api.apiPost(`/admin/imports/${encodeURIComponent(res.importId)}/uploaded`)
      } catch {
        result.innerHTML = errorBand(M_UPLOAD_ERROR)
        return update()
      }
    }
    result.innerHTML = '<div class="app-notice" role="status">受け付けた。抽出が終わると「完了」になる</div>'
    fileInput.value = ''
    textInput.value = ''
    update()
    loadImports()
  })
  // ---- 登録済みの問題 ----
  const questionsEl = root.querySelector('.app-questions')
  const questionsMsg = root.querySelector('.app-questions-msg')
  const filterEl = root.querySelector('[data-question-filter]')
  const importFilterEl = root.querySelector('[data-import-filter]')
  const bulkEl = root.querySelector('[data-bulk-bar]')
  let registered = []
  const selected = new Set()
  const notice = (text) => { questionsMsg.innerHTML = text ? `<div class="app-notice" role="status">${escapeHtml(text)}</div>` : '' }
  const drawQuestions = () => {
    questionsEl.innerHTML = questionsTable(registered, selected)
    const all = questionsEl.querySelector('[data-select-all]')
    if (all) all.indeterminate = all.hasAttribute('data-some')
    bulkEl.innerHTML = bulkBar(selected.size)
  }
  const drawImportFilter = () => {
    const job = imports.find((j) => j.importId === importFilter)
    importFilterEl.innerHTML = importFilter
      ? `<span class="meta">取り込み「${escapeHtml(job?.fileName ?? importFilter)}」の問題だけ</span>${button({ label: 'すべての取り込みを見る', variant: 'quiet', size: 'sm', attrs: 'data-clear-import' })}`
      : ''
  }
  // 読み直したら選択は外す（見えていない問題をまとめて処理しないため）
  async function loadQuestions(text = '') {
    const status = filterEl.value
    notice(text)
    drawImportFilter()
    selected.clear()
    const q = `course=${encodeURIComponent(courseId)}${status ? `&status=${encodeURIComponent(status)}` : ''}${importFilter ? `&import=${encodeURIComponent(importFilter)}` : ''}`
    try {
      registered = (await api.apiGet(`/admin/questions?${q}`)).questions ?? []
      drawQuestions()
    } catch (err) {
      registered = []
      questionsEl.innerHTML = errorBand(errorMessage(err, M_QUESTIONS_ERROR))
      bulkEl.innerHTML = bulkBar(0)
    }
  }
  filterEl.addEventListener('change', () => loadQuestions())
  importFilterEl.addEventListener('click', (e) => {
    if (!e.target.closest('[data-clear-import]')) return
    importFilter = null
    if (imports.length) listEl.innerHTML = importsTable(imports, null)
    loadQuestions()
  })
  questionsEl.addEventListener('change', (e) => {
    if (e.target.matches('[data-select-all]')) {
      for (const d of registered) e.target.checked ? selected.add(d.id) : selected.delete(d.id)
    } else if (e.target.matches('[data-select]')) {
      e.target.checked ? selected.add(e.target.dataset.select) : selected.delete(e.target.dataset.select)
    } else return
    drawQuestions()
  })
  questionsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-edit]')
    if (b) openEditor(b.dataset.edit)
  })
  // ---- まとめて公開・削除（A-16b）----
  bulkEl.addEventListener('click', (e) => {
    const action = e.target.closest('[data-bulk]')?.dataset.bulk
    if (!action || selected.size === 0) return
    const picked = registered.filter((d) => selected.has(d.id))
    const ids = picked.map((d) => d.id)
    let message
    if (action === 'publish') {
      const ready = picked.filter((d) => isReviewable(d) && isPublishable(d)).length
      const rest = picked.length - ready
      message = `選んだ${picked.length}問のうち、公開できる形の${ready}問を公開します。学習者の出題に入ります${rest ? `。足りないところがある問題・公開済みの問題（${rest}問）はそのままです` : ''}`
    } else {
      const published = picked.filter((d) => d.status === 'published').length
      message = `選んだ${picked.length}問を削除します。下書き・要確認は元に戻せません${published ? `。公開済みの${published}問は出題から外し、学習者の解答の履歴は残ります` : ''}`
    }
    confirmDialog({
      title: action === 'publish' ? '選んだ問題を公開する' : '選んだ問題を削除する',
      message,
      confirmLabel: action === 'publish' ? '公開する' : '削除する',
      fallback: M_BULK_ERROR,
      run: async (close) => {
        const res = await api.apiPost('/admin/questions/bulk', { action, ids })
        close()
        const verb = action === 'publish' ? '公開した' : '削除した'
        await loadQuestions(`${Number(res.done)}問を${verb}${res.skipped ? `。${Number(res.skipped)}問はそのまま` : ''}`)
      }
    })
  })
  // ---- 修正（ダイアログ）----
  // 開いたときの一覧の下書き・要確認の並びを順番に見ていく。保存・公開・削除したら、その次の問題へ進む
  function openEditor(id) {
    let queue = registered.filter(isReviewable).map((d) => d.id)
    let index = queue.indexOf(id)
    if (index < 0) return
    const dlg = openDialog({ title: '問題を修正する', className: 'app-dialog-wide', mount: () => {} })
    const body = dlg.el.querySelector('.app-dialog-body')
    let dirty = false
    let tab = 'before'
    const current = () => registered.find((d) => d.id === queue[index])
    const finish = (text) => {
      dlg.close()
      return loadQuestions(text)
    }
    const draw = (text = '') => {
      const d = current()
      body.innerHTML = editorShell(d, index + 1, queue.length)
      dirty = false
      tab = 'before'
      const form = body.querySelector('.app-editor')
      const preview = body.querySelector('.app-preview-body')
      const drawPreview = () => {
        preview.innerHTML = previewHtml(readEditor(form), tab === 'after')
        body.querySelectorAll('[data-preview-tab]').forEach((t) => {
          const on = t.dataset.previewTab === tab
          t.setAttribute('aria-selected', String(on))
          on ? t.removeAttribute('tabindex') : t.setAttribute('tabindex', '-1')
        })
      }
      drawPreview()
      if (text) body.querySelector('.app-editor-msg').innerHTML = `<div class="app-notice" role="status">${escapeHtml(text)}</div>`
      form.addEventListener('input', () => { dirty = true; drawPreview() })
      form.addEventListener('change', () => { dirty = true; drawPreview() })
      body.querySelector('[role="tablist"]').addEventListener('click', (e) => {
        const t = e.target.closest('[data-preview-tab]')
        if (!t) return
        tab = t.dataset.previewTab
        drawPreview()
      })
      bindActions(form)
      body.querySelector('[data-field="body"]').focus()
    }
    // 一覧を読み直し、処理した問題を並びから外して次へ（最後までいったら閉じる）
    const advance = async (text) => {
      await loadQuestions()
      const alive = new Set(registered.filter(isReviewable).map((d) => d.id))
      const nextId = queue.slice(index + 1).find((x) => alive.has(x)) ?? null
      queue = queue.filter((x) => alive.has(x))
      if (!nextId) return finish(`${text}。レビューを待っている問題は最後まで見た`)
      index = queue.indexOf(nextId)
      draw(text)
      notice(text)
    }
    function bindActions(form) {
      const out = body.querySelector('.app-editor-msg')
      const busy = (on) => body.querySelectorAll('[data-action]').forEach((b) => { b.disabled = on })
      const move = (step) => {
        // 保存していない修正があるときは、もう一度押したら移る
        if (dirty && out.dataset.warned !== String(step)) {
          out.dataset.warned = String(step)
          out.innerHTML = '<div class="app-notice" role="status">保存していない修正がある。もう一度押すと、保存せずに移る</div>'
          return
        }
        index += step
        draw()
      }
      body.querySelector('[data-action="prev"]').addEventListener('click', () => move(-1))
      body.querySelector('[data-action="next"]').addEventListener('click', () => move(1))
      const save = () => api.apiPut(`/admin/questions/${encodeURIComponent(queue[index])}`, readEditor(form))
      body.querySelector('[data-action="save"]').addEventListener('click', async () => {
        busy(true)
        out.innerHTML = ''
        try {
          const res = await save()
          await advance(res.status === 'needs_review' ? '保存した。まだ足りないところがあるため「要確認」のまま' : '保存した')
        } catch (err) {
          out.innerHTML = errorBand(errorMessage(err, M_SAVE_ERROR))
          busy(false)
        }
      })
      body.querySelector('[data-action="publish"]').addEventListener('click', async () => {
        const q = readEditor(form)
        const v = validateQuestionDraft({ ...q, correct: q.correctChoice })
        if (!v.ok) {
          out.innerHTML = errorBand(`${M12}（足りないところ：${FIELD_LABEL[v.field] ?? v.field}）`)
          return
        }
        busy(true)
        out.innerHTML = ''
        try {
          const id = queue[index]
          await save()
          await api.apiPost(`/admin/questions/${encodeURIComponent(id)}/publish`)
          await advance('公開した。学習者の出題に入る')
        } catch (err) {
          out.innerHTML = errorBand(errorMessage(err, M_SAVE_ERROR))
          busy(false)
        }
      })
      body.querySelector('[data-action="delete"]').addEventListener('click', () => {
        const id = queue[index]
        confirmDialog({
          title: '問題を削除する',
          message: 'この下書きを削除します。元に戻せません',
          confirmLabel: '削除する',
          run: async (close) => {
            await api.apiDelete(`/admin/questions/${encodeURIComponent(id)}`)
            close()
            await advance('削除した')
          }
        })
      })
    }
    draw()
  }
  await loadImports()
  await loadQuestions()
}
