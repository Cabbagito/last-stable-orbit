import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { objectKey } from '../inspect/objects'
import { proj, unproj } from '../lib/proj'
import { hpRing, plainRing, ring } from '../lib/ring'
import { fighterIn, turnNow } from '../fight/fights'
import { useLanding } from '../fight/Strip'
import { ChipFx } from '../fx/ChipFx'
import { serverClock } from '../net/clock'
import { send, useGame } from '../store/game'
import type { MapView as MapDef, MapObject, TokenView, Vec3 } from '../types'
import { RingPortrait } from '../shell/RingPortrait'
import { Chip, Orbit, calloutKey, calloutSpeech, isSpinning } from '../roll/Callout'
import { calloutsBy } from '../roll/callouts'
import { BurnCallout, Flare, burnSpeech, useBurnMark } from '../stage/BurnMark'
import { Eye } from '../gm/parts'
import { MapLayers } from './MapLayers'

interface Cam {
  px: number
  py: number
  zoom: number
}

type Gesture =
  | { kind: 'pan'; sx: number; sy: number; px: number; py: number; moved: boolean; pressed: string | null }
  | { kind: 'tok'; token: string; sx: number; sy: number; ox: number; oy: number; z: number; moved: boolean; last: number; at: Vec3 }

const ZMIN = 0.3
const ZMAX = 3
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const DRAG_HZ = 50 // ms between live drag frames
const YOU = '#5ee08c' // your own chip's stem and the ring at its feet

