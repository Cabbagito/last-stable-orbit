import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { STAT_LOOK } from '../roll/stats'
import type { Me, StatKey } from '../types'

interface Seat {
  id: string
  name: string
  short: string
  role: string
  portrait: string
  color: string
  online: boolean
  health: number
  stats: Record<StatKey, number>
  list: { name: string; text: string; icon: string | null }[]
  burn: { name: string; when: string; text: string; icon: string; color: string } | null
}

const UNREACHABLE = 'The station is not answering. Try again.'
const STATS = Object.keys(STAT_LOOK) as StatKey[]

async function login(body: Record<string, string>): Promise<Me | string> {
  try {
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (r.ok) return (await r.json()) as Me
    if (r.status === 401) return "That passcode doesn't open anything."
    return UNREACHABLE
  } catch {
    return UNREACHABLE
  }
}

interface Star {
  x: number
  y: number
  d: number
  cls: string
}

/** The sky's stars, the same every time. Each is drawn twice, half a layer apart, so the drift loops without a seam. */
function makeSky(): { far: Star[]; near: Star[] } {
  let seed = 11
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  const layer = (count: number, twinkle: boolean) => {
    const out: Star[] = []
    for (let i = 0; i < count; i++) {
      const x = Math.round(rnd() * 500) / 10
      const y = Math.round(rnd() * 1000) / 10
      const k = rnd()
      const d = Math.round(rnd() * 50) / 10
      const cls = (k > 0.8 ? 'v' : k > 0.68 ? 'k' : '') + (twinkle && rnd() > 0.6 ? ' tw' : '')
      out.push({ x, y, d, cls }, { x: x + 50, y, d, cls })
    }
    return out
  }
  return { far: layer(46, false), near: layer(30, true) }
}
const SKY = makeSky()

/** The colour a character's column and sheet light up in: their Burn's. */
const accent = (c: Seat) => ({ '--c': c.burn?.color ?? c.color }) as CSSProperties

/** Their best stat, shown beside the name on the wall. */
const topStat = (c: Seat) => STATS.reduce((best, s) => (c.stats[s] > c.stats[best] ? s : best), STATS[0])

const KEY = <path d="M11.5 12H21M18 12v4M14.5 12v3" />

/** The wall (the LSO — Login canvas, board B): five whole portraits, and the sheet of whoever you point at.
 *  Players pick who they are, and the TV is picked with its icon. The GM, and only the GM, types a passcode. */
