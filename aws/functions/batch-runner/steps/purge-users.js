// 削除予定日を過ぎた利用者の物理削除（Cognito → DB の順）
import { AdminDeleteUserCommand, CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider'
import * as users from '../../shared/db/repositories/users.js'
import * as audit from '../../shared/db/repositories/audit.js'
let cognito
const cognitoClient = () => (cognito ??= new CognitoIdentityProviderClient({}))
export async function run({ today }) {
  let purged = 0
  for (const u of await users.listPurgeTargets(today)) {
    try {
      await cognitoClient().send(new AdminDeleteUserCommand({ UserPoolId: process.env.USER_POOL_ID, Username: u.cognitoSub }))
    } catch (err) {
      if (err?.name !== 'UserNotFoundException') throw err // 削除済みなら続ける
    }
    if (await users.purge(u.userId)) {
      await audit.write(null, 'user.purge', { type: 'user', id: u.userId }, {})
      purged++
    }
  }
  return { purged }
}
