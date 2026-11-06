import { useEffect, useRef, useState } from 'react'
import { useGame } from '../store/game'

const SHOW_MS = 10000

/**
 * A failed skill's downside, big, on the TV for the whole table: "IF THE ROLL FAILS", the skill and what happens
 * now. It shows when the GM calls a skill roll a failure (a natural 1 always is). Peter narrates it; this is so
 * nobody has to ask what it was.
 */
export function Downside() {
  const view = useGame((s) => s.view)
  const seen = useRef<Set<string> | null>(null)
  const [cur, setCur] = useState<{ id: string; until: number } | null>(null)
  const rolls = view?.rolls
  useEffect(() => {
    if (!rolls) return
    const failed = rolls.filter((r) => r.failed && r.char && r.entry)
    if (!seen.current) {
      seen.current = new Set(failed.map((r) => r.id)) // already failed before this screen connected
      return
    }
    const fresh = failed.filter((r) => !seen.current!.has(r.id))
    fresh.forEach((r) => seen.current!.add(r.id))
    const newest = fresh[fresh.length - 1]
    if (newest) setCur({ id: newest.id, until: Date.now() + SHOW_MS })
  }, [rolls])
  useEffect(() => {
    if (!cur) return
    const t = window.setTimeout(() => setCur((c) => (c?.id === cur.id ? null : c)), cur.until - Date.now())
    return () => window.clearTimeout(t)
  }, [cur])
  if (!view || !cur) return null
  const r = view.rolls.find((x) => x.id === cur.id)
  const c = r && view.crew.find((m) => m.id === r.char)
  const k = c?.list.find((e) => e.name === r?.entry)
  if (!r || !c || !k?.downside) return null
  return (
    <div className="app-down" role="status">
      {k.icon && <img src={k.icon} alt="" className="r3-px" />}
      <div className="app-down-txt">
        <span className="app-down-lab">{c.short} · if the roll fails</span>
        <span className="app-down-name">{k.name}</span>
        <span className="app-down-say">{k.downside}</span>
      </div>
    </div>
  )
}
