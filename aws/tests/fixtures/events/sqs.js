// SQS（本文は S3 のイベント通知）
export function s3Message(key, { receiveCount = '1', messageId = 'msg-1' } = {}) {
  return {
    messageId,
    attributes: { ApproximateReceiveCount: receiveCount },
    body: JSON.stringify({ Records: [{ s3: { bucket: { name: 'rpg-test-import' }, object: { key, size: 100 } } }] })
  }
}
