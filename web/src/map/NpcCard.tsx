import { send, useGame } from '../store/game'

/** R6's 290px card for the selected token. The GM also sees the private note and quick controls. */
export function NpcCard() {
  const view = useGame((s) => s.view)
  const selected = useGame((s) => s.selected)
  const select = useGame((s) => s.select)
  const t = selected ? view?.tokens[selected] : undefined
  if (!view || !t) return null
  const isGm = view.me.role === 'gm'
  const crew = t.kind === 'crew' ? view.crew.find((c) => c.id === t.ref) : undefined
  return (
    <aside aria-label={t.name} className="app-card">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <img src={t.portrait} alt="" className="r3-px" style={{ width: 96, height: 96 }} />
        <div style={{ minWidth: 0 }}>
          <div className="r4-h" style={{ fontSize: 16, lineHeight: 1.2 }}>
            {crew ? crew.name : t.name}
          </div>
          <div className="r5-role">{t.role}</div>
          {t.hidden && <div className="r4-lab app-warn">HIDDEN FROM PLAYERS</div>}
        </div>
      </div>
      <div style={{ margin: '10px 0 12px', lineHeight: 1.3 }}>
        {crew ? (
          <span style={{ color: 'var(--dim)' }}>
            HP {crew.hp} of 6 · Entropy {crew.entropy} of 6
          </span>
        ) : (
          <>
            {t.mood && <span style={{ color: 'var(--dim)' }}>{t.mood}. </span>}
            {t.note}
          </>
        )}
      </div>
      {isGm && t.gm_note && <div className="app-gmnote">{t.gm_note}</div>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" className="r4-btn" disabled title="The Codex arrives in a later milestone">
          Codex
        </button>
        {isGm && (
          <button type="button" className="r4-btn" onClick={() => send('gm.token.hide', { token: t.id, hidden: !t.hidden })}>
            {t.hidden ? 'Show' : 'Hide'}
          </button>
        )}
        <button type="button" className="r4-btn" onClick={() => select(null)} style={{ marginLeft: 'auto' }}>
          Close
        </button>
      </div>
    </aside>
  )
}
