import { useEffect, useState } from 'react'
import { plainRing } from '../lib/ring'
import { Logo } from '../shell/Header'
import { RingPortrait } from '../shell/RingPortrait'
import type { Me } from '../types'

interface Seat {
  id: string
  name: string
  short: string
  role: string
  portrait: string
  color: string
  online: boolean
}

const UNREACHABLE = 'The station is not answering. Try again.'

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

/** Players pick who they are, and the TV is picked the same way. The GM, and only the GM, types a passcode. */
export function Login({ onIn }: { onIn: (me: Me) => void }) {
  const [seats, setSeats] = useState<Seat[] | null>(null)
  const [gmOpen, setGmOpen] = useState(false)
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

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

  return (
    <div className="r4 th-meridian app-login">
      <div className="app-pick">
        <Logo />
        <div className="r5-sec">Who are you?</div>
        <div className="app-pickrow">
          {(seats ?? []).map((c) => (
            <button
              key={c.id}
              type="button"
              className={'app-pickbtn' + (c.online ? ' taken' : '')}
              disabled={busy}
              onClick={() => go({ seat: c.id })}
              aria-label={`${c.name}, ${c.role}${c.online ? ', already on board' : ''}`}
            >
              <RingPortrait src={c.portrait} ring={plainRing(c.online ? '#3a3d44' : c.color, 128, 6)} size={128} />
              <span className="app-pickname">{c.short}</span>
              <span className="r5-role">{c.role}</span>
              <span className="r4-lab app-onboard">{c.online ? 'ON BOARD' : ' '}</span>
            </button>
          ))}
        </div>
        {err && (
          <div className="app-error" role="alert">
            {err}
          </div>
        )}
        {gmOpen ? (
          <form
            className="app-gmlogin"
            onSubmit={(e) => {
              e.preventDefault()
              go({ passcode: code })
            }}
          >
            <label className="r5-sec" htmlFor="passcode">
              GM passcode
            </label>
            <input
              id="passcode"
              className="app-input"
              autoComplete="current-password"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <button type="submit" className="r4-cta" disabled={!code.trim() || busy}>
              Board
            </button>
          </form>
        ) : (
          <div className="app-loginlinks">
            <button type="button" className="app-link" onClick={() => setGmOpen(true)}>
              I'm the GM
            </button>
            <button type="button" className="app-link" disabled={busy} onClick={() => go({ seat: 'stage' })}>
              This screen is the TV
            </button>
          </div>
        )}
        <div className="app-credit">Opening music: "Aphelion" by Scott Buckley, edited, CC BY 4.0, www.scottbuckley.com.au</div>
      </div>
    </div>
  )
}
