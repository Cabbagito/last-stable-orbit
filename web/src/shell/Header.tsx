import { useEffect, useState } from 'react'
import { useGame } from '../store/game'

export type Tab = 'scene' | 'station' | 'crew' | 'codex' | 'gm'

const TABS: [Tab, string][] = [
  ['scene', 'Scene'],
  ['station', 'Station'],
  ['crew', 'Crew'],
  ['codex', 'Codex'],
]

export function Logo() {
  return (
    <span className="r5-lstack" aria-label="Last Stable Orbit">
      <span style={{ fontFamily: "'Michroma', sans-serif", fontSize: 9.6, letterSpacing: '.36em', color: '#c4b0ff' }}>LAST STABLE</span>
      <span style={{ fontFamily: "'Jost', sans-serif", fontWeight: 200, fontSize: 34, letterSpacing: '.3em', color: '#fff' }}>ORBIT</span>
    </span>
  )
}

const STATUS_TEXT = { live: 'Live', connecting: 'Connecting', offline: 'Reconnecting' } as const

export function Header({ tab, isGm, onLogout }: { tab: Tab; isGm: boolean; onLogout?: () => void }) {
  const status = useGame((s) => s.status)
  const me = useGame((s) => s.view?.me)
  const tabs = isGm ? [...TABS, ['gm', 'GM'] as [Tab, string]] : TABS
  return (
    <header className="r4-head">
      <Logo />
      <nav aria-label="Sections" className="r4-tabs">
        {tabs.map(([id, name]) => (
          <a key={id} className={id === tab ? 'r4-tab on' : 'r4-tab'} href={`#${id}`} aria-current={id === tab ? 'page' : undefined}>
            {name}
          </a>
        ))}
      </nav>
      <div className="app-headright">
        <span className={`app-status ${status}`} role="status">
          <span className="app-dot" aria-hidden="true" />
          {STATUS_TEXT[status]}
        </span>
        {me && <span className="r4-lab">{me.role === 'gm' ? 'GM' : me.seat.toUpperCase()}</span>}
        {onLogout && <FullscreenButton />}
        {onLogout && ( // none in the GM's read-only view of a player: it would log the GM out
          <button type="button" className="app-link" onClick={onLogout}>
            {isGm ? 'Log out' : 'Change character'}
          </button>
        )}
      </div>
    </header>
  )
}

/** Full screen for the whole app, so the map gets the browser's toolbar space too. Esc also leaves it. */
function FullscreenButton() {
  const [on, setOn] = useState(() => !!document.fullscreenElement)
  useEffect(() => {
    const sync = () => setOn(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])
  if (!document.fullscreenEnabled) return null // e.g. an iPhone, or inside a frame
  const toggle = () => {
    const p = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()
    p.catch(() => {}) // refused by the browser: nothing to undo
  }
  const label = on ? 'Exit full screen' : 'Full screen'
  return (
    <button type="button" className="app-iconbtn" onClick={toggle} aria-label={label} title={label}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        {on ? (
          <path d="M6 1.5V6H1.5M10 1.5V6h4.5M6 14.5V10H1.5M10 14.5V10h4.5" />
        ) : (
          <path d="M1.5 6V1.5H6M14.5 6V1.5H10M1.5 10v4.5H6M14.5 10v4.5H10" />
        )}
      </svg>
    </button>
  )
}
