// api-handler が使う AWS クライアント（テストでは aws-sdk-client-mock で差し替える）
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { LambdaClient } from '@aws-sdk/client-lambda'
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
let s3, lambda, cognito
export const s3Client = () => (s3 ??= new S3Client({}))
export const lambdaClient = () => (lambda ??= new LambdaClient({}))
export const cognitoClient = () => (cognito ??= new CognitoIdentityProviderClient({}))
export const UPLOAD_URL_SECONDS = 900
// 署名付きURL（PUT、15分、Content-Type 固定）。content-type を署名に含め、違う種類のファイルを置けないようにする
export function presignPut(bucket, key, contentType) {
  return getSignedUrl(s3Client(), new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }), {
    expiresIn: UPLOAD_URL_SECONDS, signableHeaders: new Set(['content-type'])
  })
}
