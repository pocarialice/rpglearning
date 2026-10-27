// 画面を dist/web-{env}/ に組み立てる（詳細設計書 11.4）。config の差し込みと、sw.js のキャッシュ名へのリリース番号の埋め込み
// 使い方：npm run build:web -- --env=dev --release=20261105-01（--env を省くと dev・prod の両方を作る。--release を省くと local-{日付}）
import { cp, mkdir, readFile, rm, writeFile, appendFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
const ENVS = ['dev', 'prod']
const ROOT = resolve(import.meta.dirname, '..')
const SRC = join(ROOT, 'web')
const PLACEHOLDER = '__RELEASE__'
const RELEASE_RE = /^[A-Za-z0-9._-]{1,40}$/
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
async function replaceIn(file, release) {
  const text = await readFile(file, 'utf8')
  if (!text.includes(PLACEHOLDER)) throw new Error(`${file} に ${PLACEHOLDER} がありません`)
  await writeFile(file, text.replaceAll(PLACEHOLDER, release))
}
async function buildWeb(env, release) {
  if (!ENVS.includes(env)) throw new Error(`--env は ${ENVS.join('・')} のどれかにしてください: ${env}`)
  if (!RELEASE_RE.test(release)) throw new Error(`リリース番号の形が正しくありません: ${release}`)
  const out = join(ROOT, `dist/web-${env}`)
  await rm(out, { recursive: true, force: true })
  await mkdir(out, { recursive: true })
  // config/ は配信しない（その環境の分だけ js/config.js として置く）
  await cp(SRC, out, { recursive: true, filter: (src) => !src.startsWith(join(SRC, 'config')) })
  await cp(join(SRC, `config/config.${env}.js`), join(out, 'js/config.js'))
  await replaceIn(join(out, 'js/config.js'), release)
  await replaceIn(join(out, 'sw.js'), release)
  const config = await readFile(join(out, 'js/config.js'), 'utf8')
  if (!config.includes(`env: '${env}'`)) throw new Error(`js/config.js が ${env} の設定になっていません`)
  return out
}
async function main() {
  const env = arg('env')
  const release = arg('release') ?? process.env.RELEASE_NO ?? `local-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}`
  const rows = []
  for (const e of env ? [env] : ENVS) rows.push([e, await buildWeb(e, release)])
  for (const [e, out] of rows) console.log(`web-${e}: ${out}（リリース ${release}）`)
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = ['### 画面のビルド', '', '| 環境 | 出力先 | リリース |', '| --- | --- | --- |', ...rows.map(([e]) => `| ${e} | dist/web-${e}/ | ${release} |`), '']
    await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n')
  }
}
main().catch((err) => {
  console.error(err)
  process.exit(1)
})
