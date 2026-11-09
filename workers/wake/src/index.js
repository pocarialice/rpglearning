// Worker の入口（構築手順書 3.14）。中身は wake.js（入口のファイルはハンドラーだけを export する決まりのため分けている）
import { handle } from './wake.js'
export default {
  async fetch(request, env, ctx) {
    return handle(request, env, { waitUntil: (p) => ctx.waitUntil(p) })
  }
}
