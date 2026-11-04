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

/**
 * Players pick who they are. The GM, and only the GM, types a passcode. The TV takes the GM's passcode too: it
 * fetches every film ahead of its cue, so it mustn't be a seat anyone can pick.
 */
export function Login({ onIn }: { onIn: (me: Me) => void }) {
  const [seats, setSeats] = useState<Seat[] | null>(null)
  const [open, setOpen] = useState<false | 'gm' | 'tv'>(false) // the passcode form: the GM's, or the TV's
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
        {open ? (
          <form
            className="app-gmlogin"
            onSubmit={(e) => {
              e.preventDefault()
              go(open === 'tv' ? { seat: 'stage', passcode: code } : { passcode: code })
            }}
          >
            <label className="r5-sec" htmlFor="passcode">
              {open === 'tv' ? 'GM passcode, to make this the TV' : 'GM passcode'}
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
              {open === 'tv' ? 'Show it on the TV' : 'Board'}
            </button>
            <button type="button" className="app-link" onClick={() => setOpen(open === 'tv' ? 'gm' : 'tv')}>
              {open === 'tv' ? "No, I'm the GM" : 'This screen is the TV'}
            </button>
          </form>
        ) : (
          <div className="app-loginlinks">
            <button type="button" className="app-link" onClick={() => setOpen('gm')}>
              I'm the GM
            </button>
            <button type="button" className="app-link" onClick={() => setOpen('tv')}>
              This screen is the TV
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
