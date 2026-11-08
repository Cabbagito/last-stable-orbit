import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { send, useGame } from '../store/game'
import type { OverviewView, Survey, SurveyEnding, SurveyOverview, SurveyQuestion } from '../types'
import { Green } from './Green'
import { answered, sentIn, type Answers } from './survey'

const BOX = 900 // the device art is drawn into a 900 x 900 box (3x its pixels)
const GOLF = { w: 1184, h: 770 } // the green with its header and readouts; matches .ov-dev.gf
const RISE = 450 // ms the device takes to sink away
const SUBMIT = 1700 // ms of SUBMITTING before the verdict
const TOAST = 9000 // ms the last report stays on the map

type Page = { k: 'intro' } | { k: 'q'; i: number } | { k: 'busy' } | { k: 'end'; end: 'fine' | 'sent' | 'later' }

/**
 * An overview the GM sent (the Satisfaction Report canvas): the map dims and a device rises over it, its face a live
 * CRT the player clicks through. It covers the map, never the sheet. Answers and the verdict stay on this screen;
 * closing it only tells the server it's closed.
 */
export function OverviewLayer() {
  const live = useGame((s) => s.view?.overview ?? null)
  const [held, setHeld] = useState<OverviewView | null>(null)
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState<{ text: string; n: number } | null>(null)
  const done = useRef(new Set<string>()) // closed here: never reopen it, whatever a late frame says
  const box = useRef<HTMLDivElement>(null)
  const [k, setK] = useState(1)

  useEffect(() => {
    if (live && !done.current.has(live.id)) {
      setHeld(live)
      const t = window.requestAnimationFrame(() => window.requestAnimationFrame(() => setOpen(true)))
      return () => window.cancelAnimationFrame(t)
    }
    if (!live) {
      setOpen(false) // the GM took it back
      const t = window.setTimeout(() => setHeld(null), RISE)
      return () => window.clearTimeout(t)
    }
  }, [live])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), TOAST)
    return () => window.clearTimeout(t)
  }, [toast])

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const { w, h } = held?.golf ? GOLF : { w: BOX, h: BOX }
    const fit = () => setK(Math.min(1, (el.clientHeight - 16) / h, (el.clientWidth - 16) / w))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [held])

  const close = (o: OverviewView, end: SurveyEnding | null) => {
    done.current.add(o.id)
    setOpen(false)
    if (end) setToast({ text: end.toast, n: Date.now() })
    void send('overview.close', { id: o.id })
    window.setTimeout(() => setHeld((h) => (h?.id === o.id ? null : h)), RISE)
  }

  return (
    <>
      {held && (
        <div ref={box} className={'ov-layer' + (open ? ' open' : '')} aria-hidden={!open}>
          <div className="ov-veil" />
          <div className={'ov-dev' + (held.golf ? ' gf-dev' : '')} style={{ '--ov-k': k } as CSSProperties} role="dialog" aria-label={held.name} aria-modal="false">
            {held.golf ? (
              <Green key={held.id} green={held.golf} onClose={() => close(held, null)} />
            ) : (
              <>
                <Screen key={held.id} o={held} onClose={(end) => close(held, end)} />
                <img className="ov-bot" src={held.device} alt="" draggable={false} />
              </>
            )}
          </div>
        </div>
      )}
      {toast && !held && (
        <div key={toast.n} className="ov-toast" role="status">
          <b>LAST REPORT</b>
          <span>{toast.text}</span>
        </div>
      )}
    </>
  )
}

