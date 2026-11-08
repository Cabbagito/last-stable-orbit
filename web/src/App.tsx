import { useEffect, useRef, useState } from 'react'
import { Login } from './pages/Login'
import { Banners } from './roll/Banner'
import { RollDialog, preloadRollFonts } from './roll/RollDialog'
import { RollStage } from './roll/RollStage'
import { GmTab } from './pages/GmTab'
import { Codex } from './pages/Codex'
import { Placeholder } from './pages/Placeholder'
import { Station } from './pages/Station'
import { Scene } from './pages/Scene'
import { Header, type Tab } from './shell/Header'
import { LaptopFilm } from './stage/Film'
import { Tv } from './stage/Tv'
import { useGame } from './store/game'
import type { Me } from './types'

const TAB_IDS: Tab[] = ['scene', 'station', 'codex', 'gm']

function useHashTab(isGm: boolean): Tab {
  const read = (): Tab => {
    const h = location.hash.slice(1).split('/')[0] as Tab // #codex/ves is the Codex tab, on Ves's page
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
  const logout = async () => {
    await fetch('/api/logout', { method: 'POST' }).catch(() => undefined)
    useGame.getState().disconnect()
    setMe(null)
  }
  if (me.role === 'stage') return <TvScreen onLogout={logout} />
  return <Game me={me} onLogout={logout} />
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

/** The TV: no header, no tabs, nothing to press but a way out, which shows when the mouse moves. */
function TvScreen({ onLogout }: { onLogout?: () => void }) {
  const connect = useGame((s) => s.connect)
  const disconnect = useGame((s) => s.disconnect)
  useEffect(() => {
    connect()
    preloadRollFonts()
    return disconnect
  }, [connect, disconnect])
  return (
    <div className="r4 th-meridian">
      <Tv onLogout={onLogout} />
    </div>
  )
}

function Game({ me, onLogout }: { me: Me; onLogout?: () => void }) {
  const isGm = me.role === 'gm'
  const preview = useGame((s) => s.preview)
  const acting = useGame((s) => s.acting)
  const tab = useHashTab(isGm)
  const connect = useGame((s) => s.connect)
  const disconnect = useGame((s) => s.disconnect)
  const world = useRef<HTMLDivElement>(null)
  const overview = useGame((s) => s.view?.overview?.id)
  useEffect(() => {
    if (overview && location.hash.slice(1).split('/')[0] !== 'scene') location.hash = 'scene' // it opens over the map
  }, [overview])
  useEffect(() => {
    connect()
    preloadRollFonts()
    return disconnect
  }, [connect, disconnect])

  return (
    <div className={'r4 th-meridian' + (preview && !acting ? ' app-preview' : '')}>
      <div ref={world} className="app-rollworld">
        <Header tab={tab} isGm={isGm} onLogout={onLogout} />
        {tab === 'scene' ? <Scene /> : tab === 'gm' ? <GmTab /> : tab === 'codex' ? <Codex /> : tab === 'station' ? <Station /> : <Placeholder tab={tab} />}
        {tab !== 'scene' && <Banners where="page" />}
        <RollDialog />
      </div>
      <RollStage world={world} />
      <LaptopFilm />
    </div>
  )
}
