import { useEffect, useState } from 'react'
import type { View } from '../types'

type Run = (type: string, args: Record<string, unknown>) => Promise<void>

/**
 * The GM's hands on every inventory: pick a character, change an amount, move an item to someone else,
 * take it, or give one from the catalogue. Only the GM moves items. Milestone 4 redesigns this.
 */
export function GmPockets({ view, run }: { view: View; run: Run }) {
  const [who, setWho] = useState(view.crew[0]?.id ?? '')
  const [give, setGive] = useState('')
  const [amount, setAmount] = useState('')
  const holder = view.crew.find((c) => c.id === who)
  const items = view.inventory[who] ?? []
  const pick = view.items?.find((i) => i.id === give)
  const amountOk = !pick?.counted || Number(amount) >= 1
  if (!holder) return null

  const giveIt = async () => {
    if (!pick) return
    await run('gm.item.give', pick.counted ? { holder: who, item: pick.id, count: Math.floor(Number(amount)) } : { holder: who, item: pick.id })
    setAmount('')
  }

  return (
    <section aria-label="Pockets">
      <div className="r5-sec">Pockets</div>
      <div className="app-btnrow" role="group" aria-label="Whose pockets">
        {view.crew.map((c) => {
          const unseen = (view.inventory[c.id] ?? []).filter((e) => e.new).length
          return (
            <button
              key={c.id}
              type="button"
              className={'r4-btn app-toggle app-small' + (who === c.id ? ' on' : '')}
              aria-pressed={who === c.id}
              onClick={() => setWho(c.id)}
              title={unseen ? `${unseen} not looked at yet` : undefined}
            >
              {c.short}
              {unseen > 0 && <span className="app-unseen" aria-label={`, ${unseen} new`}> •</span>}
            </button>
          )
        })}
      </div>
      <div className="r5-rows" aria-label={`${holder.short}'s items`}>
        {items.length === 0 && <div className="app-dim">Nothing on {holder.short}.</div>}
        {items.map((e) => (
          <div key={e.uid} className="r5-row app-pocket">
            <img src={e.item.icon} alt="" className="r3-px" style={{ width: 32, height: 32 }} title={e.item.text} />
            <div className="app-grow">
              <div title={e.item.text}>
                {e.item.name}
                {e.new && <span className="app-unseen"> · not seen yet</span>}
              </div>
              <div className="app-btnrow">
                {e.item.counted && (
                  <CountInput
                    value={e.count ?? 0}
                    label={`${holder.short}'s ${e.item.name.toLowerCase()}`}
                    onCommit={(count) => run('gm.item.count', { holder: who, uid: e.uid, count })}
                  />
                )}
                <select
                  className="app-select app-small"
                  value=""
                  aria-label={`Move ${e.item.name} to`}
                  onChange={(ev) => ev.target.value && run('gm.item.move', { holder: who, uid: e.uid, to: ev.target.value })}
                >
                  <option value="">Move to…</option>
                  {view.crew
                    .filter((c) => c.id !== who)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.short}
                      </option>
                    ))}
                </select>
                <button type="button" className="r4-btn app-small" aria-label={`Take ${e.item.name} from ${holder.short}`} onClick={() => run('gm.item.take', { holder: who, uid: e.uid })}>
                  Take
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="app-btnrow">
        <select className="app-select app-grow" value={give} onChange={(e) => setGive(e.target.value)} aria-label={`Give ${holder.short} an item`}>
          <option value="">Give {holder.short}…</option>
          {view.items?.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        {pick?.counted && (
          <input
            className="app-select app-count"
            inputMode="numeric"
            placeholder="Amount"
            aria-label="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && amountOk && giveIt()}
          />
        )}
        <button type="button" className="r4-btn app-small" disabled={!pick || !amountOk} onClick={giveIt}>
          Give
        </button>
      </div>
      {pick?.text && <div className="app-dim app-itempreview">{pick.text}</div>}
    </section>
  )
}

/** An amount you type: sent on Enter or when you leave the field. */
function CountInput({ value, label, onCommit }: { value: number; label: string; onCommit: (n: number) => void }) {
  const [v, setV] = useState(String(value))
  useEffect(() => setV(String(value)), [value])
  const commit = () => {
    const n = Number(v)
    if (v !== '' && Number.isInteger(n) && n !== value) onCommit(n)
    else setV(String(value))
  }
  return (
    <input
      className="app-select app-count"
      inputMode="numeric"
      aria-label={label}
      value={v}
      onChange={(e) => setV(e.target.value.replace(/\D/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}
