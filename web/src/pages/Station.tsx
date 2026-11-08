import { useState } from 'react'
import { gmRun, useGame } from '../store/game'
import type { StationPlaceView } from '../types'

const CHIP_GAP = 28

/**
 * The Station (UI canvas, page "Station"): Ergo cut open, with every place on it. A place the crew has been to, or
 * that the GM has shown, is lit and opens; the rest stay dark. Hover a place for what it is and who's there; click a
 * lit one to look at its map. A player only looks: their token stays where it is. The GM's click picks a place, and
 * its panel opens it on the Scene, or shows or hides it for the crew.
 */
export function Station() {
  const view = useGame((s) => s.view)
  const setGmMap = useGame((s) => s.setGmMap)
  const st = view?.station
  const [hover, setHover] = useState<string | null>(null)
  const [pin, setPin] = useState<string | null>(null)
  const [look, setLook] = useState<string | null>(null)
  if (!view || !st) return <div className="app-body" />
  const isGm = view.me.role === 'gm'
  const byId = Object.fromEntries(st.places.map((p) => [p.id, p]))
  const here = st.places.find((p) => p.id === view.party_map || p.also.includes(view.party_map)) // a player's own map's place
  const focusId = hover ?? pin ?? here?.id ?? st.places[0].id
  const cur = byId[focusId]
  const crewOf = (id: string) => st.crew.filter((c) => c.map === id)
  const member = (char: string) => view.crew.find((c) => c.id === char)
  const canOpen = (p: StationPlaceView) => isGm || p.lit
  const open = (p: StationPlaceView) => {
    if (isGm) {
      setGmMap(p.id)
      location.hash = 'scene'
    } else setLook(p.id)
  }
  const lookAt = look ? byId[look] : null
  const mine = view.me.char ? st.crew.find((c) => c.char === view.me.char) : undefined
  const people = crewOf(cur.id)

  return (
    <div className="st-body">
      <section className="st-view" aria-label="Ergo, cut open">
        <div className="st-art">
          <img className="st-hole" src={st.hole} alt="" />
          <img
            className="st-px"
            src={st.art}
            alt="Ergo seen from the side. The left half is the hull, the right half is cut open to show the floors, with a cable running down to the core above the black hole. The cruise liner Patience is moored at the end of a gantry on the left."
          />
          {st.places.map((p) => p.overlay && <img key={p.id} className="st-px st-lit" src={p.overlay} alt="" style={{ opacity: p.lit ? 1 : isGm ? 0.25 : 0 }} />)}
          {st.places.flatMap((p) =>
            p.hots.map(([l, t, w, h], i) => (
              <button
                key={`${p.id}-${i}`}
                type="button"
                className={'st-hot' + (canOpen(p) ? ' can' : '') + (focusId === p.id ? ' on' : '')}
                aria-label={p.name + (isGm ? (p.lit ? '' : ", the crew hasn't been here") : p.lit ? ', look at its map' : ", the crew hasn't been here")}
                style={{ left: l, top: t, width: w, height: h }}
                onMouseEnter={() => setHover(p.id)}
                onFocus={() => setHover(p.id)}
                onMouseLeave={() => setHover(null)}
                onBlur={() => setHover(null)}
                onClick={() => {
                  setPin(p.id)
                  if (!isGm && p.lit) open(p) // the GM's click picks the place; its panel opens it or shows it
                }}
              />
            )),
          )}
          {st.places.flatMap((p) =>
            p.tags.map((g, i) => (
              <span key={`${p.id}-t${i}`} className="st-tag" style={{ left: g.x, top: g.y, color: focusId === p.id ? '#ff7dbb' : p.lit ? '#e7e9ec' : '#8a8e96' }}>
                {g.text}
              </span>
            )),
          )}
          {st.labels.map((g) => (
            <span key={g.text} className="st-tag" style={{ left: g.x, top: g.y, color: '#8a8e96' }}>
              {g.text}
            </span>
          ))}
          {st.places.flatMap((p) =>
            crewOf(p.id).map((c, i) => {
              const m = member(c.char)
              if (!m) return null
              return (
                <img
                  key={c.char}
                  className={'st-chip' + (c.hidden ? ' off' : '')}
                  src={m.portrait}
                  alt={`${m.short} is at ${p.name}`}
                  style={{ left: p.chip[0] + i * CHIP_GAP, top: p.chip[1], boxShadow: `0 0 0 1.5px ${c.char === view.me.char ? '#ffffff' : '#ff4fa3'}` }}
                />
              )
            }),
          )}
          {lookAt?.preview && (
            <div className="st-look">
              <img className="st-lookimg" src={lookAt.preview} alt={`The map of ${lookAt.name}`} />
              <div className="st-lookbar">
                <div>
                  <div className="st-where">{mine?.map === lookAt.id ? 'You are here' : mine ? `Looking around. Your token stays on ${byId[mine.map]?.name ?? 'its map'}` : 'Looking around'}</div>
                  <div className="st-lookname">{lookAt.name}</div>
                </div>
                <button type="button" className="st-btn" onClick={() => setLook(null)}>
                  Back to Station
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
      <aside className="st-panel" aria-label="About this place" aria-live="polite">
        <div>
          <div className="st-where">{cur.where}</div>
          <div className="st-name">{cur.name}</div>
        </div>
        <p className="st-blurb">{cur.blurb}</p>
        {people.length > 0 && (
          <div className="st-row">
            {people.map((c) => {
              const m = member(c.char)
              return m ? <img key={c.char} className="st-thumb" src={m.portrait} alt="" /> : null
            })}
            <span>
              {people.map((c) => member(c.char)?.short).join(' and ')} {people.length === 1 ? 'is' : 'are'} here
            </span>
          </div>
        )}
        {canOpen(cur) && cur.preview && (
          <>
            <img className="st-prev" src={cur.preview} alt={`The map of ${cur.name}`} />
            <button type="button" className="st-cta" onClick={() => open(cur)}>
              {isGm ? 'Open on the Scene' : 'Look at the map'}
            </button>
          </>
        )}
        {!cur.lit && <div className="st-row st-dark">The crew hasn't been here.</div>}
        {isGm && (
          <button type="button" className="st-btn" onClick={() => void gmRun('gm.station.show', { map: cur.id, shown: !cur.lit })}>
            {cur.lit ? 'Hide from the crew' : 'Show to the crew'}
          </button>
        )}
        {isGm && <p className="st-gmnote">Players see dark places, with this text, but can't open them. Sending the crew somewhere lights it.</p>}
      </aside>
    </div>
  )
}

