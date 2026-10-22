import { describe, it, expect } from 'vitest'
import {
  countChars, validateExplanation, validateNickname, validatePartnerName,
  validateNotifyTime, validateImportRequest, validateQuestionDraft
} from '../../../../web/js/logic/validators.js'
const X = (n) => 'あ'.repeat(n)
const good = { body: '問題文', choices: ['ア', 'イ', 'ウ', 'エ'], correct: 2, explanation: '解説', keywords: ['DNS', 'TTL'] }
const NG = (code) => expect.objectContaining({ ok: false, code })
describe('M-U07 validators 説明文', () => {
  it('MT-U07-01 下限の1つ下', () => expect(validateExplanation(X(49))).toEqual(NG('M-03')))
  it('MT-U07-02 下限', () => expect(validateExplanation(X(50))).toEqual({ ok: true }))
  it('MT-U07-03 200文字を超えても小見出しは要らない', () => expect(validateExplanation(X(201))).toEqual({ ok: true }))
  it('MT-U07-04 上限', () => expect(validateExplanation(X(400))).toEqual({ ok: true }))
  it('MT-U07-05 上限の1つ上', () => {
    const r = validateExplanation(X(401))
    expect(r).toEqual(NG('M-04'))
    expect(r.params.count).toBe(401)
  })
  it('MT-U07-06 【】も1文字として数える', () => expect(validateExplanation('【定義】' + X(396))).toEqual({ ok: true }))
  it('MT-U07-07 【】を含めて上限の1つ上', () => expect(validateExplanation('【定義】' + X(397))).toEqual(NG('M-04')))
  it('MT-U07-11 空白・改行は数えない', () => {
    const s = 'あ あ あ あ あ あ　あ　あ　あ\nあ\nあ\tあ' + X(37)
    expect(countChars(s)).toBe(49)
    expect(validateExplanation(s)).toEqual(NG('M-03'))
  })
  it('MT-U07-12 サロゲートペア', () => {
    expect(countChars('𠮷'.repeat(50))).toBe(50)
    expect(validateExplanation('𠮷'.repeat(50))).toEqual({ ok: true })
  })
  it.each(['', null, undefined])('MT-U07-13 空・null（%s）', (v) => {
    expect(() => validateExplanation(v)).not.toThrow()
    expect(validateExplanation(v)).toEqual(NG('M-03'))
  })
})
describe('M-U07 validators ニックネーム・パートナー名', () => {
  it('MT-U07-14 文字数の境界', () => {
    expect(validateNickname('あ').ok).toBe(false)
    expect(validateNickname('あい').ok).toBe(true)
    expect(validateNickname(X(12)).ok).toBe(true)
    expect(validateNickname(X(13)).ok).toBe(false)
  })
  it.each(['たろう', 'タロウ', '太郎', 'taro_01', 'ゲーマー-2'])('MT-U07-15 使える文字 %s', (s) => {
    expect(validateNickname(s)).toEqual({ ok: true })
  })
  it.each(['たろう!', 'た ろう', 'たろう😀', '<b>'])('MT-U07-16 使えない文字 %s', (s) => {
    expect(validateNickname(s)).toMatchObject({ ok: false, field: 'nickname' })
  })
  it('MT-U07-17 前後の空白', () => expect(validateNickname('  たろう  ')).toEqual({ ok: true }))
  it('MT-U07-18 パートナー名の空', () => expect(validatePartnerName('')).toEqual({ ok: true }))
  it('MT-U07-19 パートナー名の境界', () => {
    expect(validatePartnerName('ミ').ok).toBe(true)
    expect(validatePartnerName(X(10)).ok).toBe(true)
    expect(validatePartnerName(X(11)).ok).toBe(false)
  })
  it.each(['ミナ_2', 'ミナ★', 'ミナ😀'])('MT-U07-20 パートナー名の記号 %s', (s) => {
    expect(validatePartnerName(s)).toMatchObject({ ok: false, field: 'partnerName' })
  })
})
describe('M-U07 validators 通知時刻・取り込み・問題', () => {
  it('MT-U07-21 通知時刻の範囲', () => {
    expect(validateNotifyTime('05:30').ok).toBe(false)
    expect(validateNotifyTime('06:00').ok).toBe(true)
    expect(validateNotifyTime('22:00').ok).toBe(true)
    expect(validateNotifyTime('22:30').ok).toBe(false)
  })
  it.each(['07:15', '7:30', '24:00', null])('MT-U07-22 通知時刻の刻み・形式 %s', (v) => {
    expect(validateNotifyTime(v).ok).toBe(false)
  })
  it('MT-U07-23 取り込みのサイズ', () => {
    const base = { sourceType: 'pdf', fileName: 'a.pdf', contentType: 'application/pdf' }
    expect(validateImportRequest({ ...base, size: 20971520 })).toEqual({ ok: true })
    expect(validateImportRequest({ ...base, size: 20971521 })).toMatchObject({ ok: false, field: 'size' })
  })
  it('MT-U07-24 取り込みの種類', () => {
    expect(validateImportRequest({ sourceType: 'image', fileName: 'a.gif', contentType: 'image/gif', size: 10 })).toMatchObject({ ok: false, field: 'contentType' })
    expect(validateImportRequest({ sourceType: 'docx', fileName: 'a.docx', contentType: 'application/pdf', size: 10 })).toMatchObject({ ok: false, field: 'sourceType' })
  })
  it('MT-U07-25 テキストの長さ', () => {
    const t = (n) => validateImportRequest({ sourceType: 'text', text: 'a'.repeat(n) }).ok
    expect(t(0)).toBe(false)
    expect(t(1)).toBe(true)
    expect(t(20000)).toBe(true)
    expect(t(20001)).toBe(false)
  })
  it('MT-U07-26 公開できる問題', () => expect(validateQuestionDraft(good)).toEqual({ ok: true }))
  it.each([
    ['選択肢3つ', { choices: ['ア', 'イ', 'ウ'] }],
    ['選択肢の1つが空', { choices: ['ア', '', 'ウ', 'エ'] }],
    ['正解0', { correct: 0 }],
    ['正解5', { correct: 5 }],
    ['解説が空', { explanation: '' }]
  ])('MT-U07-27 公開できない問題（%s）', (_, patch) => {
    expect(validateQuestionDraft({ ...good, ...patch })).toEqual(NG('M-12'))
  })
  it('MT-U07-28 キーワードの数と長さ', () => {
    const kw = (keywords) => validateQuestionDraft({ ...good, keywords }).ok
    expect(kw([])).toBe(true)
    expect(kw(['a', 'b', 'c'])).toBe(true)
    expect(kw(['a', 'b', 'c', 'd'])).toBe(false)
    expect(kw(['a'.repeat(50)])).toBe(true)
    expect(kw(['a'.repeat(51)])).toBe(false)
  })
})
describe('M-U07 validators', () => {
  it('MT-U07-30 ニックネーム・パートナー名に文字列以外を渡しても例外にしない', () => {
    expect(validateNickname(null).ok).toBe(false)
    expect(validatePartnerName(null)).toEqual({ ok: true })
    expect(validatePartnerName(undefined)).toEqual({ ok: true })
    expect(validatePartnerName(12).ok).toBe(false)
  })
  it('MT-U07-31 取り込みの要求が空・ファイル名やサイズが不正', () => {
    expect(validateImportRequest(undefined).ok).toBe(false)
    expect(validateImportRequest({ sourceType: 'text', text: 1 }).ok).toBe(false)
    const img = { sourceType: 'image', fileName: 'a.png', contentType: 'image/png', size: 10 }
    expect(validateImportRequest(img)).toEqual({ ok: true })
    expect(validateImportRequest({ ...img, fileName: ' ' })).toMatchObject({ field: 'fileName' })
    expect(validateImportRequest({ ...img, fileName: 1 })).toMatchObject({ field: 'fileName' })
    expect(validateImportRequest({ ...img, fileName: 'a'.repeat(256) })).toMatchObject({ field: 'fileName' })
    expect(validateImportRequest({ ...img, size: 0 })).toMatchObject({ field: 'size' })
    expect(validateImportRequest({ ...img, size: 1.5 })).toMatchObject({ field: 'size' })
  })
  it('MT-U07-32 問題の下書きが空・問題文なし・選択肢が配列でない・キーワードが配列でない・正解が整数でない', () => {
    expect(validateQuestionDraft(undefined)).toMatchObject({ code: 'M-12', field: 'body' })
    expect(validateQuestionDraft({ ...good, body: ' ' })).toMatchObject({ field: 'body' })
    expect(validateQuestionDraft({ ...good, choices: 'ア' })).toMatchObject({ field: 'choices' })
    expect(validateQuestionDraft({ ...good, correct: '2' })).toMatchObject({ field: 'correct' })
    expect(validateQuestionDraft({ ...good, keywords: 'DNS' })).toMatchObject({ field: 'keywords' })
    expect(validateQuestionDraft({ ...good, keywords: undefined })).toEqual({ ok: true })
    expect(validateQuestionDraft({ ...good, keywords: [''] })).toMatchObject({ field: 'keywords' })
  })
})
