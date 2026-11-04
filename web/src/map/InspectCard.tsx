import { useEffect } from 'react'
import { Closeup, CodexButton, Inspector } from '../inspect/Inspector'
import { findObject } from '../inspect/objects'
import { ring } from '../lib/ring'
import { RingPortrait } from '../shell/RingPortrait'
import { send, useGame } from '../store/game'

/**
 * The card for whatever was clicked on the map or in the crew rail: a crew member, an NPC, or a thing in
 * the world. Round 9's inspector, docked at the map's top right. The GM also sees what players can't.
 */
export function InspectCard() {
  const view = useGame((s) => s.view)
  const selected = useGame((s) => s.selected)
  const select = useGame((s) => s.select)
  const found = view ? findObject(view, selected) : null
  const isGm = view?.me.role === 'gm'

  // a player who opens an object's card has looked at it: its marker goes quiet, for them only
  const unseen = !!found && !isGm && !found.obj.seen
  useEffect(() => {
    if (unseen && found) void send('object.seen', { map: found.mapId, object: found.obj.id })
  }, [unseen, found?.mapId, found?.obj.id])

  if (!view || !selected) return null
  const close = (
    <button type="button" className="r4-btn app-small" onClick={() => select(null)} style={{ marginLeft: 'auto' }}>
      Close
    </button>
  )

  if (found) {
    const { mapId, obj } = found
    const map = view.maps[mapId]
    const art = map.moods.find((m) => m.id === map.mood)?.base ?? map.moods[0].base
    return (
      <aside aria-label={obj.name} className="app-card">
        <Inspector
          label={`OBJECT · ${map.name.toUpperCase()}`}
          name={obj.name}
          wide={obj.closeup ? <Closeup art={art} display={map.display} centre={obj.closeup} alt={`Close-up: ${obj.name}`} /> : undefined}
          media={obj.closeup ? undefined : <span className="app-ins-big app-ins-noicon" aria-hidden="true">OBJECT</span>}
          actions={
            <>
              {obj.codex && <CodexButton />}
              {isGm && (
                <button type="button" className="r4-btn app-small" onClick={() => send('gm.object.show', { map: mapId, object: obj.id, shown: !obj.shown })}>
                  {obj.shown ? 'Hide' : 'Show'}
                </button>
              )}
              {close}
            </>
          }
        >
          {isGm && !obj.shown && <div className="r4-lab app-warn">HIDDEN FROM PLAYERS</div>}
          <div className="app-ins-txt">{obj.text}</div>
        </Inspector>
      </aside>
    )
  }

  const t = view.tokens[selected]
  if (!t) return null
  const crew = t.kind === 'crew' ? view.crew.find((c) => c.id === t.ref) : undefined
  return (
    <aside aria-label={t.name} className="app-card">
      <Inspector
        label={`${crew ? 'CREW' : 'NPC'} · ${t.role.toUpperCase()}`}
        name={crew ? crew.name : t.name}
        media={
          crew ? (
            <RingPortrait src={crew.portrait} ring={ring(crew.hp, crew.entropy, 96, 10)} size={96} />
          ) : (
            <img src={t.portrait} alt="" className="r3-px" style={{ width: 96, height: 96, flex: 'none' }} />
          )
        }
        sub={
          crew ? (
            <span className="app-ins-vit">
              HP <span className="app-ins-hp">{crew.hp}</span>/6 · EN <span className="app-ins-en">{crew.entropy}</span>/6
            </span>
          ) : (
            t.mood && <span className="app-ins-sub">{t.mood}.</span>
          )
        }
        actions={
          <>
            {t.codex && <CodexButton />}
            {isGm && (
              <button type="button" className="r4-btn app-small" onClick={() => send('gm.token.hide', { token: t.id, hidden: !t.hidden })}>
                {t.hidden ? 'Show' : 'Hide'}
              </button>
            )}
            {close}
          </>
        }
      >
        {t.hidden && <div className="r4-lab app-warn">HIDDEN FROM PLAYERS</div>}
        {t.note && <div className="app-ins-txt">{t.note}</div>}
        {isGm && t.gm_note && <div className="app-gmnote">{t.gm_note}</div>}
      </Inspector>
    </aside>
  )
}
