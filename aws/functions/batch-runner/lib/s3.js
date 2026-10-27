import { S3Client } from '@aws-sdk/client-s3'
let s3
export const s3Client = () => (s3 ??= new S3Client({}))
