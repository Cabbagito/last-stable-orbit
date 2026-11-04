import { useEffect, useState, type CSSProperties } from 'react'
import { GiveRow, Pocket, Vitals, Eye } from '../gm/parts'
import { Closeup, CodexButton, InspectBlock, Inspector } from '../inspect/Inspector'
import { useItemTip } from '../inspect/ItemTip'
import { findObject } from '../inspect/objects'
import { ring } from '../lib/ring'
import { STAT_LOOK, statIcon } from '../roll/stats'
import { RingPortrait } from '../shell/RingPortrait'
import { gmRoll, gmRun, send, useGame } from '../store/game'
import { STATS, type TokenView } from '../types'

/**
 * The card for whatever was clicked on the map or in the crew rail: a crew member, an NPC, or a thing in
 * the world. Round 9's inspector, docked at the map's top right. The GM also sees what players can't, and runs
 * the scene from here (Round 12): an NPC's card rolls its stats, a crew card has HP, Entropy, pockets and Give.
 */
export function InspectCard() {
  const view = useGame((s) => s.view)
  const selected = useGame((s) => s.selected)
  const select = useGame((s) => s.select)
  const found = view ? findObject(view, selected) : null
  const isGm = view?.me.role === 'gm'
  const { bind: tip, tip: itemTip } = useItemTip() // the GM sees each item as its holder does

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
                <button type="button" className="r4-btn app-small" onClick={() => void gmRun('gm.object.show', { map: mapId, object: obj.id, shown: !obj.shown })}>
                  {obj.shown ? 'Hide' : 'Show'}
                </button>
              )}
              {close}
            </>
          }
        >
          {isGm && !obj.shown && <div className="r10-warn">HIDDEN FROM PLAYERS</div>}
          <div className="app-ins-txt">{obj.text}</div>
        </Inspector>
      </aside>
    )
  }

  const t = view.tokens[selected]
  if (!t) return null
  const crew = t.kind === 'crew' ? view.crew.find((c) => c.id === t.ref) : undefined
  const pockets = crew ? view.inventory[crew.id] ?? [] : []
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
            !isGm && (
              <span className="app-ins-vit">
                HP <span className="app-ins-hp">{crew.hp}</span>/6 · EN <span className="app-ins-en">{crew.entropy}</span>/6
              </span>
            )
          ) : (
            t.mood && <span className="app-ins-sub">{t.mood}.</span>
          )
        }
        actions={
          <>
            {t.codex && <CodexButton />}
            {isGm && (
              <button type="button" className="r4-btn app-small" onClick={() => void gmRun('gm.token.hide', { token: t.id, hidden: !t.hidden })}>
                {t.hidden ? 'Show' : 'Hide'}
              </button>
            )}
            {isGm && !crew && (
              <button type="button" className="r4-btn app-small" onClick={() => void gmRun('gm.token.remove', { token: t.id })}>
                Remove
              </button>
            )}
            {close}
          </>
        }
      >
        {isGm && crew && (
          <div className="r10-cvit">
            <Vitals c={crew} />
          </div>
        )}
        {t.hidden && <div className="r10-warn">HIDDEN FROM PLAYERS</div>}
        {t.note && <div className="app-ins-txt">{t.note}</div>}
        {isGm && t.gm_note && (
          <div className="r10-gmn">
            <span className="r4-lab">ONLY YOU SEE THIS</span>
            <div className="app-ins-txt">{t.gm_note}</div>
          </div>
        )}
        {isGm && !crew && t.stats && <NpcRolls key={t.id} t={t} stats={t.stats} />}
        {isGm && crew && (
          <InspectBlock label="ON HAND">
            <div className="r10-pkrow" style={{ marginTop: 6 }}>
              {pockets.map((e) => (
                <Pocket key={e.uid} e={e} holder={crew} tip={tip} />
              ))}
              {pockets.length === 0 && <span className="r10-dimtxt">Nothing yet.</span>}
            </div>
            <span className="r4-lab" style={{ display: 'block', marginTop: 10 }}>
              GIVE
            </span>
            <div className="r10-give">
              <GiveRow to={crew} items={view.items ?? []} tip={tip} />
            </div>
          </InspectBlock>
        )}
        {itemTip}
      </Inspector>
    </aside>
  )
}

/**
 * An NPC's six stats as its rolls, each showing the die on its sheet. The roll plays here in full, and players
 * see it land on the NPC's chip unless it's hidden. A hidden NPC can only roll hidden.
 */
function NpcRolls({ t, stats }: { t: TokenView; stats: NonNullable<TokenView['stats']> }) {
  const [hideRoll, setHideRoll] = useState(false)
  const lock = !!t.hidden
  const hidden = lock || hideRoll
  return (
    <InspectBlock label="ROLL">
      <div className="r12-rgrid">
        {STATS.map((s) => (
          <button
            key={s}
            type="button"
            className="r12-rbtn"
            aria-label={`Roll ${STAT_LOOK[s].title} for ${t.name}, d${stats[s]}` + (hidden ? ', hidden' : '')}
            onClick={() => void gmRoll({ token: t.id, stat: s, hidden })}
            style={{ '--c': STAT_LOOK[s].col } as CSSProperties}
          >
            <img src={statIcon(s)} alt="" className="r3-px" />
            <span className="r12-rtxt">
              <span className="r12-rname">{STAT_LOOK[s].title}</span>
              <span className="r12-rdie">d{stats[s]}</span>
            </span>
          </button>
        ))}
      </div>
      <button type="button" className={'r10-hide r12-rhide' + (hidden ? ' on' : '')} aria-pressed={hidden} disabled={lock} onClick={() => setHideRoll(!hideRoll)}>
        <Eye off={hidden} />
        <span>{lock ? 'Hidden NPC, so only you see the roll' : hidden ? 'Hidden roll: only you see it' : 'Public roll: everyone sees it'}</span>
      </button>
    </InspectBlock>
  )
}
