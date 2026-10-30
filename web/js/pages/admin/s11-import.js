// S-11 問題取り込み・レビュー（詳細設計書 6.2）
// 取り込み：A-13 → PDF・画像は署名付きURLへ PUT。取り込み状況は5秒ごとに再取得し、待機中・抽出中がなくなったら止める
// 下書き：A-14 の drafts をそのまま修正画面に使い、A-15 で保存・削除、A-16 で公開する。A-16b で公開できる下書きをまとめて公開する
// 登録済みの問題：A-15b でコースの問題を状態ごとに一覧にし、A-15（DELETE）で削除する
import { getContext } from '../../core/context.js'
import { button } from '../../components/button.js'
import { openDialog } from '../../components/dialog.js'
import { loading, errorBand, errorMessage } from '../../components/status.js'
import { CHOICE_KEYS } from '../../components/choice-option.js'
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
<div class="app-toolbar app-toolbar-end">${button({ label: '取り込む', attrs: 'data-action="import" disabled' })}</div></section>`
}
function importsTable(list, selected) {
  if (list.length === 0) return '<p class="body">まだ取り込みがない</p>'
  const rows = list.map((j) => `<tr${j.importId === selected ? ' aria-current="true" class="app-row-on"' : ''}>
<td>${escapeHtml(formatDateTime(j.createdAt))}</td><td>${escapeHtml(j.fileName)}<span class="meta">（${SOURCE_LABEL[j.sourceType] ?? ''}）</span></td>
<td><span class="app-status app-status-${escapeHtml(j.status)}">${STATUS_LABEL[j.status] ?? escapeHtml(j.status)}</span>${j.errorMessage ? `<p class="meta">${escapeHtml(j.errorMessage)}</p>` : ''}</td>
<td class="app-num">${Number(j.extractedCount ?? 0)}問</td>
<td>${j.status === 'done' ? button({ label: '下書きを見る', size: 'sm', attrs: `data-open-import="${escapeHtml(j.importId)}"` }) : ''}</td></tr>`).join('')
  return `<table class="app-table"><thead><tr><th scope="col">受け付けた日時</th><th scope="col">ファイル</th><th scope="col">状態</th><th scope="col" class="app-num">抽出件数</th><th scope="col"><span class="app-sr-only">操作</span></th></tr></thead><tbody>${rows}</tbody></table>`
}
// 公開できる形の下書き（選択肢4つ・正解・解説がそろっている）
export const publishableDrafts = (drafts) => drafts.filter((d) => validateQuestionDraft({ ...d, correct: d.correctChoice }).ok)
function draftsTable(drafts, editing) {
  if (drafts.length === 0) return '<p class="body">修正を待っている下書きはない</p>'
  const ready = publishableDrafts(drafts).length
  const bulk = `<div class="app-toolbar app-toolbar-end"><span class="meta">公開できる下書き：${ready}問／${drafts.length}問</span>${button({ label: 'まとめて公開する', variant: 'primary', size: 'sm', attrs: `data-action="publish-all"${ready === 0 ? ' disabled' : ''}` })}</div>`
  const rows = drafts.map((d) => `<tr${d.id === editing ? ' aria-current="true" class="app-row-on"' : ''}>
