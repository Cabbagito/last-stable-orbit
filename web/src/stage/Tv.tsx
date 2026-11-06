import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { proj } from '../lib/proj'
import { hpRing, plainRing, ring } from '../lib/ring'
import { fighterIn } from '../fight/fights'
import { TvFights } from '../fight/TvFights'
import { ChipFx } from '../fx/ChipFx'
import { MapLayers } from '../map/MapLayers'
import { Banners, usePlates } from '../roll/Banner'
import { RollStage } from '../roll/RollStage'
import { RollSound } from '../roll/sound'
import { RingPortrait } from '../shell/RingPortrait'
import { useGame } from '../store/game'
import type { MapView, TokenView, Vec3, View } from '../types'
import { Downside } from './Downside'
import { BurnFilms, FilmPlayer } from './Film'
import { JoinCard } from './JoinCard'

/**
 * The TV at the table (the Stage seat). Full screen: the party's map with only what everyone may see, no crew
 * rail; a roll takes the whole screen as a big banner or as God's turn (Round 17); films and rolls make their sound here.
 * Its camera is set from the GM tab. It needs one click before the browser lets it go full screen and play sound.
 * Moving the mouse shows the cursor and a way to log out, for a few seconds; the GM tab's preview has neither.
 */
export function Tv({ onLogout }: { onLogout?: () => void }) {
  const view = useGame((s) => s.view)
  const preview = useGame((s) => s.preview) // the GM tab's small preview of the TV: no click, no sound
  const [started, setStarted] = useState(!!preview)
  const plates = usePlates()
  const focus = plates[plates.length - 1]?.r.token ?? null // the token whose roll is on the screen
  const world = useRef<HTMLDivElement>(null)
  const sound = useRef<RollSound | null>(null)
  useEffect(() => () => sound.current?.close(), [])
  const k = useScale()
  const awake = useAwake()
  if (!view) return <div className="app-tv app-wait">Docking…</div>
  const map = view.maps[view.party_map]
  const tokens = Object.values(view.tokens).filter((t) => map && t.map === map.id)
  const mood = map?.moods.find((m) => m.id === map.mood)

  const start = () => {
    void document.documentElement.requestFullscreen?.().catch(() => undefined)
    sound.current = new RollSound()
    sound.current.unlock()
    setStarted(true) // this click also lets the films play their sound
  }

  return (
    <div className={'app-tv' + (awake ? ' awake' : '')} style={{ '--k': k } as React.CSSProperties}>
      <div ref={world} className="app-rollworld tvw">
        {map ? <TvMap map={map} tokens={tokens} view={view} focus={focus} /> : <div className="app-wait">Somewhere the map doesn't reach.</div>}
        {map && (
          <div className="app-tvplace">
            <div className="r4-place">{map.name}</div>
            {mood && <div className="r12-tvmood">{mood.label}</div>}
          </div>
        )}
        <TvFights view={view} sound={started ? sound.current : null} />
        {view.stage.join?.show && (
          <aside className="app-tvjoin" aria-label="How to join the game">
            <JoinCard join={view.stage.join} />
          </aside>
        )}
      </div>
      <Banners where="tv" />
      <RollStage world={world} tv sound={started ? sound.current : null} />
      <Downside />
      {(view.stage.films ?? []).map((src) => (
        <FilmPlayer key={src} src={src} film={view.stage.film} sound={!preview} />
      ))}
      <BurnFilms />
      {!started && (
        <div className="app-tvstart">
          <button type="button" className="app-tvgo" onClick={start}>
            <span className="r4-place">The TV</span>
            <span>Click anywhere to start. It goes full screen, and films and rolls play their sound here.</span>
          </button>
          {onLogout && (
            <button type="button" className="r4-btn app-tvout" onClick={onLogout}>
              Not the TV? Log out
            </button>
          )}
        </div>
      )}
      {started && onLogout && (
        <button type="button" className="r4-btn app-tvexit" onClick={onLogout}>
          Log out of the TV
        </button>
      )}
    </div>
  )
}

/** Round 12 drew the TV at 1440 x 810: the labels keep those proportions on any screen. */
function useScale() {
  const read = () => Math.min(window.innerWidth / 1440, window.innerHeight / 810) || 1
  const [k, setK] = useState(read)
  useEffect(() => {
    const on = () => setK(read())
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return k
}

/** True for a few seconds after the mouse moves: the cursor and the log-out show. */
function useAwake() {
  const [awake, setAwake] = useState(false)
  useEffect(() => {
    let t = 0
    const on = () => {
      setAwake(true)
      window.clearTimeout(t)
      t = window.setTimeout(() => setAwake(false), 3000)
    }
    window.addEventListener('pointermove', on)
    return () => {
      window.removeEventListener('pointermove', on)
      window.clearTimeout(t)
    }
  }, [])
  return awake
}

interface Cam {
  px: number
  py: number
  zoom: number
}

const PAD_X = 240 // world px kept around what the camera frames
const PAD_TOP = 300 // a token stands about 100 px tall above its foot
const PAD_BOTTOM = 160
const ROW_H = 110 // the turn order's rows, at the 1440 x 810 they were drawn at (see fight.css)
const ROW_GAP = 8
const ROW_FOOT = 18
const UNDER_BANNER = 0.28 // the share of the screen a roller's token sits below the middle, clear of the banner
const CREW_MAX = 1.25
const ONE_MAX = 1.5

/**
 * Frame some points on the map (world px): as close as `max` allows while every point fits, never further out
 * than the whole map, and kept on the art where the map is bigger than the screen. `lower` moves them down the
 * screen by that much, under the banner. `bottom` is what the turn order covers along the bottom edge: the points
 * fit above it, and the art still runs under it.
 */
function frame(size: [number, number], map: MapView, pts: [number, number][], max: number, lower = 0, bottom = 0): Cam {
  const [w, h] = size
  const clear = h - bottom
  const [W, H] = map.display
  const all = Math.min(w / W, h / H)
  if (!pts.length) return { zoom: all, px: (w - W * all) / 2, py: (h - H * all) / 2 }
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const x0 = Math.min(...xs) - PAD_X
  const x1 = Math.max(...xs) + PAD_X
  const y0 = Math.min(...ys) - PAD_TOP
  const y1 = Math.max(...ys) + PAD_BOTTOM
  const zoom = Math.max(all, Math.min(max, w / (x1 - x0), clear / (y1 - y0)))
  const keep = (p: number, view: number, world: number) => (world * zoom >= view ? Math.min(0, Math.max(view - world * zoom, p)) : (view - world * zoom) / 2)
  return {
    zoom,
    px: keep(w / 2 - ((x0 + x1) / 2) * zoom, w, W),
    py: keep(clear / 2 + lower - ((y0 + y1) / 2) * zoom, h, H),
  }
}

function TvMap({ map, tokens, view, focus }: { map: MapView; tokens: TokenView[]; view: View; focus: string | null }) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<[number, number]>([0, 0])
  const remote = useGame((s) => s.remote)
  const [W, H] = map.display
  const fight = view.fights?.find((f) => f.map === map.id)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize([e.contentRect.width, e.contentRect.height]))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const where = (t: TokenView): Vec3 => remote[t.id]?.at ?? t.at
  const at = (t: TokenView) => proj(map.origin, where(t))
  const crew = tokens.filter((t) => t.kind === 'crew')
  const { camera, follow } = view.stage
  const followed = crew.find((t) => t.ref === follow)
  const rolling = camera === 'roller' && focus ? tokens.find((t) => t.id === focus) : undefined
  const rows = view.fights?.length ?? 0
  const bottom = rows ? (Math.min(size[0] / 1440, size[1] / 810) || 1) * (ROW_FOOT + rows * ROW_H + (rows - 1) * ROW_GAP) : 0
  // with a fight on, everyone in it stays in the shot, clear of the turn order
  const party = tokens.filter((t) => t.kind === 'crew' || fighterIn(fight, t.id))
  const cam = !size[0]
    ? null
    : rolling
      ? frame(size, map, [at(rolling)], ONE_MAX, size[1] * UNDER_BANNER, bottom)
      : camera === 'follow' && followed
        ? frame(size, map, [at(followed)], ONE_MAX, 0, bottom)
        : frame(size, map, party.map(at), CREW_MAX, 0, bottom)

  return (
    <div ref={box} className="app-mapbox app-tvmap">
      {cam && (
        <div className="app-world app-tvworld" style={{ width: W, height: H, transform: `translate(${cam.px}px, ${cam.py}px) scale(${cam.zoom})` }}>
          <MapLayers map={map} />
          {tokens.map((t) => {
            const [x, y] = at(t)
            const c = t.kind === 'crew' ? view.crew.find((m) => m.id === t.ref) : undefined
            const fighter = c ? undefined : fighterIn(fight, t.id)
            const r = c ? ring(c.hp, c.entropy, 64, 9, c.health) : fighter ? hpRing(fighter.hp, fighter.health, t.color, 64, 5) : plainRing(t.color, 64, 5)
            return (
              <span key={t.id} className="r3-tok app-fixedtok" role="img" aria-label={t.name} style={{ left: x, top: y, zIndex: Math.round(y), transform: t.size && t.size !== 1 ? `scale(${t.size})` : undefined }}>
                <span style={{ position: 'absolute', left: '50%', bottom: 0, width: 34, height: 16, marginLeft: -17, borderRadius: '50%', boxSizing: 'border-box', border: `1.5px solid ${t.color}`, background: 'rgba(0,0,0,.35)' }} />
                <span style={{ position: 'absolute', left: '50%', bottom: 8, width: 1.5, height: 36, marginLeft: -0.75, background: t.color }} />
                <ChipFx id={c ? `c:${c.id}` : `t:${t.id}`} down={c ? c.hp <= 0 : !!fighter && fighter.hp <= 0} style={{ position: 'absolute', left: 0, top: 0, width: 64, height: 64 }}>
                  <RingPortrait src={t.portrait} ring={r} size={64} />
                </ChipFx>
              </span>
            )
          })}
          {map.objects.map((o) => {
            const [x, y] = proj(map.origin, o.at)
            return (
              <span key={o.id} className="app-mk seen" role="img" aria-label={o.name} style={{ left: x, top: y, zIndex: Math.round(y) }}>
                <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
                  <path d="M11 1.5 L20.5 11 L11 20.5 L1.5 11 Z" fill="rgba(0,0,0,.6)" stroke="#ffffff" strokeWidth="1.8" />
                  <circle cx="11" cy="11" r="2.1" fill="#ffffff" />
                </svg>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
