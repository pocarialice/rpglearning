// テストを流してテスト結果報告書（md・html）を作り直す（モジュールテスト仕様書 6.2・6.4）
// 1. 同じコミットで3回続けて流し、結果と時間を比べる（安定性・実行時間）
// 2. カバレッジ付きで流す（3回目の結果を報告書のケース別の結果に使う）
// 3. scripts/test-report.mjs で documents/ に書き出す。所見・判定の文・変更履歴は scripts/test-report.meta.json に書く
// 使い方：npm run test:report
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
const ROOT = resolve(import.meta.dirname, '..')
const REPORTS = join(ROOT, 'reports')
mkdirSync(REPORTS, { recursive: true })
const vitest = (args) => {
  try {
    execFileSync('npx', ['vitest', 'run', ...args], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] })
  } catch {
    // 失敗しても結果の JSON は書かれる。報告書で不合格として扱う
  }
}
const runs = []
for (let i = 1; i <= 3; i++) {
  const out = join(REPORTS, `vitest-run-${i}.json`)
  vitest(['--reporter=json', `--outputFile=${out}`, ...(i === 3 ? ['--coverage'] : [])])
  const r = JSON.parse(readFileSync(out, 'utf8'))
  const end = Math.max(...r.testResults.map((t) => t.endTime))
  runs.push({ total: r.numTotalTests, passed: r.numPassedTests, failed: r.numFailedTests, durationMs: Math.round(end - r.startTime) })
  console.log(`run ${i}: ${r.numPassedTests}/${r.numTotalTests}（${((end - r.startTime) / 1000).toFixed(2)} 秒）`)
}
writeFileSync(join(REPORTS, 'stability.json'), JSON.stringify(runs, null, 2))
execFileSync('node', [join(ROOT, 'scripts/test-report.mjs'),
  '--results', join(REPORTS, 'vitest-run-3.json'),
  '--coverage', join(ROOT, 'coverage/coverage-summary.json'),
  '--runs', join(REPORTS, 'stability.json'),
  '--meta', join(ROOT, 'scripts/test-report.meta.json'),
  '--out', join(ROOT, 'documents')], { cwd: ROOT, stdio: 'inherit' })
