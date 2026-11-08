import { describe, expect, it } from 'vitest'
import { answered, flagged, score, sentIn } from './survey'
import type { Survey, SurveyOption, SurveyQuestion } from '../types'

// The Satisfaction Report as content/overviews.yaml has it, scored as the canvas's "How it scores" table says.
const opt = (id: string, points = 0, sends = false): SurveyOption => ({ id, label: id, points, sends })
const q = (id: string, kind: SurveyQuestion['kind'], extra: Partial<SurveyQuestion> = {}): SurveyQuestion => ({
  id, kind, text: id, header: '', hint: '', options: [], stars_points: [], flag: [], points: 0, ...extra,
})
const end = { title: [], line: '', text: '', status: '', button: 'OK', toast: '' }
const SR: Survey = {
  intro: { header: '', title: [], stat: '', value: '', text: '', begin: 'BEGIN', decline: 'NOT NOW' },
  limit: 7,
  questions: [
    q('stars', 'stars', { stars_points: [4, 3, 2, 1, 0] }),
    q('wait', 'one', { options: [opt('none'), opt('under'), opt('about'), opt('over', 0, true)] }),
    q('words', 'many', { options: [opt('wonderful'), opt('long', 1), opt('restful'), opt('confusing', 1), opt('delicious'), opt('unfair', 1)] }),
    q('still', 'one', { options: [opt('no'), opt('yes', 3)] }),
    q('rec', 'one', { options: [opt('def'), opt('prob', 1), opt('ns', 2), opt('no', 3)] }),
    q('text', 'text', { points: 1, flag: ['wait*', 'slow*', 'queue*', 'late', 'complain*', 'bad', 'help', 'leave'] }),
  ],
  busy: '', busy_text: '', fine: end, sent: end, later: end,
}

describe('the Satisfaction Report', () => {
  it('lets an honest, pleasant guest through', () => {
    const a = { stars: 4, wait: 'under', words: ['delicious', 'long'], still: 'yes', rec: 'prob', text: '' }
    expect(score(SR, a)).toBe(6)
    expect(sentIn(SR, a)).toBe(false)
  })

  it('sends honest Marlo in', () => {
    const a = { stars: 3, wait: 'about', words: ['long', 'confusing'], still: 'yes', rec: 'ns', text: '' }
    expect(score(SR, a)).toBe(9)
    expect(sentIn(SR, a)).toBe(true)
  })

  it('sends anyone who waited over 11 minutes, however glowing the rest', () => {
    const a = { stars: 5, wait: 'over', words: ['wonderful'], still: 'no', rec: 'def', text: '' }
    expect(score(SR, a)).toBe(0)
    expect(sentIn(SR, a)).toBe(true)
  })

  it('takes 8 to be sent in: exactly 7 is still fine', () => {
    const seven = { stars: 2, wait: 'none', words: ['long'], still: 'yes', rec: 'def', text: '' }
    expect(score(SR, seven)).toBe(7)
    expect(sentIn(SR, seven)).toBe(false)
    expect(sentIn(SR, { ...seven, text: 'I waited ages' })).toBe(true)
  })

  it('reads the free text for a word that costs a point', () => {
    expect(flagged('The queues were long', SR.questions[5].flag)).toBe(true)
    expect(flagged('Please HELP', SR.questions[5].flag)).toBe(true)
    expect(flagged('Lovely, thanks', SR.questions[5].flag)).toBe(false)
    expect(flagged('a ballad', SR.questions[5].flag)).toBe(false) // "bad" only as a word
    expect(flagged('', SR.questions[5].flag)).toBe(false)
  })

  it('needs an answer to move on, except for words and text', () => {
    expect(answered(SR.questions[0], 0)).toBe(false)
    expect(answered(SR.questions[0], 3)).toBe(true)
    expect(answered(SR.questions[1], undefined)).toBe(false)
    expect(answered(SR.questions[2], undefined)).toBe(true)
    expect(answered(SR.questions[5], undefined)).toBe(true)
  })
})
