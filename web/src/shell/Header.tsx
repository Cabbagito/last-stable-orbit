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

export function Header({ tab, isGm, onLogout }: { tab: Tab; isGm: boolean; onLogout: () => void }) {
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
        <button type="button" className="app-link" onClick={onLogout}>
          {isGm ? 'Log out' : 'Change character'}
        </button>
      </div>
    </header>
  )
}