/** The CRT in the device's face: the survey's pages, one at a time. */
function Screen({ o, onClose }: { o: SurveyOverview; onClose: (end: SurveyEnding | null) => void }) {
  const s = o.survey
  const [page, setPage] = useState<Page>({ k: 'intro' })
  const [a, setA] = useState<Answers>({})
  const crt = useRef<HTMLDivElement>(null)
  const [left, top, width, height] = o.screen
  const mask = o.mask ? `url("${o.mask}")` : undefined

  useEffect(() => {
    if (page.k !== 'busy') return
    const t = window.setTimeout(() => setPage({ k: 'end', end: sentIn(s, a) ? 'sent' : 'fine' }), SUBMIT)
    return () => window.clearTimeout(t)
  }, [page, s, a])

  // keep the keyboard on the screen as pages change, if it was there
  useEffect(() => {
    const el = crt.current
    if (!el || !el.contains(document.activeElement)) return
    el.querySelector<HTMLElement>('.ov-pg .ov-o, .ov-pg .ov-star, .ov-pg .ov-txt, .ov-pg .ov-b:not([aria-disabled="true"])')?.focus({ preventScroll: true })
  }, [page])

  const arrows = (e: KeyboardEvent) => {
    e.stopPropagation() // the map's keys stay out of a survey
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) || (e.target as HTMLElement).classList.contains('ov-txt')) return
    const items = [...(crt.current?.querySelectorAll<HTMLElement>('.ov-pg .ov-o, .ov-pg .ov-star, .ov-pg .ov-b') ?? [])]
    const i = items.indexOf(document.activeElement as HTMLElement)
    if (i < 0) return
    e.preventDefault()
    const d = e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 1
    items[(i + d + items.length) % items.length].focus()
  }

  const n = s.questions.length
  const numbered = s.questions.filter((q) => !q.header)
  const go = (i: number) => setPage(i < 0 ? { k: 'intro' } : i >= n ? { k: 'busy' } : { k: 'q', i })

  return (
    <div
      ref={crt}
      className="ov-crt"
      data-tint={o.tint}
      onKeyDown={arrows}
      style={{ left, top, width, height, WebkitMaskImage: mask, maskImage: mask }}
    >
      {page.k === 'intro' && (
        <div className="ov-pg">
          <div className="ov-hdr">{s.intro.header}</div>
          <div className="ov-big">{lines(s.intro.title)}</div>
          {s.intro.stat && <div className="ov-small" style={{ marginTop: 6 }}>{s.intro.stat}</div>}
          {s.intro.value && <div className="ov-pct">{s.intro.value}</div>}
          <div className="ov-small ov-plain">{s.intro.text}</div>
          <div className="ov-nav">
            <button type="button" className="ov-b" onClick={() => go(0)}>&gt; {s.intro.begin}</button>
            {s.intro.decline && <button type="button" className="ov-b" onClick={() => setPage({ k: 'end', end: 'later' })}>{s.intro.decline}</button>}
          </div>
        </div>
      )}
      {page.k === 'q' && (
        <Question
          key={page.i}
          q={s.questions[page.i]}
          header={s.questions[page.i].header || `QUESTION ${numbered.indexOf(s.questions[page.i]) + 1} / ${numbered.length}`}
          value={a[s.questions[page.i].id]}
          onChange={(v) => setA((x) => ({ ...x, [s.questions[page.i].id]: v }))}
          onBack={() => go(page.i - 1)}
          onNext={() => go(page.i + 1)}
          last={page.i === n - 1}
        />
      )}
      {page.k === 'busy' && (
        <div className="ov-pg">
          <div className="ov-hdr">{s.intro.header}</div>
          <div className="ov-big" style={{ marginTop: 70 }}>
            {s.busy}
            <span className="ov-blink">_</span>
          </div>
          <div className="ov-bar"><i /></div>
          {s.busy_text && <div className="ov-small" style={{ marginTop: 8 }}>{s.busy_text}</div>}
        </div>
      )}
      {page.k === 'end' && <Ending end={ending(s, page.end)} onClose={() => onClose(ending(s, page.end))} />}
      {o.burns && <Burns />}
    </div>
  )
}

const ending = (s: Survey, k: 'fine' | 'sent' | 'later'): SurveyEnding => (k === 'later' && s.later) || (k === 'sent' ? s.sent : s.fine)

function lines(ls: string[]) {
  return ls.map((l, i) => (
    <span key={i}>
      {i > 0 && <br />}
      {l}
    </span>
  ))
}

function Question(p: {
  q: SurveyQuestion
  header: string
  value: Answers[string] | undefined
  onChange: (v: Answers[string]) => void
  onBack: () => void
  onNext: () => void
  last: boolean
}) {
  const { q, value } = p
  const [text, setText] = useState(typeof value === 'string' ? value : '')
  const ok = answered(q, value)
  const next = () => {
    if (q.kind === 'text') p.onChange(text.trim())
    if (ok) p.onNext()
  }
  const ticked = Array.isArray(value) ? value : []
  return (
    <div className="ov-pg">
      <div className="ov-hdr">{p.header}</div>
      <div className="ov-q">{q.text}</div>
      {q.kind === 'stars' && (
        <div className="ov-stars" role="radiogroup" aria-label={q.text}>
          {[1, 2, 3, 4, 5].map((i) => (
            <button key={i} type="button" role="radio" aria-checked={value === i} className={'ov-star' + (typeof value === 'number' && i <= value ? ' on' : '')} aria-label={`${i} star${i > 1 ? 's' : ''}`} onClick={() => p.onChange(i)}>
              <i />
            </button>
          ))}
        </div>
      )}
      {(q.kind === 'one' || q.kind === 'many') && (
        <div className={'ov-opts' + (q.kind === 'many' && q.options.length > 4 ? ' two' : '')}>
          {q.options.map((o) => {
            const on = q.kind === 'many' ? ticked.includes(o.id) : value === o.id
            return (
              <button
                key={o.id}
                type="button"
                className="ov-o"
                aria-pressed={on}
                onClick={() => p.onChange(q.kind === 'many' ? (on ? ticked.filter((x) => x !== o.id) : [...ticked, o.id]) : o.id)}
              >
                {(q.kind === 'many' ? (on ? '[X] ' : '[ ] ') : on ? '(●) ' : '( ) ') + o.label}
              </button>
            )
          })}
        </div>
      )}
      {q.kind === 'text' && (
        <input
          className="ov-txt"
          maxLength={60}
          autoComplete="off"
          spellCheck={false}
          aria-label={q.text}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              next()
            }
          }}
        />
      )}
      {q.hint && <div className="ov-small ov-plain">{q.hint}</div>}
      <div className="ov-nav">
        <button type="button" className="ov-b" onClick={p.onBack}>&lt; BACK</button>
        <button type="button" className="ov-b" aria-disabled={!ok} onClick={next}>
          {p.last ? 'SUBMIT >' : 'NEXT >'}
        </button>
      </div>
    </div>
  )
}

