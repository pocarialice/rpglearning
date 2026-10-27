// 最初のシステム管理者を作る（構築手順書 3.10）。画面から利用者を登録できる人がまだいないときに1回だけ使う
// 使い方：DATABASE_URL=... node scripts/create-admin.mjs <メールアドレス> <氏名>
// 仮パスワードを画面に出す（メールは送らない）。初回ログインで新しいパスワードに変える
import { randomUUID } from 'node:crypto'
import { getPool } from '../functions/shared/db/client.js'
import { withTx } from '../functions/shared/db/tx.js'
import * as users from '../functions/shared/db/repositories/users.js'
import * as auth from '../functions/shared/db/repositories/auth.js'
import * as audit from '../functions/shared/db/repositories/audit.js'
import { hashPassword, generateTempPassword } from '../functions/shared/auth/password.js'
const [email, fullName] = process.argv.slice(2)
if (!email || !fullName) {
  console.error('使い方：node scripts/create-admin.mjs <メールアドレス> <氏名>')
  process.exit(2)
}
const tempPassword = generateTempPassword()
try {
  const userId = await withTx(async (tx) => {
    const id = await users.create({ sub: randomUUID(), email, fullName, roles: ['system_admin', 'learner'] }, tx)
    await auth.setPassword(id, await hashPassword(tempPassword), { mustChange: true }, tx)
    await audit.write(null, 'user.create', { type: 'user', id }, { roles: ['system_admin', 'learner'], by: 'create-admin' }, tx)
    return id
  })
  console.log(`システム管理者を作りました（user_id=${userId}）`)
  console.log(`仮パスワード：${tempPassword}`)
  console.log('7日以内にログインして、新しいパスワードを決めてください')
} catch (err) {
  console.error(err.code === '23505' ? 'このメールアドレスはすでに登録されています' : err.message)
  process.exitCode = 1
} finally {
  await getPool().end()
}
