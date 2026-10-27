// メール本文（詳細設計書 9.2）。テキストメールのみ
export const SUPPORT_CONTACT = '所属部署の学習推進担当（社内ポータルの問い合わせ窓口）'
// メールに入れるパートナーの定型のひとこと（persona ごと）
export const MAIL_GREETINGS = {
  encourage: '今日もいっしょにがんばろうね！',
  logic: '今日の依頼を確認しておきましょう。',
  rival: '今日も負けないぞ。準備はいいか？'
}
function subjectPrefix() {
  const env = process.env.APP_ENV
  return env && env !== 'prod' ? `[${env}]` : ''
}
function formatJpDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return `${y}年${m}月${d}日`
}
// item = 送信リストの1件 { to, nickname, partnerPersona, partnerName, reviewCount, quests: [title] }
export function notifyMail(item) {
  const appUrl = process.env.APP_URL
  const greeting = MAIL_GREETINGS[item.partnerPersona] ?? MAIL_GREETINGS.encourage
  const lines = [
    `${item.nickname}さん`,
    '',
    `${item.partnerName}「${greeting}」`,
    '',
    `今日の復習：${item.reviewCount}問`,
    '今日のクエスト：',
    ...item.quests.map((q) => `・${q}`),
    '',
    `学習をはじめる：${appUrl}/#/home`,
    '',
    '--',
    `通知の設定を変える：${appUrl}/#/notify`
  ]
  return { to: item.to, subject: `${subjectPrefix()}【RPG学習アプリ】今日の依頼が届いています`, text: lines.join('\n') }
}
export function deletionMail(user) {
  const lines = [
    `${user.fullName}さん`,
    '',
    'RPG学習アプリのアカウントを停止しました。',
    `${formatJpDate(user.deleteScheduledOn)}に、学習履歴を含めてすべてのデータを完全に削除します。`,
    '心当たりがない場合や、削除を取り消したい場合は、それまでに次の窓口へお問い合わせください。',
    `問い合わせ先：${SUPPORT_CONTACT}`
  ]
  return { to: user.email, subject: `${subjectPrefix()}【RPG学習アプリ】アカウント停止のお知らせ`, text: lines.join('\n') }
}
// 招待（仮パスワード）。外部設計書 5.6 の招待メールの文面
export function inviteMail({ email, tempPassword, validDays }) {
  const appUrl = process.env.APP_URL
  const lines = [
    '冒険者ギルドへようこそ。',
    `ログインURL：${appUrl}/`,
    `メールアドレス：${email}`,
    `仮パスワード：${tempPassword}`,
    `初回ログイン時に新しいパスワードを設定してください。仮パスワードの期限は${validDays}日です。`
  ]
  return { to: email, subject: `${subjectPrefix()}【RPG学習アプリ】ギルドへの招待`, text: lines.join('\n') }
}
// パスワードの再設定
export function resetMail({ email, token, validMinutes }) {
  const appUrl = process.env.APP_URL
  const lines = [
    'RPG学習アプリのパスワードの再設定を受け付けました。',
    `次のリンクを開いて、${validMinutes}分以内に新しいパスワードを設定してください。`,
    `${appUrl}/#/reset?token=${encodeURIComponent(token)}`,
    '',
    '心当たりがない場合は、このメールを捨ててください。パスワードは変わりません。',
    `問い合わせ先：${SUPPORT_CONTACT}`
  ]
  return { to: email, subject: `${subjectPrefix()}【RPG学習アプリ】パスワードの再設定`, text: lines.join('\n') }
}