function Ending({ end, onClose }: { end: SurveyEnding; onClose: () => void }) {
  const long = end.title.some((t) => t.length > 22)
  return (
    <div className="ov-pg">
      <Face />
      {end.title.map((t, i) => (
        <div key={i} className={'ov-big' + (long ? ' long' : '')}>{t}</div>
      ))}
      {end.line && <div className="ov-line">{end.line}</div>}
      {end.text && <div className="ov-small ov-plain">{end.text}</div>}
      <div className="ov-nav">
        {end.status ? (
          <span className="ov-small">
            <span className="ov-blink">●</span> {end.status}
          </span>
        ) : (
          <span />
        )}
        <button type="button" className="ov-b" onClick={onClose}>{end.button}</button>
      </div>
    </div>
  )
}

/** The droid's smile, drawn in the screen's ink. */
const FACE = ['...............', '.vvv.......vvv.', 'v...v.....v...v', '...............', '...............', '..v.........v..', '..vv.......vv..', '...vvvvvvvvv...', '...............', '...............']

function Face() {
  const cv = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = cv.current
    const g = c?.getContext('2d')
    if (!c || !g) return
    g.fillStyle = getComputedStyle(c).getPropertyValue('--s-ink').trim() || '#000'
    FACE.forEach((r, y) => [...r].forEach((ch, x) => ch !== '.' && g.fillRect(x, y, 1, 1)))
  }, [])
  return <canvas ref={cv} className="ov-face" width={15} height={10} />
}

/** Cigar burns on the glass, painted at the droid's pixel size (the canvas's own seeded recipe). */
function Burns() {
  const cv = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = cv.current
    const g = c?.getContext('2d')
    if (!c || !g) return
    paintBurns(g, c.width, c.height)
  }, [])
  return <canvas ref={cv} className="ov-burns" width={176} height={170} />
}

function paintBurns(g: CanvasRenderingContext2D, W: number, H: number) {
  let seed = 19
  const r = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  const burn = (cx: number, cy: number, rad: number, smear: number) => {
    for (let y = -rad * 2; y <= rad * 2; y++)
      for (let x = -rad * 2; x <= rad * 2; x++) {
        const d = Math.hypot(x, y * 1.1) + (r() - 0.5) * 1.4
        let col: number[] | null = null
        let a = 0
        if (d < rad * 0.55) {
          col = [10, 6, 4]
          a = 0.95
        } else if (d < rad * 0.8) {
          col = [70, 66, 62]
          a = 0.8 + r() * 0.2
        } else if (d < rad * 1.9) {
          col = [92, 54, 22]
          a = Math.max(0, 1 - (d - rad * 0.8) / (rad * 1.1)) * 0.6
          if (r() < 0.25) a *= 0.4
        }
        if (col) {
          g.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${a.toFixed(2)})`
          g.fillRect(cx + x, cy + y, 1, 1)
        }
      }
    for (let i = 0; i < smear; i++) {
      const ang = 0.35 + (r() - 0.5) * 0.6
      const len = 5 + r() * 11
      for (let t = rad; t < rad + len; t++) {
        if (r() < 0.35) continue
        g.fillStyle = `rgba(80,74,66,${(0.45 * (1 - (t - rad) / len)).toFixed(2)})`
        g.fillRect(Math.round(cx + Math.cos(ang) * t), Math.round(cy + Math.sin(ang) * t + (r() - 0.5) * 2), 1, 1)
      }
    }
  }
  burn(Math.round(W * 0.17), Math.round(H * 0.68), 4, 3)
  burn(Math.round(W * 0.8), Math.round(H * 0.56), 3, 2)
  burn(Math.round(W * 0.64), Math.round(H * 0.2), 3.2, 2)
}
