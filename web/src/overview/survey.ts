import type { Survey, SurveyQuestion } from '../types'

/** What one player has answered so far: stars as 1–5, a `one` question's option id, a `many` question's ticked ids, or text. */
export type Answers = Record<string, number | string | string[]>

/** Whether a free-text answer has one of the flag words in it ("wait*" matches waited, waiting…). */
export function flagged(text: string, flag: string[]): boolean {
  if (!text.trim() || !flag.length) return false
  const words = flag.map((w) => (w.endsWith('*') ? escape(w.slice(0, -1)) + '\\w*' : escape(w)))
  return new RegExp(`\\b(${words.join('|')})\\b`, 'i').test(text)
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function points(q: SurveyQuestion, a: Answers[string] | undefined): number {
  if (a === undefined) return 0
  if (q.kind === 'stars') return typeof a === 'number' && a >= 1 && a <= 5 ? q.stars_points[a - 1] : 0
  if (q.kind === 'one') return q.options.find((o) => o.id === a)?.points ?? 0
  if (q.kind === 'many') return Array.isArray(a) ? q.options.filter((o) => a.includes(o.id)).reduce((n, o) => n + o.points, 0) : 0
  return typeof a === 'string' && flagged(a, q.flag) ? q.points : 0
}

/** Bad points, over every question. */
export function score(s: Survey, answers: Answers): number {
  return s.questions.reduce((n, q) => n + points(q, answers[q.id]), 0)
}

/** Sent in: one answer that does it alone, or more bad points than the limit. */
export function sentIn(s: Survey, answers: Answers): boolean {
  const alone = s.questions.some((q) => q.kind === 'one' && q.options.some((o) => o.sends && o.id === answers[q.id]))
  return alone || score(s, answers) > s.limit
}

/** Whether a page can move on: anything but a text question needs an answer (ticking no words is an answer). */
export function answered(q: SurveyQuestion, a: Answers[string] | undefined): boolean {
  return q.kind === 'text' || q.kind === 'many' || (q.kind === 'stars' ? typeof a === 'number' && a > 0 : typeof a === 'string')
}