export function Login({ onIn }: { onIn: (me: Me) => void }) {
  const [seats, setSeats] = useState<Seat[] | null>(null)
  const [pointed, setPointed] = useState<string | null>(null)
  const [gmOpen, setGmOpen] = useState(false)
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  // Was this column already lit when the press began? A mouse lights it by hovering, so one click boards. A finger
  // can't hover, so the first tap lights it and shows the sheet, and the second boards.
  const wasHot = useRef(false)

  useEffect(() => {
    let live = true
    const load = () =>
      fetch('/api/seats')
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => live && setSeats(d.crew))
        .catch(() => live && setErr(UNREACHABLE))
    load()
    const t = window.setInterval(load, 5000) // keep "on board" fresh while people arrive
    return () => {
      live = false
      window.clearInterval(t)
    }
  }, [])

  const go = async (body: Record<string, string>) => {
    setBusy(true)
    setErr('')
    const res = await login(body)
    setBusy(false)
    if (typeof res === 'string') setErr(res)
    else onIn(res)
  }

  const crew = seats ?? []
  const hot = crew.find((c) => c.id === pointed) ?? crew.find((c) => !c.online) ?? crew[0]
  const closeGm = () => {
    setGmOpen(false)
    setCode('')
    setErr('')
  }

  return (
    <div className="wl">
      <div className="wl-sky" aria-hidden="true">
        <div className="wl-layer far">
          {SKY.far.map((s, i) => (
            <i key={i} className={s.cls} style={{ left: `${s.x}%`, top: `${s.y}%` }} />
          ))}
        </div>
        <div className="wl-layer">
          {SKY.near.map((s, i) => (
            <i key={i} className={s.cls} style={{ left: `${s.x}%`, top: `${s.y}%`, animationDelay: `-${s.d}s` }} />
          ))}
        </div>
        <div className="wl-orb">
          <div className="wl-ring r1" />
          <div className="wl-ring r2" />
          <div className="wl-ring r3" />
          <i className="wl-dot d1" />
          <i className="wl-dot d2" />
          <i className="wl-dot d3" />
        </div>
      </div>

      <div className="wl-seats">
        <button type="button" className="wl-ico gm" aria-label="I'm the GM" title="GM" disabled={busy} onClick={() => setGmOpen(true)}>
          <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square">
            <circle cx="7.5" cy="12" r="4" />
            {KEY}
          </svg>
        </button>
        <button type="button" className="wl-ico tv" aria-label="This screen is the TV" title="TV" disabled={busy} onClick={() => go({ seat: 'stage' })}>
          <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square">
            <rect x="2.5" y="4.5" width="19" height="12" />
            <path d="M8 20.5h8M12 16.5v4" />
          </svg>
        </button>
      </div>

      <header className="wl-head">
        <span className="wl-logo" role="img" aria-label="Last Stable Orbit">
          <span className="a">LAST STABLE</span>
          <span className="b">ORBIT</span>
        </span>
        {err && !gmOpen ? (
          <p className="wl-ask err" role="alert">
            {err}
          </p>
        ) : (
          <h1 className="wl-ask">Who are you?</h1>
        )}
      </header>

      <div className="wl-strip">
        {crew.map((c) => {
          const top = topStat(c)
          const lit = c.id === hot?.id
          return (
            <button
              key={c.id}
              type="button"
              className={'wl-col' + (c.online ? ' taken' : '') + (lit ? ' hot' : '')}
              style={accent(c)}
              disabled={busy}
              aria-label={`${c.name}, ${c.role}${c.online ? ', already on board' : ''}`}
              onPointerEnter={(e) => e.pointerType === 'mouse' && setPointed(c.id)}
              onFocus={() => setPointed(c.id)}
              onPointerDown={() => (wasHot.current = lit)}
              onClick={(e) => {
                // detail 0 is the keyboard: focus has already shown the sheet
                if (e.detail === 0 || wasHot.current) go({ seat: c.id })
                else setPointed(c.id)
                wasHot.current = false
              }}
            >
              <span className="wl-art">
                <img className="wl-px" src={c.portrait} alt="" draggable={false} />
              </span>
              <span className="wl-cap">
                <span>
                  <span className="wl-n">{c.short}</span>
                  <span className="wl-r">{c.online ? 'On board' : c.role}</span>
                </span>
                <span className="sp" />
                <img className="wl-px" src={`/assets/icons/stats/${top}.png`} alt={STAT_LOOK[top].title} width={32} height={32} />
                <span className="wl-die">d{c.stats[top]}</span>
              </span>
              <i className="wl-tick a" />
              <i className="wl-tick c" />
            </button>
          )
        })}
      </div>

      {hot && (
        <section className="wl-detail" style={accent(hot)} aria-label={`${hot.name}, ${hot.role}`}>
          <div className="wl-who">
            <span className="wl-lab">Crew · {hot.role}</span>
            <h2 className="wl-name">{hot.name}</h2>
            {hot.online && <span className="wl-lab on">Already on board</span>}
            <button type="button" className="wl-cta" disabled={busy} onClick={() => go({ seat: hot.id })}>
              Board as {hot.short}
            </button>
          </div>
          <div className="wl-blk">
            <div className="wl-sec">
              <span className="wl-lab">Stats</span>
              <span className="sp" />
              <span className="wl-lab">Health</span>
              <img className="wl-px" src="/assets/icons/vitals/hp.png" alt="" width={24} height={24} />
              <span className="wl-die" style={{ color: '#fff' }}>
                {hot.health}
              </span>
            </div>
            <div className="wl-stats">
              {STATS.map((s) => (
                <div key={s} className={'wl-stat' + (s === topStat(hot) ? ' top' : '')}>
                  <img className="wl-px" src={`/assets/icons/stats/${s}.png`} alt="" width={40} height={40} />
                  <span className="wl-die">d{hot.stats[s]}</span>
                  <span className="wl-lab">{STAT_LOOK[s].title}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="wl-blk">
            <span className="wl-lab">Skills</span>
            <div>
              {hot.list.map((k) => (
                <div key={k.name} className="wl-tr">
                  {k.icon && <img className="wl-px" src={k.icon} alt="" width={40} height={40} />}
                  <span className="wl-trt">
                    <span className="wl-trn">{k.name}</span>
                    <span className="wl-trd">{k.text}</span>
                  </span>
                </div>
              ))}
              {hot.burn && (
                <div className="wl-tr burn">
                  <img className="wl-px" src={hot.burn.icon} alt="" width={40} height={40} />
                  <span className="wl-trt">
                    <span className="wl-lab">Burn · {hot.burn.when}</span>
                    <span className="wl-trn">{hot.burn.name}</span>
                    <span className="wl-trd">{hot.burn.text}</span>
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {gmOpen && (
        <div className="wl-veil">
          <button type="button" className="wl-veil-x" aria-label="Close the passcode prompt" tabIndex={-1} onClick={closeGm} />
          <form
            className="wl-prompt"
            role="dialog"
            aria-modal="true"
            aria-label="GM passcode"
            onKeyDown={(e) => e.key === 'Escape' && closeGm()}
            onSubmit={(e) => {
              e.preventDefault()
              go({ passcode: code })
            }}
          >
            <i className="wl-pt a" />
            <i className="wl-pt b" />
            <label className="wl-plab" htmlFor="passcode">
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ff7dbb" strokeWidth="1.5" strokeLinecap="square">
                <circle cx="7.5" cy="12" r="4" />
                {KEY}
              </svg>
              GM passcode
            </label>
            <input
              id="passcode"
              className="wl-input"
              autoComplete="current-password"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            {err && (
              <div className="wl-perr" role="alert">
                {err}
              </div>
            )}
            <div className="wl-prow">
              <button type="submit" className="wl-go" disabled={!code.trim() || busy}>
                Board
              </button>
              <button type="button" className="wl-back" onClick={closeGm}>
                Back
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
