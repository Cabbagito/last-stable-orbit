import { useEffect, useState } from 'react'
import { Login } from './pages/Login'
import { RollDialog, preloadRollFonts } from './roll/RollDialog'
import { GmTab } from './pages/GmTab'
import { Placeholder } from './pages/Placeholder'
import { Scene } from './pages/Scene'
import { Header, type Tab } from './shell/Header'
import { LaptopFilm } from './stage/Film'
import { Tv } from './stage/Tv'
import { useGame } from './store/game'
import type { Me } from './types'

const TAB_IDS: Tab[] = ['scene', 'station', 'crew', 'codex', 'gm']

function useHashTab(isGm: boolean): Tab {
  const read = (): Tab => {
    const h = location.hash.slice(1) as Tab
    return TAB_IDS.includes(h) && (h !== 'gm' || isGm) ? h : 'scene'
  }
  const [tab, setTab] = useState<Tab>(read)
  useEffect(() => {
    const on = () => setTab(read())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  })
  return tab
}

export function App() {
  const [me, setMe] = useState<Me | null | 'loading'>('loading')
  const authLost = useGame((s) => s.authLost)
  const preview = useGame((s) => s.preview)

  useEffect(() => {
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe)
      .catch(() => setMe(null))
  }, [])

  useEffect(() => {
    if (authLost && !preview) { // the view-as frame shows its own message instead, and must not reconnect
      useGame.getState().disconnect()
      useGame.setState({ authLost: false })
      setMe(null)
    }
  }, [authLost, preview])

  if (preview) return <Preview seat={preview} />
  if (me === 'loading') return <div className="r4 th-meridian" />
  if (!me) return <Login onIn={setMe} />
  if (me.role === 'stage') return <TvScreen />
  return (
    <Game
      me={me}
      onLogout={async () => {
        await fetch('/api/logout', { method: 'POST' }).catch(() => undefined)
        useGame.getState().disconnect()
        setMe(null)
      }}
    />
  )
}

/**
 * The GM's read-only view of one player's screen, inside the GM tab's "Viewing as" frame. It's the player's own
 * app, fed that player's projection by the server; there's no way to log out or act from here.
 */
function Preview({ seat }: { seat: string }) {
  const authLost = useGame((s) => s.authLost)
  if (seat === 'stage' && !authLost) return <TvScreen /> // the GM tab's preview of the TV
  if (authLost)
    return (
      <div className="r4 th-meridian">
        <div className="app-body app-placeholder">
          <p style={{ color: 'var(--dim)' }}>This view closed. Only the GM can look at a player's screen, and only one on this crew.</p>
        </div>
      </div>
    )
  return <Game me={{ seat, role: 'player', char: seat }} />
}

/** The TV: no header, no tabs, nothing to press. Logging out is for another screen: it only watches. */
function TvScreen() {
  const connect = useGame((s) => s.connect)
  const disconnect = useGame((s) => s.disconnect)
  useEffect(() => {
    connect()
    preloadRollFonts()
    return disconnect
  }, [connect, disconnect])
  return (
    <div className="r4 th-meridian">
      <Tv />
    </div>
  )
}

function Game({ me, onLogout }: { me: Me; onLogout?: () => void }) {
  const isGm = me.role === 'gm'
  const preview = useGame((s) => s.preview)
  const tab = useHashTab(isGm)
  const connect = useGame((s) => s.connect)
  const disconnect = useGame((s) => s.disconnect)
  useEffect(() => {
    connect()
    preloadRollFonts()
    return disconnect
  }, [connect, disconnect])

  return (
    <div className={'r4 th-meridian' + (preview ? ' app-preview' : '')}>
      <Header tab={tab} isGm={isGm} onLogout={onLogout} />
      {tab === 'scene' ? <Scene /> : tab === 'gm' ? <GmTab /> : <Placeholder tab={tab} />}
      <RollDialog />
      <LaptopFilm />
    </div>
  )
}
