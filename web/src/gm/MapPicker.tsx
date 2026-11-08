import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { gmRun, useGame } from '../store/game'
import type { MapView, View } from '../types'
import { crewFaces, isFar, moodArt, nowTiles } from './mapTiles'
import { Cross } from './parts'
import { SendCrew } from './SendCrew'

const inText = (name: string) => name.replace(/^The /, 'the ')

/**
 * Going somewhere (the "GM screen, consolidated" canvas): first what's live (the party, anyone split off, any fight,
 * the last map you looked at), then the station as three places, from content/map_groups.yaml. Opened from the place
 * name or with M. With a token it sends that one person instead.
 */
export function MapPicker() {
  const view = useGame((s) => s.view)
  const picker = useGame((s) => s.mapPicker)
  const setMapPicker = useGame((s) => s.setMapPicker)
  const setGmMap = useGame((s) => s.setGmMap)
  const gmMap = useGame((s) => s.gmMap)
  const lastMap = useGame((s) => s.lastMap)
  const select = useGame((s) => s.select)
  const [armed, setArmed] = useState<string | null>(null)
  const open = !!picker
  useEffect(() => {
    setArmed(null)
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMapPicker(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setMapPicker])
  if (!view || !picker) return null

  const close = () => setMapPicker(null)
  const current = gmMap && view.maps[gmMap] ? gmMap : view.party_map
  const token = picker.token ? view.tokens[picker.token] : undefined
  const go = (m: MapView) => {
    if (token) {
      void gmRun('gm.token.send', { token: token.id, map: m.id })
      select(null)
    } else {
      setGmMap(m.id)
    }
    close()
  }
  const sendCrew = (m: MapView) => {
    if (armed !== m.id) return setArmed(m.id)
    void gmRun('gm.crew.send', { map: m.id })
    setGmMap(m.id)
    close()
  }

  return createPortal(
    <>
      <div className="gx-scrim" onPointerDown={close} aria-hidden="true" />
      <section className="gx-pop gx-pick" role="dialog" aria-label={token ? `Send ${token.name} somewhere` : 'Go somewhere'}>
        <div className="gx-poph">
          <span className="r4-name">{token ? `Send ${token.name} to…` : 'Go somewhere'}</span>
          <span className="r5-role">{token ? 'They land at the entrance, for you to drag where they should be.' : 'Only you go. Players stay where they are.'}</span>
          <button type="button" className="gx-x" aria-label="Close" onClick={close}>
            <Cross />
          </button>
        </div>
        {!token && <NowRow view={view} last={lastMap} go={go} />}
        <div className="gx-dir">
          {(view.map_groups ?? []).map((g) => (
            <div key={g.title} className="gx-dcol">
              <div className="r5-sec">{g.title}</div>
              {g.maps.map(({ id, under }) => {
                const m = view.maps[id]
                if (!m) return null
                const faces = crewFaces(view, id)
                const cantSend = !!token && (!m.arrive || token.map === id)
                const fight = view.fights?.find((f) => f.map === id)
                const canSendCrew = !token && m.arrive && faces.length < view.crew.length
                return (
                  <div key={id} className={'gx-map' + (id === current && !token ? ' on' : '') + (isFar(view, id) || cantSend ? ' far' : '')} style={{ paddingLeft: under * 20 }}>
                    <button type="button" className="gx-mapgo" disabled={cantSend} onClick={() => go(m)}>
                      <img src={moodArt(m)} alt="" loading="lazy" />
                      <span>
                        <b>{m.name}</b>
                        <small>{m.subtitle}</small>
                      </span>
                    </button>
                    {fight && <span className="r12-tag">FIGHT</span>}
                    <Faces view={view} mapId={id} />
                    {canSendCrew && (
                      <button type="button" className={'gx-mini gx-send' + (armed === id ? ' on' : '')} onClick={() => sendCrew(m)}>
                        {armed === id ? `Send all ${view.crew.length}?` : 'Send crew'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </section>
    </>,
    document.querySelector('.r4') ?? document.body,
  )
}

function Faces({ view, mapId }: { view: View; mapId: string }) {
  const faces = crewFaces(view, mapId)
  if (!faces.length) return null
  return (
    <span className="gx-faces">
      {faces.map((t) => (
        <img key={t.id} src={t.portrait} alt={t.name} title={t.name} className={'r3-px' + (t.hidden ? ' off' : '')} style={{ boxShadow: `0 0 0 1px ${t.color}` }} />
      ))}
    </span>
  )
}

function NowRow({ view, last, go }: { view: View; last: string | null; go: (m: MapView) => void }) {
  return (
    <div>
      <div className="r5-sec" style={{ paddingBottom: 6 }}>
        Right now
      </div>
      <div className="gx-now">
        {nowTiles(view, last).map((t, i) => {
          const m = view.maps[t.map]
          if (!m) return null
          return (
            <button key={t.map} type="button" className={'gx-tile' + (i === 0 ? ' party' : '')} onClick={() => go(m)}>
              <img src={moodArt(m)} alt="" />
              <span>
                <span className="r4-lab">{t.lab.toUpperCase() + (t.fight ? ` · ROUND ${t.fight}` : '')}</span>
                <b>{m.name}</b>
                <Faces view={view} mapId={t.map} />
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** The GM is looking at a map the party isn't on: only they are. */
export function AwayBar({ map }: { map: MapView }) {
  const view = useGame((s) => s.view)
  const setGmMap = useGame((s) => s.setGmMap)
  if (!view || map.id === view.party_map) return null
  const party = view.maps[view.party_map]
  return (
    <div className="gx-away">
      <span className="r10-warn">ONLY YOU ARE LOOKING HERE</span>
      <span className="gx-awayt">The party is at {inText(party?.name ?? 'somewhere else')}.</span>
      <button type="button" className="r10-btn" onClick={() => setGmMap(view.party_map)}>
        Back to the party
      </button>
      <SendCrew view={view} map={map} quiet />
    </div>
  )
}