<td>${escapeHtml(d.bodyHead)}${[...d.body].length > 40 ? '…' : ''}</td><td>${d.choiceCount === 4 ? '四肢択一' : `選択肢${Number(d.choiceCount)}つ`}</td>
<td class="app-num">${Number(d.keywordCount)}</td><td><span class="app-status app-status-${escapeHtml(d.status)}">${DRAFT_LABEL[d.status] ?? escapeHtml(d.status)}</span></td>
<td>${button({ label: '修正する', size: 'sm', attrs: `data-edit="${escapeHtml(d.id)}"` })}</td></tr>`).join('')
  return `${bulk}<table class="app-table"><thead><tr><th scope="col">問題文の先頭</th><th scope="col">形式</th><th scope="col" class="app-num">キーワード</th><th scope="col">状態</th><th scope="col"><span class="app-sr-only">操作</span></th></tr></thead><tbody>${rows}</tbody></table>`
}
const QUESTION_FILTER = { '': 'すべて', published: '公開済み', draft: '下書き', needs_review: '要確認' }
function questionFilter(value) {
  const opts = Object.entries(QUESTION_FILTER).map(([v, l]) => `<option value="${v}"${v === value ? ' selected' : ''}>${l}</option>`).join('')
  return `<label class="app-field"><span class="label">状態</span><select class="app-input body" data-question-filter>${opts}</select></label>`
}
// 登録済みの問題。「中身を見る」で問題文・選択肢・正解・解説・キーワードを開く
function questionsTable(list) {
  if (list.length === 0) return '<p class="body">この条件の問題はない</p>'
  const detail = (d) => {
    const choices = d.choices.map((c, i) => `<li>${CHOICE_KEYS[i] ?? i + 1}　${escapeHtml(c)}${d.correctChoice === i + 1 ? '<span class="meta">（正解）</span>' : ''}</li>`).join('')
    return `<details class="app-source"><summary class="meta">中身を見る</summary><p class="body">${escapeHtml(d.body)}</p><ul class="app-list body">${choices}</ul>
<p class="meta">解説：${escapeHtml(d.explanation || '（なし）')}</p><p class="meta">キーワード：${escapeHtml(d.keywords.join('、') || '（なし）')}</p></details>`
  }
  const rows = list.map((d) => `<tr><td>${escapeHtml(d.bodyHead)}${[...d.body].length > 40 ? '…' : ''}${detail(d)}</td>
<td class="app-num">${Number(d.keywordCount)}</td><td><span class="app-status app-status-${escapeHtml(d.status)}">${DRAFT_LABEL[d.status] ?? escapeHtml(d.status)}</span></td>
<td>${button({ label: '削除する', variant: 'quiet', size: 'sm', attrs: `data-delete-question="${escapeHtml(d.id)}"` })}</td></tr>`).join('')
  return `<p class="meta">${list.length}問</p><table class="app-table"><thead><tr><th scope="col">問題文の先頭</th><th scope="col" class="app-num">キーワード</th><th scope="col">状態</th><th scope="col"><span class="app-sr-only">操作</span></th></tr></thead><tbody>${rows}</tbody></table>`
}
// 確認ダイアログ。「やめる」で閉じ、確定ボタンで run を呼ぶ。失敗したらダイアログの中に出す
function confirmDialog({ title, message, confirmLabel, run }) {
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
          body.querySelector('.app-dialog-msg').innerHTML = errorBand(errorMessage(err, M_SAVE_ERROR))
          e.target.disabled = false
        }
      })
    }
  })
}
function editor(d) {
  const choices = CHOICE_KEYS.map((k, i) => `<div class="app-choice-edit"><label class="app-radio"><input type="radio" name="correct" value="${i + 1}"${d.correctChoice === i + 1 ? ' checked' : ''}> 正解</label>
<label class="app-field"><span class="label">${k}</span><input class="app-input body" data-choice-input="${i}" value="${escapeHtml(d.choices[i] ?? '')}"></label></div>`).join('')
  const extra = d.choices.length > 4 ? `<div class="app-notice" role="status">抽出した選択肢が${d.choices.length}つあった。5つ目からは表示していない。4つに整えて保存してください</div>` : ''
  const kws = [0, 1, 2].map((i) => `<input class="app-input body" data-keyword-input="${i}" maxlength="50" aria-label="キーワード${i + 1}" value="${escapeHtml(d.keywords[i] ?? '')}">`).join('')
  return `<section class="gd-card app-section app-editor" aria-labelledby="editor-h"><h2 id="editor-h" class="label">問題を修正する</h2>${extra}
