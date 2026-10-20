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