/** One isometric map: art layers per mood and switch, tokens on top, pan / zoom / drag. */
export function MapView({ map, tokens, canMove }: { map: MapDef; tokens: TokenView[]; canMove: (t: TokenView) => boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<[number, number]>([0, 0])
  const [cam, setCam] = useState<Cam | null>(null)
  const fittedFor = useRef<string | null>(null)
  const gesture = useRef<Gesture | null>(null)
  const remote = useGame((s) => s.remote)
  const local = useGame((s) => s.local)
  const selected = useGame((s) => s.selected)
  const select = useGame((s) => s.select)
  const setLocal = useGame((s) => s.setLocal)
  const crewList = useGame((s) => s.view?.crew)
  const fight = useGame((s) => s.view?.fights?.find((f) => f.map === map.id))
  useLanding(fight) // re-render when the dice have landed: that's when the turn shows on the board
  const myChar = useGame((s) => s.view?.me.char)
  const rolls = useGame((s) => s.view?.rolls)
  const calls = useGame((s) => s.calls)
  useGame((s) => s.callTick) // re-render when a callout fades
  const burning = useBurnMark()
  const isGm = useGame((s) => s.view?.me.role === 'gm')
  const showPins = useGame((s) => s.pins && !s.preview)
  const [hover, setHover] = useState<string | null>(null) // a token or object under the mouse: it shows its name
  const [W, H] = map.display

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize([e.contentRect.width, e.contentRect.height]))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fit = useCallback(() => {
    const [w, h] = size
    if (!w || !h) return
    const zoom = clamp(Math.min(w / W, h / H), ZMIN, ZMAX)
    setCam({ zoom, px: (w - W * zoom) / 2, py: (h - H * zoom) / 2 })
  }, [size, W, H])

  useEffect(() => {
    if (size[0] && fittedFor.current !== map.id) {
      fittedFor.current = map.id
      fit()
    }
  }, [size, map.id, fit])

  // Trackpad and wheel. The listener is non-passive so preventDefault works: otherwise Chrome on a Mac
  // reads a sideways two-finger scroll as "go back a page", and a pinch zooms the whole page.
  //   two-finger scroll -> pan     pinch (ctrlKey wheel, or Safari's gesture events) -> zoom
  //   mouse wheel -> zoom (coarse, whole-line or 100-ish steps with no sideways part)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const zoomBy = (f: number, clientX: number, clientY: number) => {
      const r = el.getBoundingClientRect()
      const cx = clientX - r.left
      const cy = clientY - r.top
      setCam((c) => {
        if (!c) return c
        const nz = clamp(c.zoom * f, ZMIN, ZMAX)
        const k = nz / c.zoom
        return { zoom: nz, px: cx - (cx - c.px) * k, py: cy - (cy - c.py) * k }
      })
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 800 : 1
      const dx = e.deltaX * unit
      const dy = e.deltaY * unit
      const mouseWheel = e.deltaMode !== 0 || (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50)
      if (e.ctrlKey) zoomBy(Math.exp(-dy * 0.01), e.clientX, e.clientY)
      else if (mouseWheel) zoomBy(Math.exp(-dy * 0.0015), e.clientX, e.clientY)
      else setCam((c) => (c ? { ...c, px: c.px - dx, py: c.py - dy } : c))
    }
    type GestureEv = Event & { scale: number; clientX: number; clientY: number }
    let last = 1
    const onGestureStart = (e: Event) => {
      e.preventDefault()
      last = 1
    }
    const onGestureChange = (e: Event) => {
      e.preventDefault()
      const g = e as GestureEv
      zoomBy(g.scale / last, g.clientX, g.clientY)
      last = g.scale
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('gesturestart', onGestureStart)
    el.addEventListener('gesturechange', onGestureChange)
    el.addEventListener('gestureend', onGestureStart)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('gesturestart', onGestureStart)
      el.removeEventListener('gesturechange', onGestureChange)
      el.removeEventListener('gestureend', onGestureStart)
    }
  }, [])

  const where = (t: TokenView): Vec3 => {
    if (local?.token === t.id) return local.at
    const r = remote[t.id]
    return r ? r.at : t.at
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !cam) return
    box.current?.setPointerCapture(e.pointerId)
    gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, px: cam.px, py: cam.py, moved: false, pressed: null }
  }

  const onTokenDown = (e: React.PointerEvent, t: TokenView) => {
    if (e.button !== 0 || !cam) return
    e.stopPropagation()
    box.current?.setPointerCapture(e.pointerId)
    if (canMove(t)) {
      const at = where(t)
      const [ox, oy] = proj(map.origin, at)
      gesture.current = { kind: 'tok', token: t.id, sx: e.clientX, sy: e.clientY, ox, oy, z: at[2], moved: false, last: 0, at }
    } else {
      gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, px: cam.px, py: cam.py, moved: false, pressed: t.id }
    }
  }

  // An object's marker selects like a token you can't move: press without dragging and its card opens.
  const onMarkDown = (e: React.PointerEvent, key: string) => {
    if (e.button !== 0 || !cam) return
    e.stopPropagation()
    box.current?.setPointerCapture(e.pointerId)
    gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, px: cam.px, py: cam.py, moved: false, pressed: key }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current
    if (!g || !cam) return
    const dx = e.clientX - g.sx
    const dy = e.clientY - g.sy
    if (!g.moved && Math.abs(dx) + Math.abs(dy) <= 3) return
    g.moved = true
    setHover(null)
    if (g.kind === 'pan') {
      setCam({ ...cam, px: g.px + dx, py: g.py + dy })
      return
    }
    const at = unproj(map.origin, [g.ox + dx / cam.zoom, g.oy + dy / cam.zoom], g.z)
    g.at = at
    setLocal({ token: g.token, at })
    const now = performance.now()
    if (now - g.last >= DRAG_HZ) {
      g.last = now
      useGame.getState().socket?.drag(g.token, at)
    }
  }

  const onPointerUp = () => {
    const g = gesture.current
    gesture.current = null
    if (!g) return
    if (g.kind === 'tok') {
      if (g.moved) {
        const token = g.token
        send('token.move', { token, at: g.at }).then(() => {
          if (useGame.getState().local?.token === token) setLocal(null)
        })
      } else {
        select(selected === g.token ? null : g.token)
      }
      return
    }
    if (!g.moved) select(g.pressed && selected !== g.pressed ? g.pressed : null)
  }

  const scale = cam ? clamp(0.8 / cam.zoom, 0.6, 1.8) : 1
  const callouts = calloutsBy(rolls ?? [], calls, Date.now(), (r) => (r.god ? null : r.token)) // God has the whole screen
  const turn = turnNow(fight, serverClock.now() / 1000)
  return (
    <div
      ref={box}
      className="app-mapbox"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={fit}
    >
      {cam && (
        <div
          className="app-world"
          style={{ width: W, height: H, transform: `translate(${cam.px}px, ${cam.py}px) scale(${cam.zoom})` }}
        >
          <MapLayers map={map} />
          {tokens.map((t) => {
            const [x, y] = proj(map.origin, where(t))
            const on = selected === t.id
            const crew = t.kind === 'crew' ? crewList?.find((c) => c.id === t.ref) : undefined
            const mine = !!crew && crew.id === myChar
            const isTurn = turn === t.id
            const foot = on ? '#ffffff' : mine ? YOU : t.color
            // an NPC in a fight on this map shows its health, in its faction's colour (M8)
            const fighter = crew ? undefined : fighterIn(fight, t.id)
            const r = crew ? ring(crew.hp, crew.entropy, 64, 9, crew.health) : fighter ? hpRing(fighter.hp, fighter.health, t.color, 64, 5) : plainRing(t.color, 64, 5)
            const down = crew ? crew.hp <= 0 : !!fighter && fighter.hp <= 0
            const burn = burning && t.kind === 'crew' && t.ref === burning.char ? burning : null
            const call = burn ? undefined : callouts[t.id] // a Burn's mark takes the roll callout's place
            return (
              <button
                key={t.id}
                type="button"
                className={'r3-tok' + (t.hidden ? ' app-hiddentok' : '') + (canMove(t) ? '' : ' app-fixedtok') + (isTurn ? ' app-tokturn' : '')}
                aria-label={t.name + (mine ? ' (you)' : '') + (t.hidden ? ' (hidden from players)' : '') + (isTurn ? ', their turn' : '') + (call ? `, ${calloutSpeech(call.r)}` : '') + (burn ? `, ${burnSpeech(burn)}` : '')}
                onPointerDown={(e) => onTokenDown(e, t)}
                onPointerEnter={() => setHover(t.id)}
                onPointerLeave={() => setHover((h) => (h === t.id ? null : h))}
                style={{ left: x, top: y, transform: `scale(${scale * (t.size ?? 1)})`, zIndex: Math.round(y) + (call || burn || hover === t.id ? 3000 : 0) }}
              >
                {mine && <span className="app-youring" style={{ '--you': YOU } as React.CSSProperties} />}
                <span style={{ position: 'absolute', left: '50%', bottom: 0, width: 34, height: 16, marginLeft: -17, borderRadius: '50%', boxSizing: 'border-box', border: `1.5px solid ${foot}`, background: 'rgba(0,0,0,.35)' }} />
                <span style={{ position: 'absolute', left: '50%', bottom: 8, width: 1.5, height: 36, marginLeft: -0.75, background: foot }} />
                {/* everything that belongs to the head, so it all lifts together on their turn */}
                <span className="app-tokhead">
                  {isTurn && <span className="app-tokglow" />}
                  <ChipFx id={crew ? `c:${crew.id}` : `t:${t.id}`} down={down} style={{ position: 'absolute', left: 0, top: 0, width: 64, height: 64 }}>
                    <RingPortrait src={t.portrait} ring={r} size={64} />
                  </ChipFx>
                  {call && isSpinning(call.r) && <Orbit stat={call.r.stat} />}
                  {burn && <Flare m={burn} />}
                  {t.hidden && (
                    <b className="r10-eyeb" aria-hidden="true">
                      <Eye off size={14} />
                    </b>
                  )}
                </span>
                {call && !isSpinning(call.r) && <Chip key={calloutKey(call.r)} r={call.r} fading={call.fading} />}
                {burn && <BurnCallout key={burn.at} m={burn} side="s-t" />}
                {!call && !burn && hover === t.id && !on && local?.token !== t.id && (
                  <span className="app-tag" aria-hidden="true">
                    {t.name}
                  </span>
                )}
              </button>
            )
          })}
          {isGm &&
            showPins &&
            map.pins?.map((p, i) => {
              const [x, y] = proj(map.origin, p.at)
              return (
                <span key={i} className="app-pin" role="img" aria-label={`${p.k}: ${p.label}`} style={{ left: x, top: y, transform: `scale(${scale})` }}>
                  {p.k}
                  <span className="app-tag" aria-hidden="true">
                    {p.label}
                  </span>
                </span>
              )
            })}
          {map.objects.map((o) => (
            <Marker
              key={o.id}
              o={o}
              map={map}
              scale={scale}
              open={selected === objectKey(map.id, o.id)}
              hovered={hover === objectKey(map.id, o.id)}
              isGm={isGm}
              onDown={(e) => onMarkDown(e, objectKey(map.id, o.id))}
              onKey={() => select(selected === objectKey(map.id, o.id) ? null : objectKey(map.id, o.id))}
              onHover={(on) => setHover((h) => (on ? objectKey(map.id, o.id) : h === objectKey(map.id, o.id) ? null : h))}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * A thing you can inspect. Pink and pulsing until you've looked at it, then quieter; white while its card is
 * open. The GM also sees the hidden ones, faded.
 */
function Marker({
  o,
  map,
  scale,
  open,
  hovered,
  isGm,
  onDown,
  onKey,
  onHover,
}: {
  o: MapObject
  map: MapDef
  scale: number
  open: boolean
  hovered: boolean
  isGm: boolean
  onDown: (e: React.PointerEvent) => void
  onKey: () => void
  onHover: (on: boolean) => void
}) {
  const [x, y] = proj(map.origin, o.at)
  const fresh = !isGm && !o.seen
  const state = open ? 'open' : fresh ? 'unseen' : 'seen'
  const ink = state === 'unseen' ? '#ff4fa3' : '#ffffff'
  return (
    <button
      type="button"
      className={`app-mk ${state}` + (hovered ? ' hov' : '') + (isGm && !o.shown ? ' off' : '')}
      aria-label={`Inspect ${o.name}` + (fresh ? ', not looked at yet' : '') + (isGm && !o.shown ? ' (hidden from players)' : '')}
      onPointerDown={onDown}
      onClick={(e) => e.detail === 0 && onKey()} // Enter or Space; a mouse press selects through the map's gesture
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      style={{ left: x, top: y, transform: `scale(${scale})`, zIndex: Math.round(y) + (hovered ? 3000 : 0) }}
    >
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <path d="M11 1.5 L20.5 11 L11 20.5 L1.5 11 Z" fill={open ? '#ffffff' : 'rgba(0,0,0,.6)'} stroke={ink} strokeWidth="1.8" />
        <circle cx="11" cy="11" r="2.1" fill={open ? '#000000' : ink} />
      </svg>
      {hovered && !open && (
        <span className="app-tag" aria-hidden="true">
          {o.name}
        </span>
      )}
    </button>
  )
}
