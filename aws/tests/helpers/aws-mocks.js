// aws-sdk-client-mock の組み立て
import { mockClient } from 'aws-sdk-client-mock'
import { RDSDataClient } from '@aws-sdk/client-rds-data'
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'
import { SESClient } from '@aws-sdk/client-ses'
export const rdsMock = () => mockClient(RDSDataClient)
export const bedrockMock = () => mockClient(BedrockRuntimeClient)
export const sesMock = () => mockClient(SESClient)
export function awsError(name, message = name) {
  return Object.assign(new Error(message), { name })
}
// Data API のモック用に、リポジトリへ渡す db を作る
import { vi } from 'vitest'
export function fakeDb({ rows = [], updated = 1 } = {}) {
  return {
    query: vi.fn(async () => rows),
    execute: vi.fn(async () => ({ rows, numberOfRecordsUpdated: updated }))
  }
}
import { LambdaClient } from '@aws-sdk/client-lambda'
import { S3Client } from '@aws-sdk/client-s3'
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider'
export const lambdaMock = () => mockClient(LambdaClient)
export const s3Mock = () => mockClient(S3Client)
export const cognitoMock = () => mockClient(CognitoIdentityProviderClient)
// RDS Data API のモックで、SQL の内容ごとに応答を変える。[正規表現, 応答 or (input) => 応答] の配列
import { ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from '@aws-sdk/client-rds-data'
export function routeSql(rds, table) {
  rds.on(BeginTransactionCommand).resolves({ transactionId: 'tx-1' })
  rds.on(CommitTransactionCommand).resolves({})
  rds.on(RollbackTransactionCommand).resolves({})
  rds.on(ExecuteStatementCommand).callsFake((input) => {
    for (const [re, res] of table) if (re.test(input.sql)) return typeof res === 'function' ? res(input) : res
    return { formattedRecords: '[]', numberOfRecordsUpdated: 1 }
  })
}
export const records = (rows) => ({ formattedRecords: JSON.stringify(rows) })
export const executed = (rds) => rds.commandCalls(ExecuteStatementCommand).map((c) => c.args[0].input)
