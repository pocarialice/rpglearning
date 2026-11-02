import { describe, it, expect } from 'vitest'
import { studySeconds, formatStudyTime, snippet, reviewPoints, tally, buildMarkdown, IDLE_CAP_MS } from '../../../../../functions/shared/domain/summary.js'
const row = (p = {}) => ({
  answerId: 1, courseName: '基本情報', adventureId: 90, adventureStartedAt: '2026-10-20 01:00:00.000',
  kind: 'choice', questionId: 42, questionBody: 'DNSの役割は？', correctBody: '名前解決', keywordId: null, keyword: null,
  isCorrect: true, score: null, isReview: false, answeredOn: '2026-10-20', answeredAt: '2026-10-20 01:02:00.000',
  reviewStage: 2, nextReviewOn: '2026-10-24', missingPoints: [], ...p
})
describe('M-G08 domain/summary.js 学習サマリ', () => {
  it('MT-G08-01 学習時間は冒険の開始からの間隔の合計で、長い休憩は上限で切る', () => {
    const rows = [
      row({ answeredAt: '2026-10-20 01:02:00.000' }),
      row({ answerId: 2, answeredAt: '2026-10-20 01:05:00.000' }),
      row({ answerId: 3, answeredAt: '2026-10-20 02:05:00.000' })
    ]
    expect(studySeconds(rows)).toBe(5 * 60 + IDLE_CAP_MS / 1000)
  })
  it('MT-G08-02 冒険のない解答は1問ずつ数え、冒険ごとに足す', () => {
    const rows = [
      row({ adventureId: null, adventureStartedAt: null, answerId: 5, answeredAt: '2026-10-20 03:00:00.000' }),
      row({ adventureId: 91, adventureStartedAt: '2026-10-20 04:00:00.000', answerId: 6, answeredAt: '2026-10-20 04:10:00.000' }),
      row({ adventureId: 91, adventureStartedAt: '2026-10-20 04:00:00.000', answerId: 7, answeredAt: '2026-10-20 04:09:00.000' })
    ]
    expect(studySeconds(rows)).toBe(10 * 60)
    expect(studySeconds([])).toBe(0)
  })
  it('MT-G08-03 学習時間の表示', () => {
    expect(formatStudyTime(0)).toBe('0秒')
    expect(formatStudyTime(null)).toBe('0秒')
    expect(formatStudyTime(-5)).toBe('0秒')
    expect(formatStudyTime(20)).toBe('20秒')
    expect(formatStudyTime(25 * 60 + 3)).toBe('25分3秒')
    expect(formatStudyTime(60 * 60)).toBe('1時間0分')
    expect(formatStudyTime(65 * 60 + 9)).toBe('1時間5分')
  })
  it('MT-G08-04 問題文はタグ・改行を落とし、長いものは切り、Markdown の記号を逃がす', () => {
    expect(snippet('<p>DNS の\n役割</p>')).toBe('DNS の 役割')
    expect(snippet('あ'.repeat(45))).toBe(`${'あ'.repeat(40)}…`)
    expect(snippet('*a* [b] #c |d| `e`')).toBe('\\*a\\* \\[b\\] \\#c \\|d\\| \\`e\\`')
    expect(snippet(null)).toBe('')
  })
  it('MT-G08-05 復習するべき観点は間違えた択一と不合格の説明だけで、同じものは1つにする', () => {
    const rows = [
      row(),
      row({ answerId: 2, isCorrect: false }),
      row({ answerId: 3, isCorrect: false }),
      row({ answerId: 4, questionId: 43, questionBody: '別の問題', correctBody: null, isCorrect: false, reviewStage: 6, nextReviewOn: null }),
      row({ answerId: 5, kind: 'explain', keywordId: 123, keyword: 'VPC', score: 45, isCorrect: false, missingPoints: ['サブネット', 'ルート'] }),
      row({ answerId: 6, kind: 'explain', keywordId: 124, keyword: null, score: 30, isCorrect: false, missingPoints: undefined, nextReviewOn: null })
    ]
    expect(reviewPoints(rows).map((p) => p.text)).toEqual([
      '- 択一「DNSの役割は？」：正解は「名前解決」（次の復習 2026/10/24）',
      '- 択一「別の問題」：解説を読み直す',
      '- 説明「VPC」（45点）：足りない観点は サブネット、ルート（次の復習 2026/10/24）',
      '- 説明「」（30点）：模範説明を読み直す'
    ])
  })
  it('MT-G08-06 数の集計', () => {
    const rows = [row({ isReview: true }), row({ isCorrect: false }), row({ kind: 'explain', isCorrect: true, score: 80 })]
    expect(tally(rows)).toEqual({ answerCount: 3, correctCount: 2, choiceCount: 2, choiceCorrect: 1, explainCount: 1, explainPassed: 1, reviewCount: 1 })
  })
  it('MT-G08-07 Markdown：学習日・学習時間・学習した内容・復習するべき観点・パートナーのコメント', () => {
    const rows = [
      row({ isReview: true }),
      row({ answerId: 2, isCorrect: false }),
      row({ answerId: 3, kind: 'explain', keywordId: 123, keyword: 'VPC', score: 45, isCorrect: false, missingPoints: ['サブネット'] }),
      row({ answerId: 4, kind: 'explain', keywordId: 125, keyword: 'IAM', score: 80, isCorrect: true, courseName: 'AWS SAA' })
    ]
    const md = buildMarkdown({ title: '冒険のまとめ', date: '2026-10-20', rows, seconds: 25 * 60, comment: { partnerName: 'ミナ', text: 'よくがんばったね。\n次も行こう' } })
    expect(md).toBe([
      '# 学習サマリ 2026/10/20（冒険のまとめ）',
      '- 学習日：2026/10/20',
      '- 学習時間：25分0秒',
      '- コース：基本情報、AWS SAA',
      '## 学習した内容',
      '- 解いた問題：4問（択一 2問・説明 2問、うち復習 1問）',
      '- 結果：択一 1/2問 正解、説明 1/2問 合格',
      '  - 択一（復習）：DNSの役割は？ … ○ 正解',
      '  - 択一：DNSの役割は？ … × 不正解',
      '  - 説明：VPC … 45点 不合格',
      '  - 説明：IAM … 80点 合格',
      '## 復習するべき観点',
      '- 択一「DNSの役割は？」：正解は「名前解決」（次の復習 2026/10/24）',
      '- 説明「VPC」（45点）：足りない観点は サブネット（次の復習 2026/10/24）',
      '## ミナからのコメント',
      'よくがんばったね。 次も行こう'
    ].join('\n'))
    expect(md).not.toMatch(/\n\n/)
  })
  it('MT-G08-08 Markdown：間違いなし・コースなし・名前なしのコメント・コメントなし', () => {
    const rows = [row({ courseName: null, kind: 'explain', keyword: null, score: 90 })]
    const md = buildMarkdown({ title: '1日のまとめ', date: '2026-10-20', rows, seconds: 60, comment: { partnerName: null, text: 'いいね' } })
    expect(md).not.toContain('- コース')
    expect(md).toContain('  - 説明： … 90点 合格')
    expect(md).toContain('- 間違えた問題はありません。次の復習日に解き直して定着させましょう')
    expect(md).toContain('## パートナーのコメント\nいいね')
    expect(buildMarkdown({ title: 't', date: null, rows, seconds: 60, comment: null })).not.toContain('コメント')
  })
})
