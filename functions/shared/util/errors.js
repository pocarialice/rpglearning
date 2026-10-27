// エラーの型とHTTP応答への変換（詳細設計書 2.4.4）
export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  LOGIN_FAILED: 401,
  PASSWORD_EXPIRED: 401,
  ACCOUNT_LOCKED: 423,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  ONBOARDING_REQUIRED: 409,
  COURSE_REQUIRED: 409,
  DB_RESUMING: 503,
  GRADING_TIMEOUT: 504,
  INTERNAL_ERROR: 500,
  AI_TIMEOUT: 500,
  AI_ERROR: 500
}
const DEFAULT_MESSAGE = {
  VALIDATION_ERROR: '入力内容に誤りがあります',
  UNAUTHORIZED: 'ログインが必要です',
  LOGIN_FAILED: 'メールアドレスかパスワードが正しくありません',
  PASSWORD_EXPIRED: '仮パスワードの期限が切れています。管理者に再発行を依頼してください',
  ACCOUNT_LOCKED: 'ログインに続けて失敗したため、しばらくログインできません。15分ほど待ってからもう一度お試しください',
  FORBIDDEN: 'この操作を行う権限がありません',
  NOT_FOUND: '対象が見つかりません',
  CONFLICT: '状態が食い違っています',
  ONBOARDING_REQUIRED: 'ニックネームの登録が必要です',
  COURSE_REQUIRED: 'コースの受講開始が必要です',
  DB_RESUMING: 'データベースを起動しています',
  GRADING_TIMEOUT: '採点に時間がかかっています',
  INTERNAL_ERROR: 'エラーが発生しました',
  AI_TIMEOUT: 'AIの応答が時間内に返りませんでした',
  AI_ERROR: 'AIの呼び出しに失敗しました'
}
export class AppError extends Error {
  constructor(code, message, { status, details, cause } = {}) {
    super(message ?? DEFAULT_MESSAGE[code] ?? code, cause === undefined ? undefined : { cause })
    this.name = 'AppError'
    this.code = code
    this.status = status ?? ERROR_STATUS[code] ?? 500
    if (details !== undefined) this.details = details
  }
}
export function isAppError(err) {
  return err instanceof AppError
}
// 想定したエラーは外部設計書 5.1 の形に、想定外は INTERNAL_ERROR にする（中身は出さない）
export function toErrorResponse(err) {
  const known = isAppError(err)
  const status = known ? err.status : 500
  const error = known
    ? { code: err.code, message: err.message }
    : { code: 'INTERNAL_ERROR', message: DEFAULT_MESSAGE.INTERNAL_ERROR }
  if (known && err.details !== undefined) error.details = err.details
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    body: JSON.stringify({ error })
  }
}
