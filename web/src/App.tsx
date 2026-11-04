import { useEffect, useState } from 'react'
import { Login } from './pages/Login'
import { RollDialog, preloadRollFonts } from './roll/RollDialog'
import { Placeholder } from './pages/Placeholder'
import { Scene } from './pages/Scene'
import { Header, type Tab } from './shell/Header'
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

  useEffect(() => {
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe)
      .catch(() => setMe(null))
  }, [])

  useEffect(() => {
    if (authLost) {
      useGame.getState().disconnect()
      useGame.setState({ authLost: false })
      setMe(null)
    }
  }, [authLost])

  if (me === 'loading') return <div className="r4 th-meridian" />
  if (!me) return <Login onIn={setMe} />
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

function Game({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const isGm = me.role === 'gm'
  const tab = useHashTab(isGm)
  const connect = useGame((s) => s.connect)
  const disconnect = useGame((s) => s.disconnect)
  useEffect(() => {
    connect()
    preloadRollFonts()
    return disconnect
  }, [connect, disconnect])

  return (
    <div className="r4 th-meridian">
      <Header tab={tab} isGm={isGm} onLogout={onLogout} />
      {tab === 'scene' ? <Scene /> : <Placeholder tab={tab} />}
      <RollDialog />
    </div>
  )
}
