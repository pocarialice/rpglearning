import { describe, it, expect } from 'vitest'
import { extractJson, validateShape, GRADING_SCHEMA, EXTRACTION_SCHEMA } from '../../../../../functions/shared/ai/json-guard.js'
import { gradingWithProse, gradingInCodeBlock, gradingJson } from '../../../../fixtures/bedrock/grading.js'
const good = { accuracy: 40, coverage: 20, concreteness: 12, modelAnswer: '模範解答', missingPoints: ['a'], comment: 'よし' }
describe('M-A02 json-guard', () => {
  it('MT-A02-01 JSONだけ', () => expect(extractJson('{"score":72}')).toEqual({ score: 72 }))
  it('MT-A02-02 前後に文章', () => {
    expect(extractJson('採点結果です。\n{"score":72}\n以上です。')).toEqual({ score: 72 })
    expect(extractJson(gradingWithProse)).toEqual(gradingJson)
  })
  it('MT-A02-03 コードブロック', () => expect(extractJson(gradingInCodeBlock)).toEqual(gradingJson))
  it('MT-A02-04 文字列の中の括弧', () => {
    expect(extractJson('{"comment":"}{ をふくむ","score":1}')).toEqual({ comment: '}{ をふくむ', score: 1 })
    expect(extractJson('{"c":"引用\\"}\\"です","s":[1,{"x":"]"}]}')).toEqual({ c: '引用"}"です', s: [1, { x: ']' }] })
  })
  it('MT-A02-05 配列が先頭', () => expect(extractJson('[{"body":"問1"}]')).toEqual([{ body: '問1' }]))
  it('MT-A02-06 JSONがない', () => {
    expect(extractJson('すみません、採点できません')).toBeNull()
    expect(extractJson('{"a":1')).toBeNull()
    expect(extractJson('{"a":1]')).toBeNull()
    expect(extractJson('{a:1} のあと {"b":2}')).toEqual({ b: 2 })
    expect(extractJson(null)).toBeNull()
  })
  it('MT-A02-07 採点の形（正常）', () => {
    expect(validateShape(good, GRADING_SCHEMA)).toEqual({ ok: true, errors: [] })
    expect(validateShape({ questions: [] }, EXTRACTION_SCHEMA).ok).toBe(true)
  })
  it.each([
    ['accuracy', 51], ['coverage', -1], ['concreteness', 21], ['accuracy', 40.5]
  ])('MT-A02-08 範囲外の点数 %s=%s', (key, value) => {
    const r = validateShape({ ...good, [key]: value }, GRADING_SCHEMA)
    expect(r.ok).toBe(false)
    expect(r.errors.map((e) => e.key)).toEqual([key])
  })
  it.each([
    ['modelAnswer なし', { modelAnswer: undefined }, 'modelAnswer'],
    ['missingPoints が文字列', { missingPoints: 'a' }, 'missingPoints'],
    ['missingPoints が4個', { missingPoints: ['a', 'b', 'c', 'd'] }, 'missingPoints'],
    ['missingPoints の要素が数値', { missingPoints: [1] }, 'missingPoints'],
    ['comment が数値', { comment: 1 }, 'comment'],
    ['comment が空', { comment: '' }, 'comment'],
    ['accuracy が文字列', { accuracy: '40' }, 'accuracy']
  ])('MT-A02-09 必須キーがない・型違い（%s）', (_, patch, key) => {
    const r = validateShape({ ...good, ...patch }, GRADING_SCHEMA)
    expect(r.ok).toBe(false)
    expect(r.errors.map((e) => e.key)).toContain(key)
  })
  it('MT-A02-09 補足 オブジェクト以外・任意キー', () => {
    expect(validateShape(null, GRADING_SCHEMA).ok).toBe(false)
    expect(validateShape([], GRADING_SCHEMA).ok).toBe(false)
    expect(validateShape({}, { x: { type: 'int', min: 0, max: 1, required: false } })).toEqual({ ok: true, errors: [] })
  })
})
