// Lambda 4関数をそれぞれ1つの index.mjs に束ね、dist/functions/{関数名}.zip を作る（詳細設計書 11.4）
// 使い方：npm run build:functions（--verify を付けると、束ねたファイルを読み込んで handler があることを確かめる）
import { build } from 'esbuild'
import { ZipArchive } from 'archiver'
import { createWriteStream } from 'node:fs'
import { mkdir, rm, stat, appendFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
export const FUNCTIONS = ['api-handler', 'grading-worker', 'import-worker', 'batch-runner']
// Lambda の API で zip を直接アップロードできる上限
export const MAX_ZIP_BYTES = 50 * 1024 * 1024
const ROOT = resolve(import.meta.dirname, '..')
const BUILD_DIR = join(ROOT, 'dist/build')
const ZIP_DIR = join(ROOT, 'dist/functions')
async function bundle(name) {
  const outfile = join(BUILD_DIR, name, 'index.mjs')
  await build({
    entryPoints: [join(ROOT, `functions/${name}/index.mjs`)],
    bundle: true, platform: 'node', target: 'node22', format: 'esm',
    outfile,
    external: ['@aws-sdk/*'], // ランタイム同梱のSDKを使う
    banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
    minify: false, sourcemap: 'inline', // 障害時にスタックの行番号が分かるようにする
    logLevel: 'warning'
  })
  return outfile
}
// zip の直下に index.mjs を置く
function zip(file, zipPath) {
  return new Promise((done, fail) => {
    const out = createWriteStream(zipPath)
    const archive = new ZipArchive({ zlib: { level: 9 } })
    out.on('close', done)
    archive.on('error', fail)
    archive.pipe(out)
    archive.file(file, { name: 'index.mjs' })
    archive.finalize()
  })
}
// 束ねたファイルを読み込み、依存の取り込み漏れがないことと handler があることを確かめる
async function verify(file) {
  const mod = await import(pathToFileURL(file).href)
  if (typeof mod.handler !== 'function') throw new Error(`${file} に handler がありません`)
}
// verify で読み込むときに index.mjs が求める環境変数（値はダミー。AWS には接続しない）
const VERIFY_ENV = {
  APP_ENV: 'dev', DB_CLUSTER_ARN: 'arn:verify', DB_SECRET_ARN: 'arn:verify', DB_NAME: 'rpg', MODEL_HIGH: 'verify', MODEL_LIGHT: 'verify',
  GRADING_FUNCTION: 'verify', IMPORT_BUCKET: 'verify', ASSETS_BUCKET: 'verify', NOTIFY_BUCKET: 'verify', USER_POOL_ID: 'verify',
  MAIL_FROM: 'verify@example.com', APP_URL: 'https://example.com', AWS_REGION: 'ap-northeast-1'
}
async function main() {
  const doVerify = process.argv.includes('--verify')
  if (doVerify) for (const [k, v] of Object.entries(VERIFY_ENV)) process.env[k] ??= v
  await rm(join(ROOT, 'dist/build'), { recursive: true, force: true })
  await rm(ZIP_DIR, { recursive: true, force: true })
  await mkdir(ZIP_DIR, { recursive: true })
  const rows = []
  for (const name of FUNCTIONS) {
    const file = await bundle(name)
    if (doVerify) await verify(file)
    const zipPath = join(ZIP_DIR, `${name}.zip`)
    await zip(file, zipPath)
    const { size } = await stat(zipPath)
    if (size >= MAX_ZIP_BYTES) throw new Error(`${name}.zip が ${MAX_ZIP_BYTES} バイト以上です（${size}）`)
    rows.push({ name, size })
  }
  const kb = (n) => `${(n / 1024).toFixed(1)} KB`
  for (const r of rows) console.log(`${r.name}.zip  ${kb(r.size)}`)
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = ['### Lambda のビルド', '', '| 関数 | zip のサイズ | 上限 |', '| --- | --- | --- |', ...rows.map((r) => `| ${r.name} | ${kb(r.size)} | 50 MB |`), '']
    if (doVerify) lines.push('束ねたファイルを読み込み、4関数とも `handler` があることを確かめた', '')
    await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n')
  }
}
main().catch((err) => {
  console.error(err)
  process.exit(1)
})
