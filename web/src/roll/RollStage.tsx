import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject, type RefObject } from 'react'
import { serverClock } from '../net/clock'
import { useGame } from '../store/game'
import type { RollView } from '../types'
import { SIL_PATH, rollerOf, usePlates } from './Banner'
import { T_END, T_HIT, T_OFF, godShake, hexRgb, paintGod } from './godpaint'
import type { RollSound } from './sound'
import { dieIcon, lookOf, statIcon } from './stats'

const REDUCED = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const SHAKE_MS = 500 // a natural 1
// when God's words change, in seconds since the roll
const BEATS = [0.45, 0.8, 1.5, T_HIT, T_OFF, T_END]

const secondsSince = (r: RollView) => serverClock.now() / 1000 - r.started

/**
 * What a roll does to the whole screen (Round 17). When a die lands the edges of the screen flash in its colour and a
 * natural 1 shakes it; the GM's own rolls do neither. And God's turn: the screen goes grey and dark, a die falls and
 * cracks the floor, on every screen but the GM's, at one moment by the server's clock. `world` is what gets shaken and
 * greyed. The TV plays all this with sound; no other screen makes any.
 */
export function RollStage({ world, tv = false, sound = null }: { world: RefObject<HTMLDivElement | null>; tv?: boolean; sound?: RollSound | null }) {
  const plates = usePlates()
  const rolls = useGame((s) => s.view?.rolls)
  const isGm = useGame((s) => s.view?.me.role === 'gm')
  const seen = useRef<Record<string, string>>({})
  const shakeUntil = useRef(0)
  const [edge, setEdge] = useState({ n: 0, col: '#fff' })
  const loop = useLoop(world, shakeUntil)

  // each banner's changes: the flash, the shake, the sound
  useEffect(() => {
    for (const { r, phase, quiet } of plates) {
      const key = `${phase}-${r.pushes}-${r.chain ?? ''}`
      if (seen.current[r.id] === key) continue
      seen.current[r.id] = key
      if (quiet || phase === 'out') continue
      const col = phase === 'land' ? lookOf(r.stat).fx : phase === 'push' || phase === 'repush' ? '#f2b544' : phase === 'boom' ? '#ffd98a' : phase === 'nat1' ? '#ff5b4d' : null
      if (col && !REDUCED()) setEdge((e) => ({ n: e.n + 1, col }))
      if (phase === 'nat1' && !REDUCED()) {
        shakeUntil.current = performance.now() + SHAKE_MS
        loop.start()
      }
      sound?.crew(phase, r.stat)
    }
  }, [plates, sound, loop])

  // God: the newest God roll still inside its time. Kept here, because a later roll can push it out of the view.
  const [god, setGod] = useState<RollView | null>(null)
  useEffect(() => {
    if (isGm || !rolls) return
    const r = rolls.filter((x) => x.god).pop()
    if (!r) return
    if (r.id === god?.id) setGod(r) // its number has landed
    else if (secondsSince(r) < T_END && (!god || r.started > god.started)) setGod(r)
  }, [rolls, isGm]) // eslint-disable-line react-hooks/exhaustive-deps
  const godId = god?.id
  useEffect(() => {
    if (god && secondsSince(god) < 0.6) sound?.god(god.sealed)
  }, [godId, sound]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {edge.n > 0 && <div key={edge.n} className="r17-edge" style={{ '--c': edge.col } as CSSProperties} />}
      {god && <God key={god.id} r={god} tv={tv} world={world} loop={loop} onEnd={() => setGod((g) => (g?.id === god.id ? null : g))} />}
    </>
  )
}

type Paint = (t: number) => void

/** One animation loop, shared by a God roll and a natural 1's shake, running only while one of them needs it. */
function useLoop(world: RefObject<HTMLDivElement | null>, shakeUntil: MutableRefObject<number>) {
  const god = useRef<{ started: number; paint: Paint; shake: boolean; wrap: HTMLElement | null } | null>(null)
  const raf = useRef(0)
  const [api] = useState(() => {
    const frame = (now: number) => {
      raf.current = 0
      let dx = 0
      let dy = 0
      let sc = 1
      const g = god.current
      if (g) {
        const t = serverClock.now() / 1000 - g.started
        g.paint(t)
        if (g.shake) {
          const s = godShake(t, now)
          dx = s.dx
          dy = s.dy
          sc = s.sc
        }
        if (g.wrap) g.wrap.style.transform = `translate(${(dx * 1.2).toFixed(1)}px,${(dy * 1.2).toFixed(1)}px)`
      }
      if (now < shakeUntil.current) {
        const a = (12 * (shakeUntil.current - now)) / SHAKE_MS
        dx += Math.sin(now * 0.11) * a
        dy += Math.cos(now * 0.13) * a
      }
      const on = !!g || now < shakeUntil.current
      if (world.current) world.current.style.transform = on ? `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) scale(${sc.toFixed(4)})` : ''
      if (on) raf.current = requestAnimationFrame(frame)
    }
    return {
      start() {
        if (!raf.current) raf.current = requestAnimationFrame(frame)
      },
      setGod(g: typeof god.current) {
        god.current = g
        this.start()
      },
    }
  })
  useEffect(() => () => cancelAnimationFrame(raf.current), [])
  return api
}

