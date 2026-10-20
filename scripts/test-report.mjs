// モジュールテストの結果（Vitest の JSON・カバレッジ要約）とテスト仕様書から、テスト結果報告書（md・html）を作る
// 使い方：node scripts/test-report.mjs --results reports/vitest-results.json --coverage coverage/coverage-summary.json
//          --runs reports/stability.json --meta reports/meta.json --out documents
import { readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []))
const ROOT = resolve(import.meta.dirname, '..')
const SPEC_MD = join(ROOT, 'documents/モジュールテスト仕様書_RPG学習アプリ.md')
const SPEC_HTML = join(ROOT, 'documents/モジュールテスト仕様書_RPG学習アプリ.html')
const results = JSON.parse(readFileSync(args.results, 'utf8'))
const coverage = JSON.parse(readFileSync(args.coverage, 'utf8'))
const runs = JSON.parse(readFileSync(args.runs, 'utf8'))
const meta = JSON.parse(readFileSync(args.meta, 'utf8'))
const scope = meta.scopePrefixes // 例: ['U','D','G','A','M']
// ---- テスト仕様書からケースを読む ----
const spec = []
let mod = null
for (const line of readFileSync(SPEC_MD, 'utf8').split('\n')) {
  const h = /^####\s+(M-[A-Z]\d+(?:・M-[A-Z]\d+)?)\s+(.*)$/.exec(line)
  if (h) { mod = { id: h[1], title: h[2].replace(/`/g, '') }; continue }
  const r = /^\|\s*(MT-([A-Z])(\d+)-(\d+))\s*\|\s*([^|]*)\|/.exec(line)
  if (r && mod) {
    const cells = line.split('|').map((s) => s.trim())
    spec.push({ id: r[1], group: r[2], mid: `M-${r[2]}${r[3]}`, module: mod, view: r[5].trim(), tech: cells[cells.length - 2] })
  }
}
const inScope = spec.filter((c) => scope.includes(c.group))
// ---- 結果をケースIDごとにまとめる ----
const its = results.testResults.flatMap((f) => f.assertionResults.map((a) => ({ ...a, file: relative(ROOT, f.name) })))
const byId = new Map()
for (const it of its) {
  for (const id of new Set(it.fullName.match(/MT-[A-Z]\d+-\d+/g) ?? [])) {
    if (!byId.has(id)) byId.set(id, [])
    byId.get(id).push(it)
  }
}
const rows = inScope.map((c) => {
  const list = byId.get(c.id) ?? []
  const status = list.length === 0 ? '未実装' : list.every((t) => t.status === 'passed') ? '合格' : '不合格'
  return { ...c, its: list.length, status, file: list[0]?.file ?? '-' }
})
const supplementary = its.filter((t) => !/MT-[A-Z]\d+-\d+/.test(t.title) || t.title.includes('補足') || /補足/.test(t.ancestorTitles.join(' ')))
const count = (s) => rows.filter((r) => r.status === s).length
const total = { cases: rows.length, pass: count('合格'), fail: count('不合格'), missing: count('未実装') }
const itTotals = {
  total: results.numTotalTests, passed: results.numPassedTests, failed: results.numFailedTests,
  skipped: results.numPendingTests, todo: results.numTodoTests, files: results.numTotalTestSuites ?? results.testResults.length
}
// ---- カバレッジ ----
const pct = (n) => `${n.toFixed(2)}%`
const cov = Object.entries(coverage).filter(([k]) => k !== 'total').map(([k, v]) => ({ file: relative(ROOT, k), ...v }))
function sum(filter) {
  const list = cov.filter((c) => filter(c.file))
  const agg = (key) => {
    const covered = list.reduce((s, c) => s + c[key].covered, 0)
    const all = list.reduce((s, c) => s + c[key].total, 0)
    return all === 0 ? 100 : (100 * covered) / all
  }
  return { statements: agg('statements'), branches: agg('branches'), functions: agg('functions'), lines: agg('lines'), files: list.length }
}
const covGroups = [
  { name: '全体', f: () => true, th: null },
  { name: 'functions/shared/domain/**', f: (p) => p.startsWith('functions/shared/domain/'), th: [100, 100] },
  { name: 'web/js/logic/validators.js', f: (p) => p === 'web/js/logic/validators.js', th: [100, 100] },
  { name: 'functions/**', f: (p) => p.startsWith('functions/'), th: [90, 80] },
  { name: 'web/js/**', f: (p) => p.startsWith('web/js/'), th: [90, 80] }
].map((g) => ({ ...g, ...sum(g.f) })).filter((g) => g.files > 0)
const covOk = covGroups.every((g) => !g.th || (g.statements >= g.th[0] && g.branches >= g.th[1]))
// ---- モジュール別 ----
const modules = []
for (const r of rows) {
  let m = modules.find((x) => x.id === r.module.id)
  if (!m) modules.push(m = { id: r.module.id, title: r.module.title, cases: 0, pass: 0, fail: 0, missing: 0, its: 0 })
  m.cases++; m.its += r.its
  if (r.status === '合格') m.pass++; else if (r.status === '不合格') m.fail++; else m.missing++
}
const LAYERS = { U: 'util', D: 'db', G: 'domain', A: 'ai', M: 'mail', H: 'api-handler', W: 'ワーカー・バッチ', F: '画面（web/js）' }
const layerCounts = scope.map((g) => ({ g, name: LAYERS[g], n: rows.filter((r) => r.group === g).length }))
const stable = runs.length >= 3 && runs.every((r) => r.passed === runs[0].passed && r.failed === runs[0].failed && r.total === runs[0].total)
const maxMs = Math.max(...runs.map((r) => r.durationMs))
const judge = total.fail === 0 && total.missing === 0 && itTotals.failed === 0 && itTotals.skipped === 0 && itTotals.todo === 0 && covOk && stable && maxMs <= 60000
const failedList = rows.filter((r) => r.status !== '合格')
// ---- Markdown ----
const md = []
const p = (s = '') => md.push(s)
p(`# ${meta.title}`)
p()
p('| 項目 | 内容 |')
p('| --- | --- |')
p(`| 文書名 | ${meta.title} |`)
p(`| 版数 | ${meta.version} |`)
p(`| 作成日 | ${meta.date} |`)
p(`| 入力文書 | モジュールテスト仕様書 第0.2版、詳細設計書 第0.2版 |`)
p(`| 対象範囲 | ${meta.scopeLabel} |`)
p(`| 実行日時・コミット | ${meta.executedAt}、\`${meta.commit}\`（ブランチ \`${meta.branch}\`） |`)
p(`| 判定 | **${judge ? '合格' : '不合格'}**（対象範囲について、仕様書 6.2 の合否基準による） |`)
p()
p('---')
p()
p('## 1. 概要')
p()
p('### 1.1 目的')
p()
p(`モジュールテスト仕様書 第4〜5章のテストケースを Vitest で自動化して実行し、その結果を同書 6.2 の合否基準に照らして判定する。${meta.purposeNote}`)
p()
p('### 1.2 今回の範囲')
p()
p('```mermaid')
p('flowchart LR')
p(`  A["共通モジュール<br>util・db・domain・ai・mail<br>193ケース"]:::${scope.includes('U') ? 'done' : 'todo'} --> B["Lambda関数<br>api-handler・worker・batch"]:::${scope.includes('H') ? 'done' : 'todo'}`)
p(`  B --> C["画面<br>web/js/core・logic"]:::${scope.includes('F') ? 'done' : 'todo'}`)
p('  classDef done fill:#0017C1,color:#fff,stroke:#0017C1')
p('  classDef todo fill:#fff,color:#414141,stroke:#B4B4B4,stroke-dasharray:4 3')
p('```')
p()
p('| 区分 | 層 | 仕様書のケース数 | 今回 |')
p('| --- | --- | --- | --- |')
for (const [g, name] of Object.entries(LAYERS)) {
  const n = spec.filter((c) => c.group === g).length
  p(`| ${scope.includes(g) ? '対象' : '対象外（次回）'} | ${name}（MT-${g}） | ${n} | ${scope.includes(g) ? '実行' : '-'} |`)
}
p()
p('## 2. 実行環境')
p()
p('| 項目 | 内容 |')
p('| --- | --- |')
for (const [k, v] of meta.env) p(`| ${k} | ${v} |`)
p()
p('- 外部サービス（Aurora・Bedrock・SES）には接続せず、`aws-sdk-client-mock` で応答を差し替えた（仕様書 2.3）')
p('- `tests/helpers/vitest.setup.js` で `fetch` の既定をエラーにし、ネットワークへ出たテストは失敗する')
p()
p('## 3. 結果の要約')
p()
p('```mermaid')
p('pie showData title テストケースの結果')
p(`  "合格" : ${total.pass}`)
if (total.fail) p(`  "不合格" : ${total.fail}`)
if (total.missing) p(`  "未実装" : ${total.missing}`)
p('```')
p()
p('| 項目 | 結果 |')
p('| --- | --- |')
p(`| テストケース（仕様書のID） | ${total.cases}件中 合格 ${total.pass}・不合格 ${total.fail}・未実装 ${total.missing} |`)
p(`| 実行したテスト（\`it\` の数） | ${itTotals.total}件（成功 ${itTotals.passed}・失敗 ${itTotals.failed}・スキップ ${itTotals.skipped}・todo ${itTotals.todo}）、テストファイル ${results.testResults.length} |`)
p(`| うち補足テスト | ${supplementary.length}件（仕様書にない分岐を網羅するための追加。7.2 参照） |`)
p(`| 実行時間 | 最大 ${(maxMs / 1000).toFixed(2)} 秒（基準：60秒以内） |`)
p(`| 安定性 | 同じコミットで${runs.length}回実行し、${stable ? 'すべて同じ結果' : '結果が変わった'}（${runs.map((r) => `${r.passed}/${r.total}`).join('、')}） |`)
p(`| 失敗したテスト | ${failedList.length === 0 ? 'なし' : failedList.map((r) => r.id).join('、')} |`)
p()
p('## 4. カバレッジ')
p()
p('| 対象 | ファイル数 | 命令網羅（C0） | 分岐網羅（C1） | 関数 | 基準（C0／C1） | 判定 |')
p('| --- | --- | --- | --- | --- | --- | --- |')
for (const g of covGroups) {
  const ok = !g.th || (g.statements >= g.th[0] && g.branches >= g.th[1])
  p(`| ${g.name === '全体' ? '全体' : `\`${g.name}\``} | ${g.files} | ${pct(g.statements)} | ${pct(g.branches)} | ${pct(g.functions)} | ${g.th ? `${g.th[0]}%／${g.th[1]}%` : '-'} | ${g.th ? (ok ? '合格' : '不合格') : '-'} |`)
}
p()
p('**ファイル別**')
p()
p('| ファイル | C0 | C1 | 関数 |')
p('| --- | --- | --- | --- |')
for (const c of cov) p(`| \`${c.file}\` | ${pct(c.statements.pct)} | ${pct(c.branches.pct)} | ${pct(c.functions.pct)} |`)
p()
p('## 5. モジュール別の結果')
p()
p('| モジュール | 対象 | ケース | 合格 | 不合格 | 未実装 | it の数 |')
p('| --- | --- | --- | --- | --- | --- | --- |')
for (const m of modules) p(`| ${m.id} | \`${m.title}\` | ${m.cases} | ${m.pass} | ${m.fail} | ${m.missing} | ${m.its} |`)
p()
p('## 6. テストケース別の結果')
p()
for (const m of modules) {
  p(`### ${m.id} ${m.title}`)
  p()
  p('| ID | 観点 | 技法 | 結果 | it |')
  p('| --- | --- | --- | --- | --- |')
  for (const r of rows.filter((x) => x.module.id === m.id)) p(`| ${r.id} | ${r.view} | ${r.tech} | ${r.status} | ${r.its} |`)
  p()
}
p('## 7. 所見')
p()
p('### 7.1 不具合')
p()
for (const s of meta.defects) p(`- ${s}`)
p()
p('### 7.2 設計書・仕様書の解釈と補足')
p()
p('| No | 対象 | 内容 | 対応の提案 |')
p('| --- | --- | --- | --- |')
meta.notes.forEach((n, i) => p(`| ${i + 1} | ${n[0]} | ${n[1]} | ${n[2]} |`))
p()
p('## 8. 判定と次の作業')
p()
p('```mermaid')
p('flowchart TD')
p(`  A["全件成功<br>${total.pass}/${total.cases}"] --> B["カバレッジ基準<br>${covOk ? '達成' : '未達'}"]`)
p(`  B --> C["${runs.length}回続けて同じ結果<br>${stable ? 'はい' : 'いいえ'}"]`)
p(`  C --> D["${judge ? '合格' : '不合格'}"]`)
p('```')
p()
p('| 基準（仕様書 6.2） | 結果 | 判定 |')
p('| --- | --- | --- |')
p(`| テストケースがすべて実装され成功する（skip・todo 0件） | ${total.pass}/${total.cases}、skip ${itTotals.skipped}・todo ${itTotals.todo} | ${total.fail + total.missing + itTotals.skipped + itTotals.todo === 0 ? '合格' : '不合格'} |`)
p(`| カバレッジ（domain・validators 100%、そのほか 90%／80%以上） | 4章のとおり | ${covOk ? '合格' : '不合格'} |`)
p(`| 実行時間 60秒以内 | ${(maxMs / 1000).toFixed(2)} 秒 | ${maxMs <= 60000 ? '合格' : '不合格'} |`)
p(`| 安定性（3回続けて同じ結果） | ${stable ? '同じ' : '変わった'} | ${stable ? '合格' : '不合格'} |`)
p()
for (const s of meta.next) p(`- ${s}`)
p()
writeFileSync(join(args.out, `${meta.fileBase}.md`), md.join('\n'))
// ---- HTML ----
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
const style = /<style>[\s\S]*?<\/style>/.exec(readFileSync(SPEC_HTML, 'utf8'))[0]
const extraStyle = `<style>
.res { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; font-size: 13px; padding: 2px 10px; border-radius: 999px; white-space: nowrap; }
.res.ok { background: var(--blue-50); color: var(--blue-900); border: 1px solid var(--blue-200); }
.res.ng { background: var(--gray-900); color: var(--white); }
.judge { display: flex; gap: 20px; align-items: center; background: var(--white); border: 2px solid var(--blue-900); border-radius: var(--radius-12); padding: 20px 24px; }
.judge-mark { flex: none; width: 88px; height: 88px; border-radius: 50%; background: var(--blue-900); color: var(--white); display: grid; place-items: center; font-size: 22px; font-weight: 700; }
.judge-mark.ng { background: var(--gray-900); }
.judge-body p { margin: 0 0 4px; }
.judge-body .big { font-size: 20px; font-weight: 700; }
.donut { width: 132px; height: 132px; border-radius: 50%; display: grid; place-items: center; justify-self: center; }
.donut > div { width: 92px; height: 92px; border-radius: 50%; background: var(--white); display: grid; place-items: center; text-align: center; line-height: 1.2; }
.donut b { font-size: 24px; color: var(--blue-900); display: block; }
.donut small { font-size: 12px; color: var(--gray-600); }
.cov-row { display: grid; grid-template-columns: 220px 1fr 1fr; gap: 12px; align-items: center; font-size: 14px; }
.cov-row .meter { position: relative; height: 14px; background: var(--blue-100); border-radius: 999px; overflow: visible; }
.cov-row .meter span { display: block; height: 100%; background: var(--blue-900); border-radius: 999px; }
.cov-row .meter i { position: absolute; top: -4px; bottom: -4px; width: 2px; background: var(--gray-900); }
.cov-row .meter em { position: absolute; right: 6px; top: -1px; font-style: normal; font-size: 11px; font-weight: 700; color: var(--white); }
.cov-head { font-size: 12px; color: var(--gray-600); }
details.cases { border: 1px solid var(--gray-300); border-radius: var(--radius-8); margin: 0 0 12px; background: var(--white); }
details.cases summary { cursor: pointer; padding: 12px 16px; font-weight: 700; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
details.cases summary::marker { color: var(--blue-900); }
details.cases .table-wrap { margin: 0 12px 12px; }
.grid-ids { display: flex; flex-wrap: wrap; gap: 4px; }
.grid-ids span { width: 14px; height: 14px; border-radius: 3px; background: var(--blue-900); }
.grid-ids span.ng { background: var(--gray-900); }
.grid-ids span.todo { background: var(--white); border: 1px dashed var(--gray-300); }
td:first-child code { white-space: nowrap; overflow-wrap: normal; }
.res-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.res-tiles .tile-num { font-size: 30px; }
@media (max-width: 860px) { .cov-row { grid-template-columns: 1fr; } .judge { flex-direction: column; align-items: flex-start; } }
</style>`
const h = []
const H = (s) => h.push(s)
const icon = (name) => `<i class="fa-solid ${name} h-ico" aria-hidden="true"></i>`
const table = (head, body) => `<div class="table-wrap"><table><thead><tr>${head.map((x) => `<th>${inline(x)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((x) => `<td>${x}</td>`).join('')}</tr>`).join('\n')}</tbody></table></div>`
const resTag = (s) => `<span class="res ${s === '合格' ? 'ok' : 'ng'}"><i class="fa-solid ${s === '合格' ? 'fa-circle-check' : s === '不合格' ? 'fa-circle-xmark' : 'fa-circle-minus'}"></i>${s}</span>`
const toc = [['s1', '概要'], ['s2', '実行環境'], ['s3', '結果の要約'], ['s4', 'カバレッジ'], ['s5', 'モジュール別の結果'], ['s6', 'テストケース別の結果'], ['s7', '所見'], ['s8', '判定と次の作業']]
H(`<!DOCTYPE html>\n<html lang="ja">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${esc(meta.title)}</title>`)
H('<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>')
H('<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" crossorigin="anonymous" referrerpolicy="no-referrer">')
H('<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&amp;family=Noto+Sans+Mono&amp;display=swap" rel="stylesheet">')
H(style)
H(extraStyle)
H('</head>\n<body>')
H(`<header class="site-header"><div class="inner"><span class="eyebrow"><i class="fa-solid fa-flask-vial"></i> モジュールテスト結果</span><h1>${esc(meta.title)}</h1><ul class="meta">`)
H(`<li>版数<b>${esc(meta.version)}</b></li><li>作成日<b>${esc(meta.date)}</b></li><li>コミット<b>${esc(meta.commit)}</b></li><li>判定<b>${judge ? '合格' : '不合格'}</b></li></ul></div></header>`)
H('<div class="layout">\n<nav class="toc" aria-label="目次"><p>目次</p><ol>')
for (const [id, t] of toc) H(`<li><a href="#${id}">${toc.findIndex((x) => x[0] === id) + 1}. ${t}</a></li>`)
H('</ol></nav>\n<main>')
// 1
H(`<section class="chapter" id="s1"><h2>${icon('fa-circle-info')}1. 概要</h2>`)
H(`<div class="vis"><p class="vis-label">今回の範囲（全${spec.length}ケースのうち${rows.length}ケース）</p><ol class="flow">`)
H(`<li class="${scope.includes('U') ? 'hl' : ''}"><b><i class="fa-solid fa-cubes fi"></i>共通モジュール</b>util・db・domain・ai・mail　${spec.filter((c) => 'UDGAM'.includes(c.group)).length}ケース</li>`)
H(`<li class="${scope.includes('H') ? 'hl' : 'gate'}"><b><i class="fa-solid fa-bolt fi"></i>Lambda関数</b>api-handler・worker・batch　${spec.filter((c) => 'HW'.includes(c.group)).length}ケース</li>`)
H(`<li class="${scope.includes('F') ? 'hl' : 'gate'}"><b><i class="fa-solid fa-display fi"></i>画面</b>web/js/core・logic　${spec.filter((c) => c.group === 'F').length}ケース</li></ol>`)
H(`<p class="vis-cap">塗りつぶし＝今回テストした範囲、点線＝次回</p></div>`)
H(`<h3>${icon('fa-caret-right')}1.1 目的</h3><p>${inline(`モジュールテスト仕様書 第4〜5章のテストケースを Vitest で自動化して実行し、その結果を同書 6.2 の合否基準に照らして判定する。${meta.purposeNote}`)}</p>`)
H(`<h3>${icon('fa-caret-right')}1.2 今回の範囲</h3>`)
H(table(['区分', '層', '仕様書のケース数', '今回'], Object.entries(LAYERS).map(([g, name]) => [scope.includes(g) ? '対象' : '対象外（次回）', `${esc(name)}（MT-${g}）`, spec.filter((c) => c.group === g).length, scope.includes(g) ? '実行' : '-'])))
H(`<h3>${icon('fa-caret-right')}1.3 文書情報</h3>`)
H(table(['項目', '内容'], [['文書名', esc(meta.title)], ['版数', esc(meta.version)], ['入力文書', 'モジュールテスト仕様書 第0.2版、詳細設計書 第0.2版'], ['対象範囲', esc(meta.scopeLabel)], ['実行日時・コミット', `${esc(meta.executedAt)}、<code>${esc(meta.commit)}</code>（ブランチ <code>${esc(meta.branch)}</code>）`]]))
H('</section>')
// 2
H(`<section class="chapter" id="s2"><h2>${icon('fa-server')}2. 実行環境</h2>`)
H('<div class="vis"><p class="vis-label">テストの道具と差し替え</p><div class="vis-grid c2">')
H('<div class="card em"><h5><i class="fa-solid fa-check"></i>本物のまま動かす</h5><div class="chips"><span class="chip">domain/*</span><span class="chip">validators</span><span class="chip">ids</span><span class="chip">date-jst</span><span class="chip">json-guard</span><span class="chip">prompts</span><span class="chip">templates</span></div><p class="note">純粋関数は入力と出力だけで確かめた</p></div>')
H('<div class="card dash"><h5><i class="fa-solid fa-masks-theater"></i>モックに差し替える</h5><div class="chips"><span class="chip">RDS Data API</span><span class="chip">Bedrock Runtime</span><span class="chip">SES</span><span class="chip">時計（偽の時計）</span><span class="chip">乱数</span><span class="chip">fetch</span></div><p class="note">aws-sdk-client-mock・vi.useFakeTimers</p></div>')
H('</div></div>')
H(table(['項目', '内容'], meta.env.map(([k, v]) => [esc(k), inline(v)])))
H('<ul><li>外部サービス（Aurora・Bedrock・SES）には接続せず、<code>aws-sdk-client-mock</code> で応答を差し替えた（仕様書 2.3）</li><li><code>tests/helpers/vitest.setup.js</code> で <code>fetch</code> の既定をエラーにし、ネットワークへ出たテストは失敗する</li></ul></section>')
// 3
const passDeg = (360 * total.pass) / total.cases
H(`<section class="chapter" id="s3"><h2>${icon('fa-square-poll-vertical')}3. 結果の要約</h2>`)
H('<div class="vis"><p class="vis-label">テストケースの結果</p><div class="vis-grid c1">')
H(`<div class="donut" style="background: conic-gradient(var(--blue-900) 0 ${passDeg}deg, var(--gray-900) ${passDeg}deg 360deg)"><div><span><b>${total.pass}</b><small>／${total.cases} 合格</small></span></div></div>`)
H('<div class="res-tiles">')
H(`<div class="card tile strong"><p class="tile-num">${total.pass}<small>件</small></p><p class="tile-cap">合格したケース</p></div>`)
H(`<div class="card tile"><p class="tile-num sm">${total.fail + total.missing}<small>件</small></p><p class="tile-cap">不合格・未実装</p></div>`)
H(`<div class="card tile"><p class="tile-num sm">${itTotals.total}<small>件</small></p><p class="tile-cap">実行した it（補足 ${supplementary.length}）</p></div>`)
H(`<div class="card tile"><p class="tile-num sm">${(maxMs / 1000).toFixed(1)}<small>秒</small></p><p class="tile-cap">実行時間（基準 60秒）</p></div>`)
H('</div></div>')
H(`<div class="grid-ids" aria-label="ケースごとの結果">${rows.map((r) => `<span class="${r.status === '合格' ? '' : r.status === '不合格' ? 'ng' : 'todo'}" title="${r.id} ${esc(r.view)}：${r.status}"></span>`).join('')}</div><p class="vis-cap">1マス＝1ケース（青＝合格）</p></div>`)
H(table(['項目', '結果'], [
  ['テストケース（仕様書のID）', `${total.cases}件中 合格 ${total.pass}・不合格 ${total.fail}・未実装 ${total.missing}`],
  ['実行したテスト（<code>it</code> の数）', `${itTotals.total}件（成功 ${itTotals.passed}・失敗 ${itTotals.failed}・スキップ ${itTotals.skipped}・todo ${itTotals.todo}）、テストファイル ${results.testResults.length}`],
  ['うち補足テスト', `${supplementary.length}件（仕様書にない分岐を網羅するための追加。7.2 参照）`],
  ['実行時間', `最大 ${(maxMs / 1000).toFixed(2)} 秒（基準：60秒以内）`],
  ['安定性', `同じコミットで${runs.length}回実行し、${stable ? 'すべて同じ結果' : '結果が変わった'}（${runs.map((r) => `${r.passed}/${r.total}`).join('、')}）`],
  ['失敗したテスト', failedList.length === 0 ? 'なし' : failedList.map((r) => r.id).join('、')]
]))
H('</section>')
// 4
H(`<section class="chapter" id="s4"><h2>${icon('fa-chart-simple')}4. カバレッジ</h2>`)
H('<div class="vis"><p class="vis-label">基準（縦線）に対する到達度</p><div class="bars">')
H('<div class="cov-row cov-head"><span>対象</span><span>命令網羅（C0）</span><span>分岐網羅（C1）</span></div>')
for (const g of covGroups) {
  const m = (v, t) => `<div class="meter"><span style="width:${Math.min(v, 100)}%"></span>${t ? `<i style="left:${t}%"></i>` : ''}<em>${v.toFixed(1)}%</em></div>`
  H(`<div class="cov-row"><span class="bl"><code>${esc(g.name)}</code></span>${m(g.statements, g.th?.[0])}${m(g.branches, g.th?.[1])}</div>`)
}
H('</div></div>')
H(table(['対象', 'ファイル数', '命令網羅（C0）', '分岐網羅（C1）', '関数', '基準（C0／C1）', '判定'], covGroups.map((g) => {
  const ok = !g.th || (g.statements >= g.th[0] && g.branches >= g.th[1])
  return [g.name === '全体' ? '全体' : `<code>${esc(g.name)}</code>`, g.files, pct(g.statements), pct(g.branches), pct(g.functions), g.th ? `${g.th[0]}%／${g.th[1]}%` : '-', g.th ? resTag(ok ? '合格' : '不合格') : '-']
})))
H(`<h3>${icon('fa-caret-right')}ファイル別</h3>`)
H(table(['ファイル', 'C0', 'C1', '関数'], cov.map((c) => [`<code>${esc(c.file)}</code>`, pct(c.statements.pct), pct(c.branches.pct), pct(c.functions.pct)])))
H('</section>')
// 5
const maxCases = Math.max(...layerCounts.map((l) => l.n))
H(`<section class="chapter" id="s5"><h2>${icon('fa-layer-group')}5. モジュール別の結果</h2>`)
H('<div class="vis"><p class="vis-label">層ごとの合格ケース数</p><div class="bars">')
for (const l of layerCounts) {
  const passN = rows.filter((r) => r.group === l.g && r.status === '合格').length
  H(`<div class="bar-row"><span class="bl">${esc(l.name)}（MT-${l.g}）</span><div class="bt"><span style="width:${(100 * passN) / maxCases}%"></span></div><b>${passN}/${l.n}</b></div>`)
}
H('</div></div>')
H(table(['モジュール', '対象', 'ケース', '合格', '不合格', '未実装', 'it の数'], modules.map((m) => [m.id, `<code>${esc(m.title)}</code>`, m.cases, m.pass, m.fail, m.missing, m.its])))
H('</section>')
// 6
H(`<section class="chapter" id="s6"><h2>${icon('fa-list-check')}6. テストケース別の結果</h2>`)
H(`<div class="vis"><p class="vis-label">見方</p><div class="info-strip">${resTag('合格')}<span>仕様書のIDを含む it がすべて成功</span>${resTag('不合格')}<span>1つでも失敗</span>${resTag('未実装')}<span>IDを含む it がない</span></div></div>`)
for (const m of modules) {
  H(`<details class="cases"${m.fail + m.missing ? ' open' : ''}><summary>${esc(m.id)} <code>${esc(m.title)}</code> ${resTag(m.fail + m.missing ? '不合格' : '合格')}<span>${m.pass}/${m.cases}</span></summary>`)
  H(table(['ID', '観点', '技法', '結果', 'it'], rows.filter((x) => x.module.id === m.id).map((r) => [r.id, inline(r.view), esc(r.tech), resTag(r.status), r.its])))
  H('</details>')
}
H('</section>')
// 7
H(`<section class="chapter" id="s7"><h2>${icon('fa-magnifying-glass')}7. 所見</h2>`)
H(`<div class="vis"><p class="vis-label">見つかったこと</p><div class="vis-grid c2"><div class="card"><h5><i class="fa-solid fa-bug"></i>製品コードの不具合</h5><p class="tile-num sm">${meta.defectCount}<small>件</small></p></div><div class="card"><h5><i class="fa-solid fa-pen-ruler"></i>設計の解釈・補足</h5><p class="tile-num sm">${meta.notes.length}<small>件</small></p></div></div></div>`)
H(`<h3>${icon('fa-caret-right')}7.1 不具合</h3><ul>${meta.defects.map((s) => `<li>${inline(s)}</li>`).join('')}</ul>`)
H(`<h3>${icon('fa-caret-right')}7.2 設計書・仕様書の解釈と補足</h3>`)
H(table(['No', '対象', '内容', '対応の提案'], meta.notes.map((n, i) => [i + 1, inline(n[0]), inline(n[1]), inline(n[2])])))
H('</section>')
// 8
H(`<section class="chapter" id="s8"><h2>${icon('fa-gavel')}8. 判定と次の作業</h2>`)
H(`<div class="vis"><div class="judge"><div class="judge-mark ${judge ? '' : 'ng'}">${judge ? '合格' : '不合格'}</div><div class="judge-body"><p class="big">${esc(meta.scopeLabel)}</p><p>${judge ? '仕様書 6.2 の合否基準をすべて満たした' : '合否基準を満たしていない項目がある'}</p></div></div></div>`)
H(table(['基準（仕様書 6.2）', '結果', '判定'], [
  ['テストケースがすべて実装され成功する（skip・todo 0件）', `${total.pass}/${total.cases}、skip ${itTotals.skipped}・todo ${itTotals.todo}`, resTag(total.fail + total.missing + itTotals.skipped + itTotals.todo === 0 ? '合格' : '不合格')],
  ['カバレッジ（domain・validators 100%、そのほか 90%／80%以上）', '4章のとおり', resTag(covOk ? '合格' : '不合格')],
  ['実行時間 60秒以内', `${(maxMs / 1000).toFixed(2)} 秒`, resTag(maxMs <= 60000 ? '合格' : '不合格')],
  ['安定性（3回続けて同じ結果）', stable ? '同じ' : '変わった', resTag(stable ? '合格' : '不合格')]
]))
H(`<ul>${meta.next.map((s) => `<li>${inline(s)}</li>`).join('')}</ul></section>`)
H(`</main>\n</div>\n<footer class="site-footer"><div class="inner">${esc(meta.title)} ${esc(meta.version)}</div></footer>\n</body>\n</html>\n`)
writeFileSync(join(args.out, `${meta.fileBase}.html`), h.join('\n'))
console.log(JSON.stringify({ judge, total, itTotals, supplementary: supplementary.length, covOk, stable, maxMs }))
