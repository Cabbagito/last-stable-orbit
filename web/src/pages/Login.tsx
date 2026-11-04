import { useState } from 'react'
import { Logo } from '../shell/Header'
import type { Me } from '../types'

export function Login({ onIn }: { onIn: (me: Me) => void }) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ passcode: code }),
      })
      if (r.ok) onIn(await r.json())
      else setErr(r.status === 401 ? "That passcode doesn't open anything." : 'The station is not answering. Try again.')
    } catch {
      setErr('The station is not answering. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="r4 th-meridian app-login">
      <form className="app-loginbox" onSubmit={submit}>
        <Logo />
        <label className="r5-sec" htmlFor="passcode">
          Passcode
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
        {err && (
          <div className="app-error" role="alert">
            {err}
          </div>
        )}
        <button type="submit" className="r4-cta" disabled={!code.trim() || busy}>
          Board
        </button>
      </form>
    </div>
  )
}