function God({ r, tv, world, loop, onEnd }: { r: RollView; tv: boolean; world: RefObject<HTMLDivElement | null>; loop: ReturnType<typeof useLoop>; onEnd: () => void }) {
  const view = useGame((s) => s.view)
  const cv = useRef<HTMLCanvasElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [, tick] = useState(0)
  const [gk, setGk] = useState(1)
  const t = secondsSince(r)
  const L = lookOf(r.stat)
  const hidden = r.sealed

  // the words change on the beats; the die is painted every frame
  useEffect(() => {
    const ids = BEATS.filter((b) => b > t).map((b) => window.setTimeout(() => tick((n) => n + 1), (b - t) * 1000 + 20))
    ids.push(window.setTimeout(onEnd, (T_END - t) * 1000 + 40))
    return () => ids.forEach(clearTimeout)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // the words are laid out at the board's 1440 x 900 and scaled to this screen
  useEffect(() => {
    const on = () => setGk(Math.min(window.innerWidth / 1440, window.innerHeight / 900) || 1)
    on()
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])

  useEffect(() => {
    const tint = hidden ? ([255, 255, 255] as [number, number, number]) : hexRgb(L.fx)
    const el = world.current
    const reduced = REDUCED()
    loop.setGod({
      started: r.started,
      shake: !reduced,
      wrap: wrap.current,
      paint: (s) => {
        if (cv.current) paintGod(cv.current, reduced ? Math.max(s, T_HIT + 1) : s, { hidden, tint, tv })
        el?.classList.toggle('god', s < T_OFF)
      },
    })
    return () => {
      loop.setGod(null)
      el?.classList.remove('god')
    }
  }, [r.id, hidden]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!view) return null
  const who = rollerOf(view, r)
  const hit = t >= T_HIT
  const g1 = hit && hidden ? 'IT HAS LANDED.' : t < 0.45 ? '' : hidden && !r.stat ? 'THE GM IS ROLLING' : `${hidden ? 'SOMEONE' : who.name} ROLLS ${L.name}`
  const g2 = !hidden ? '' : hit ? 'YOU DON’T GET TO KNOW.' : t >= 1.5 ? 'YOUR FATE DEPENDS ON IT.' : ''
  const side = t >= 0.8 && !!r.stat
  const number = !hidden && hit ? r.value : undefined
  return (
    <div ref={wrap} className={'r17-god' + (tv ? ' tv' : '') + (t < T_OFF ? ' on' : ' off')} aria-live="polite">
      <div className="r17-gv" />
      <canvas ref={cv} className="r17-godcv" aria-hidden="true" />
      <div className="r17-gstage" style={{ '--gk': gk } as CSSProperties}>
        {side && r.stat && (
          <>
            <div className="r17-gside l" style={{ '--c': L.col } as CSSProperties}>
              {!hidden && who.face ? (
                <img className="r17-px r17-gface" src={who.face} alt="" draggable={false} />
              ) : (
                <svg className="r17-gface nosee" viewBox="0 0 32 34" shapeRendering="crispEdges" aria-hidden="true">
                  <path d={SIL_PATH} fill="currentColor" />
                </svg>
              )}
              <span className="r17-glab">{hidden ? 'SOMEONE' : who.name}</span>
            </div>
            <div className="r17-gside r" style={{ '--c': L.col } as CSSProperties}>
              <span className="r17-gicons">
                <img className="r17-px" src={statIcon(r.stat)} alt="" draggable={false} />
                <img className="r17-px" src={dieIcon(r.stat, r.sides)} alt="" draggable={false} />
              </span>
              <span className="r17-glab">
                {L.name} · D{r.sides}
              </span>
            </div>
          </>
        )}
        {g1 && (
          <div key={g1} className={`r17-gt r17-g1 ${hit && hidden ? 'b' : 'a'}`}>
            {g1}
          </div>
        )}
        {g2 && (
          <div key={g2} className={`r17-gt r17-g2 ${hit ? 'b' : 'a'}`}>
            {g2}
          </div>
        )}
        {number !== undefined && (
          <div className="r17-gnum" style={{ '--fx': L.fx } as CSSProperties}>
            <span>{number}</span>
          </div>
        )}
      </div>
    </div>
  )
}
