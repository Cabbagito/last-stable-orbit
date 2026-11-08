import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { GolfGreen } from '../types'
import { H, W, advance, aimAt, freshGame, outcome, params, readPull, strike, type Drag, type Pt } from './golf'
import { drawControls, drawGreen } from './golfDraw'

type Phase = 'aim' | 'drag' | 'roll' | 'done'

interface Ui {
  phase: Phase
  aim: number | null
  power: number
  curve: number
  cancelZone: boolean
  result: string
  detail: string
}

const AIMING: Ui = { phase: 'aim', aim: null, power: 0, curve: 0, cancelZone: true, result: '', detail: '' }

/**
 * Mini-golf (the Mini-golf canvas's "drag to putt" board): one putt on the board's green. Press where to aim, drag for
 * power and curve, let go. It all happens on this screen; closing it only tells the server it's closed.
 */
export function Green({ green, onClose }: { green: GolfGreen; onClose: () => void }) {
  const P = useMemo(() => params(green), [green])
  const room = useRef<HTMLCanvasElement>(null)
  const controls = useRef<HTMLCanvasElement>(null)
  const game = useRef(freshGame())
  const drag = useRef<Drag | null>(null)
  const hover = useRef<Pt | null>(null)
  const [ui, setUi] = useState(AIMING)
  const live = useRef(ui) // the frame loop reads this, not a render's copy

  const show = (next: Partial<Ui>) => {
    live.current = { ...live.current, ...next }
    setUi(live.current)
  }
  const toAim = () => {
    drag.current = null
    show(AIMING)
  }

  useEffect(() => {
    let raf = 0
    let last = 0
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0
      last = now
      const g = game.current
      if (live.current.phase === 'roll') {
        advance(g, P, dt)
        if (g.ended) {
          live.current = { ...live.current, phase: 'done', ...outcome(g) }
          setUi(live.current)
        }
      } else {
        g.t += dt
      }
      if (g.sink > 0) g.sink = Math.max(0, g.sink - dt * 0.8)
      const a = room.current?.getContext('2d')
      if (a) drawGreen(a, g, P)
      const b = controls.current?.getContext('2d')
      if (b) drawControls(b, g, P, live.current.phase, hover.current, drag.current)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [P])

  const toGame = (e: ReactPointerEvent): Pt => {
    const r = room.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height }
  }

  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const { phase } = live.current
    if (phase === 'done' && e.button === 0) return onClose()
    if (phase !== 'aim' || e.button !== 0) return
    const p = toGame(e)
    const aim = aimAt(p, game.current.ball)
    drag.current = { sx: p.x, sy: p.y, x: p.x, y: p.y, aim }
    hover.current = null
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // the drag still works while the pointer stays on the green
    }
    show({ phase: 'drag', aim, power: 0, curve: 0, cancelZone: true })
  }

  const move = (e: ReactPointerEvent) => {
    const { phase, power, curve, cancelZone } = live.current
    // a second button pressed mid-drag arrives as a move, not a press
    if (phase === 'drag' && e.button === 2) return toAim()
    const p = toGame(e)
    if (phase === 'aim') {
      hover.current = p
      return
    }
    if (phase !== 'drag' || !drag.current) return
    drag.current.x = p.x
    drag.current.y = p.y
    const pr = readPull(drag.current, P.showCurve)
    const pw = Math.round(pr.p * 100) / 100
    if (pw !== power || pr.curve !== curve || pr.cancel !== cancelZone) show({ power: pw, curve: pr.curve, cancelZone: pr.cancel })
  }

  const up = (e: ReactPointerEvent) => {
    if (live.current.phase !== 'drag' || !drag.current) return
    const p = toGame(e)
    drag.current.x = p.x
    drag.current.y = p.y
    const pr = readPull(drag.current, P.showCurve)
    const { aim } = drag.current
    drag.current = null
    if (pr.cancel) return toAim()
    strike(game.current, aim, pr.p, pr.curve)
    show({ phase: 'roll', power: pr.p, curve: pr.curve, cancelZone: false })
  }

  const { phase, aim, power, curve, cancelZone, result, detail } = ui
  const dragging = phase === 'drag'
  const pulling = dragging && !cancelZone
  const settled = phase === 'roll' || phase === 'done'
  const aimText = aim === null || phase === 'aim' ? '—' : aim === 0 ? 'STRAIGHT' : `${Math.abs(aim).toFixed(1)}° ${aim < 0 ? 'LEFT' : 'RIGHT'}`
  const powerText = pulling || settled ? `${Math.round(power * 100)}%` : '—'
  const curveText = pulling || settled ? (curve === 0 ? 'NONE' : `${curve < 0 ? 'LEFT' : 'RIGHT'} ${Math.abs(curve).toFixed(1)}`) : '—'
  const hint =
    phase === 'aim'
      ? 'PRESS WHERE YOU WANT TO AIM'
      : dragging
        ? cancelZone
          ? 'DRAG AWAY FOR POWER · LET GO HERE TO CANCEL'
          : P.showCurve
            ? 'LET GO TO PUTT · DRAG SIDEWAYS TO CURVE'
            : 'LET GO TO PUTT'
        : ''
  const cursor = dragging ? 'grabbing' : phase === 'aim' ? 'crosshair' : phase === 'done' ? 'pointer' : 'default'

  return (
    <>
      <div className="gf-top">
        <span>{green.header}</span>
        <span className="pink">{phase === 'done' ? 'SHOT TAKEN' : 'ONE SHOT'}</span>
      </div>
      <div className="gf-green">
        <canvas
          ref={room}
          className="gf-room"
          width={W}
          height={H}
          role="img"
          aria-label="Looking down the putting green from behind the ball, toward the hole by the duct hatch. Press where to aim, drag to set power and curve, let go to putt."
          style={{ cursor }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={() => live.current.phase === 'drag' && toAim()}
          onPointerLeave={() => (hover.current = null)}
          onContextMenu={(e) => e.preventDefault()}
        />
        <canvas ref={controls} className="gf-controls" width={W * 6} height={H * 6} aria-hidden="true" />
        <div className={'gf-hint' + (dragging && cancelZone ? ' plain' : '')}>{hint}</div>
        {phase === 'done' && (
          <div className="gf-end" role="status">
            <div className={'gf-result' + (result === 'IN THE HOLE' ? ' pink' : '')}>{result}</div>
            <div className="gf-detail">{detail}</div>
            <button type="button" className="gf-close" onClick={onClose}>
              CLICK TO CLOSE
            </button>
          </div>
        )}
      </div>
      <div className="gf-read">
        <Read label="AIM" value={aimText} />
        <Read label="POWER" value={powerText} />
        {P.showCurve && <Read label="CURVE" value={curveText} />}
      </div>
    </>
  )
}

function Read({ label, value }: { label: string; value: string }) {
  return (
    <div className="gf-lab">
      {label} <span>{value}</span>
    </div>
  )
}
