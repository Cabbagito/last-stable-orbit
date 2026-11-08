import { useState, type CSSProperties } from 'react'
import { gmRun } from '../store/game'
import type { View } from '../types'

/**
 * Events: send an overview (the Satisfaction Report, for now) to some of the crew. It rises over the map on their
 * screens. Their answers and the verdict stay there; you only see whose screen it's still open on, and can take it back.
 */
export function EventsSection({ view }: { view: View }) {
  const games = view.overviews?.games ?? []
  const open = view.overviews?.open ?? {}
  const [game, setGame] = useState<string | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [sent, setSent] = useState('')
  const pick = game ?? games[0]?.id ?? null
  const gameName = (id: string) => games.find((g) => g.id === id)?.name ?? id
  const nameOf = (id: string) => view.crew.find((c) => c.id === id)?.short ?? id
  const list = (ids: string[]) => (ids.length > 1 ? ids.slice(0, -1).join(', ') + ' and ' + ids[ids.length - 1] : ids[0])
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  const sendIt = async () => {
    if (!pick || !picked.length) return
    const chars = view.crew.map((c) => c.id).filter((id) => picked.includes(id))
    const ack = await gmRun('gm.overview.send', { overview: pick, chars })
    if (ack.ok) {
      setSent(`Sent to ${list(chars.map(nameOf))}. It's on their screens now.`)
      setPicked([])
    }
  }

  return (
    <section className="gx-events" aria-label="Events">
      <div className="gx-h2">Events</div>

      <div className="ev-send">
        <div className="ev-col">
          <div className="r5-sec">Event</div>
          <div className="ev-row">
            {games.map((g) => (
              <button key={g.id} type="button" className={'r10-btn' + (pick === g.id ? ' on' : '')} aria-pressed={pick === g.id} onClick={() => setGame(g.id)}>
                {g.name}
              </button>
            ))}
            {!games.length && <span className="r10-dimtxt">None in content/overviews.yaml yet.</span>}
          </div>
        </div>
        <div className="ev-col">
          <div className="r5-sec">To</div>
          <div className="ev-row">
            {view.crew.map((c) => (
              <button key={c.id} type="button" className={'ev-pk' + (picked.includes(c.id) ? ' on' : '')} style={{ '--cc': c.color } as CSSProperties} aria-pressed={picked.includes(c.id)} onClick={() => toggle(c.id)}>
                <img src={c.portrait} alt="" />
                <span>{c.short}</span>
              </button>
            ))}
            <button type="button" className="r10-btn" onClick={() => setPicked(picked.length === view.crew.length ? [] : view.crew.map((c) => c.id))}>
              {picked.length === view.crew.length ? 'Nobody' : 'Everyone'}
            </button>
          </div>
        </div>
        <button type="button" className="r12-go ev-go" disabled={!pick || !picked.length} onClick={() => void sendIt()}>
          Send
        </button>
      </div>
      {sent && (
        <div className="r10-hint" aria-live="polite" style={{ marginTop: 10 }}>
          {sent}
        </div>
      )}

      <div className="r5-rows" style={{ marginTop: 10 }}>
        {Object.entries(open).map(([char, o]) => (
          <div key={char} className="r5-row ev-open">
            <span>
              <b>{nameOf(char)}</b> <span className="r10-dimtxt">· {gameName(o.kind)}</span>
            </span>
            <button type="button" className="r10-btn" onClick={() => void gmRun('gm.overview.recall', { char })}>
              Take it back
            </button>
          </div>
        ))}
        {!Object.keys(open).length && <div className="r10-dimtxt">Nothing is open on anyone's screen.</div>}
      </div>
    </section>
  )
}