<label class="app-field"><span class="label">問題文</span><textarea class="app-textarea body" rows="5" data-field="body">${escapeHtml(d.body)}</textarea></label>
<fieldset class="app-choices-edit"><legend class="label">選択肢と正解</legend>${choices}</fieldset>
<label class="app-field"><span class="label">解説</span><textarea class="app-textarea body" rows="4" data-field="explanation">${escapeHtml(d.explanation ?? '')}</textarea></label>
<fieldset class="app-keywords"><legend class="label">キーワード（3つまで、各50文字まで）</legend>${kws}</fieldset>
<div class="app-editor-msg"></div>
<div class="app-toolbar app-toolbar-end">${button({ label: '削除する', variant: 'quiet', attrs: 'data-action="delete"' })}${button({ label: '保存する', attrs: 'data-action="save"' })}${button({ label: '公開する', variant: 'primary', attrs: 'data-action="publish"' })}</div></section>`
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
<section class="app-section" aria-labelledby="drafts-h" data-drafts hidden><h2 id="drafts-h" class="label">下書き一覧</h2><div class="app-drafts"></div></section>
<div class="app-editor-slot"></div>
<section class="app-section" aria-labelledby="questions-h"><h2 id="questions-h" class="label">登録済みの問題</h2>
<div class="app-toolbar">${questionFilter('')}</div><div class="app-questions-msg"></div><div class="app-questions">${loading()}</div></section>`
  bindCourseSelect(root, { path: '/admin/import', setState, go })
  const listEl = root.querySelector('.app-imports')
  let imports = []
  let selected = params.import ?? null
  let drafts = []
  let editing = null
  let timer = null
  // ---- 取り込み状況（5秒ごと）----
  const loadImports = async () => {
    clearTimeout(timer)
    if (!listEl.isConnected) return // 別の画面に移ったら止める
    try {
      imports = (await api.apiGet(`/admin/imports?course=${encodeURIComponent(courseId)}`)).imports ?? []
      listEl.innerHTML = importsTable(imports, selected)
    } catch (err) {
      listEl.innerHTML = errorBand(errorMessage(err, M_LIST_ERROR))
      return
    }
    if (running(imports)) timer = setTimeout(loadImports, POLL_MS)
  }
  listEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-open-import]')
    if (b) openImport(b.dataset.openImport)
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
  // ---- 下書きと修正 ----
  const draftsSection = root.querySelector('[data-drafts]')
  const draftsEl = root.querySelector('.app-drafts')
  const editorSlot = root.querySelector('.app-editor-slot')
  const drawDrafts = () => { draftsEl.innerHTML = draftsTable(drafts, editing?.id) }
  async function openImport(importId, notice = '') {
    selected = importId
    editing = null
    editorSlot.innerHTML = ''
    if (imports.length) listEl.innerHTML = importsTable(imports, selected)
    draftsSection.hidden = false
    draftsEl.innerHTML = loading()
    try {
      drafts = (await api.apiGet(`/admin/imports/${encodeURIComponent(importId)}`)).drafts ?? []
      draftsEl.innerHTML = `${notice ? `<div class="app-notice" role="status">${escapeHtml(notice)}</div>` : ''}${draftsTable(drafts, null)}`
    } catch (err) {
      draftsEl.innerHTML = errorBand(errorMessage(err, M_LIST_ERROR))
    }
  }
  draftsEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="publish-all"]')) return publishAll()
    const b = e.target.closest('[data-edit]')
    if (!b) return
    editing = drafts.find((d) => d.id === b.dataset.edit)
    drawDrafts()
    editorSlot.innerHTML = editor(editing)
    bindEditor(editorSlot.querySelector('.app-editor'))
    editorSlot.querySelector('textarea').focus()
  })
  function publishAll() {
    const ready = publishableDrafts(drafts).length
    const rest = drafts.length - ready
    confirmDialog({
      title: '下書きをまとめて公開する',
      message: `公開できる形の下書き${ready}問を公開します。学習者の出題に入ります${rest ? `。足りないところがある${rest}問は下書きのまま残します` : ''}`,
      confirmLabel: '公開する',
      run: async (close) => {
        const res = await api.apiPost(`/admin/imports/${encodeURIComponent(selected)}/publish`)
        close()
        await openImport(selected, `${Number(res.published)}問を公開した${res.skipped ? `。${Number(res.skipped)}問は足りないところがあるため残した` : ''}`)
        await loadQuestions()
      }
    })
  }
  function bindEditor(el) {
    const out = el.querySelector('.app-editor-msg')
    const buttons = () => el.querySelectorAll('[data-action]')
    const busy = (on) => buttons().forEach((b) => { b.disabled = on })
    const save = async () => api.apiPut(`/admin/questions/${encodeURIComponent(editing.id)}`, readEditor(el))
    el.querySelector('[data-action="save"]').addEventListener('click', async () => {
      busy(true)
      out.innerHTML = ''
      try {
        const res = await save()
        await openImport(selected, res.status === 'needs_review' ? '保存した。まだ足りないところがあるため「要確認」のまま' : '保存した')
        await loadQuestions()
      } catch (err) {
        out.innerHTML = errorBand(errorMessage(err, M_SAVE_ERROR))
        busy(false)
      }
    })
    el.querySelector('[data-action="publish"]').addEventListener('click', async () => {
      const q = readEditor(el)
      const v = validateQuestionDraft({ ...q, correct: q.correctChoice })
      if (!v.ok) {
        out.innerHTML = errorBand(`${M12}（足りないところ：${FIELD_LABEL[v.field] ?? v.field}）`)
        return
      }
      busy(true)
      out.innerHTML = ''
      try {
        await save()
        await api.apiPost(`/admin/questions/${encodeURIComponent(editing.id)}/publish`)
        await openImport(selected, '公開した。学習者の出題に入る')
        await loadQuestions()
      } catch (err) {
        out.innerHTML = errorBand(errorMessage(err, M_SAVE_ERROR))
        busy(false)
      }
    })
    el.querySelector('[data-action="delete"]').addEventListener('click', () => {
      confirmDialog({
        title: '問題を削除する',
        message: 'この下書きを削除します。元に戻せません',
        confirmLabel: '削除する',
        run: async (close) => {
          await api.apiDelete(`/admin/questions/${encodeURIComponent(editing.id)}`)
          close()
          await openImport(selected, '削除した')
          await loadQuestions()
        }
      })
    })
  }
  // ---- 登録済みの問題 ----
  const questionsEl = root.querySelector('.app-questions')
  const questionsMsg = root.querySelector('.app-questions-msg')
  const filterEl = root.querySelector('[data-question-filter]')
  let registered = []
  async function loadQuestions(notice = '') {
    const status = filterEl.value
    questionsMsg.innerHTML = notice ? `<div class="app-notice" role="status">${escapeHtml(notice)}</div>` : ''
    try {
      registered = (await api.apiGet(`/admin/questions?course=${encodeURIComponent(courseId)}${status ? `&status=${encodeURIComponent(status)}` : ''}`)).questions ?? []
      questionsEl.innerHTML = questionsTable(registered)
    } catch (err) {
      questionsEl.innerHTML = errorBand(errorMessage(err, M_QUESTIONS_ERROR))
    }
  }
  filterEl.addEventListener('change', () => loadQuestions())
  questionsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-delete-question]')
    if (!b) return
    const target = registered.find((d) => d.id === b.dataset.deleteQuestion)
    if (!target) return
    const published = target.status === 'published'
    confirmDialog({
      title: '問題を削除する',
      message: published
        ? 'この問題を出題から外します。学習者の解答の履歴は残ります。元に戻せません'
        : 'この下書きを削除します。元に戻せません',
      confirmLabel: '削除する',
      run: async (close) => {
        await api.apiDelete(`/admin/questions/${encodeURIComponent(target.id)}`)
        close()
        if (editing?.id === target.id) editorSlot.innerHTML = ''
        if (selected && !draftsSection.hidden) await openImport(selected)
        await loadQuestions(published ? '出題から外した' : '削除した')
      }
    })
  })
  await loadImports()
  if (selected) await openImport(selected)
  await loadQuestions()
}
