import { gmRun } from '../store/game'
import type { View } from '../types'
import { filmOn, useTick } from './StageSections'

const nudge = (args: Record<string, unknown>) => void gmRun('gm.stage.nudge', args)

const PANS: { label: string; args: { x?: number; y?: number }; turn: number }[] = [
  { label: 'left', args: { x: -1 }, turn: 180 },
  { label: 'up', args: { y: -1 }, turn: 270 },
  { label: 'down', args: { y: 1 }, turn: 90 },
  { label: 'right', args: { x: 1 }, turn: 0 },
]

function Chevron({ turn }: { turn: number }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" style={{ transform: `rotate(${turn}deg)` }}>
      <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

/**
 * The TV's camera, on the Scene tab: what it looks at (the crew, one of them, or whoever rolls), and quick zoom and
 * pan on top of that shot, while you watch the TV. Picking a new shot centres it again.
 */
export function TvCameraBar({ view }: { view: View }) {
  const { camera, follow, zoom = 0, pan = [0, 0] } = view.stage
  const busy = filmOn(view.stage) // the camera can't change under a film
  useTick(busy)
  const shoot = (args: Record<string, unknown>) => void gmRun('gm.stage.camera', args)
  const moved = zoom !== 0 || pan[0] !== 0 || pan[1] !== 0
  return (
    <div className="r10-mood r10-cam" role="group" aria-label="The TV's camera">
      <span className="r10-camlabel">TV camera</span>
      <button type="button" className={camera === 'crew' ? 'on' : ''} aria-pressed={camera === 'crew'} disabled={busy} title="Keep the whole crew in frame" onClick={() => shoot({ camera: 'crew' })}>
        Crew
      </button>
      {view.crew.map((c) => {
        const on = camera === 'follow' && follow === c.id
        return (
          <button key={c.id} type="button" className={'r10-camface' + (on ? ' on' : '')} aria-pressed={on} aria-label={`Follow ${c.short}`} title={`Follow ${c.short}`} disabled={busy} onClick={() => shoot({ camera: 'follow', follow: c.id })}>
            <img src={c.portrait} alt="" className="r3-px" />
          </button>
        )
      })}
      <button type="button" className={camera === 'roller' ? 'on' : ''} aria-pressed={camera === 'roller'} disabled={busy} title="Show the crew, cut to whoever rolls, then come back" onClick={() => shoot({ camera: 'roller' })}>
        Rolls
      </button>
      <button type="button" className="r10-camic" aria-label="Zoom out" title="Zoom out" disabled={busy} onClick={() => nudge({ zoom: -1 })}>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2 6h8" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
      <button type="button" className="r10-camic" aria-label="Zoom in" title="Zoom in" disabled={busy} onClick={() => nudge({ zoom: 1 })}>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2 6h8M6 2v8" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
      {PANS.map((p) => (
        <button key={p.label} type="button" className="r10-camic" aria-label={`Move the camera ${p.label}`} title={`Move the camera ${p.label}`} disabled={busy} onClick={() => nudge(p.args)}>
          <Chevron turn={p.turn} />
        </button>
      ))}
      <button type="button" disabled={busy || !moved} title="Back to the plain shot" onClick={() => nudge({ reset: true })}>
        Recentre
      </button>
    </div>
  )
}
