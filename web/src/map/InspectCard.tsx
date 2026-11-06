import { useEffect, useState, type CSSProperties } from 'react'
import { GiveRow, Pocket, Step, Vitals } from '../gm/parts'
import { Closeup, CodexButton, InspectBlock, Inspector } from '../inspect/Inspector'
import { useItemTip } from '../inspect/ItemTip'
import { findObject } from '../inspect/objects'
import { floorOf, onFloor } from '../lib/floors'
import { ring } from '../lib/ring'
import { STAT_LOOK, statIcon } from '../roll/stats'
import { RingPortrait } from '../shell/RingPortrait'
import { gmRoll, gmRun, send, useGame, type GmRollMode } from '../store/game'
import { fighterIn, fightOn } from '../fight/fights'
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
              {obj.codex && <CodexButton entry={obj.codex} />}
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
            <RingPortrait src={crew.portrait} ring={ring(crew.hp, crew.entropy, 96, 10, crew.health)} size={96} />
          ) : (
            <img src={t.portrait} alt="" className="r3-px" style={{ width: 96, height: 96, flex: 'none' }} />
          )
        }
        sub={
          crew ? (
            !isGm && (
              <span className="app-ins-vit">
                HP <span className="app-ins-hp">{crew.hp}</span>/{crew.health} · EN <span className="app-ins-en">{crew.entropy}</span>/6
              </span>
            )
          ) : (
            t.mood && <span className="app-ins-sub">{t.mood}.</span>
          )
        }
        actions={
          <>
            {t.codex && <CodexButton entry={t.codex} />}
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
        {isGm && !crew && <NpcHealth token={t.id} map={t.map} name={t.name} />}
        {t.hidden && <div className="r10-warn">HIDDEN FROM PLAYERS</div>}
        {t.note && <div className="app-ins-txt">{t.note}</div>}
        <DeckJump t={t} />
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

const SEEN_MODES: [GmRollMode, string][] = [['public', 'Public'], ['hidden', 'Hidden'], ['secret', 'Secret']]
const UNSEEN_MODES: [GmRollMode, string][] = [['someone', 'Someone'], ['secret', 'Secret']]

/**
 * An NPC's six stats as its rolls, each showing the die on its sheet (Round 17): pick what players see, then click a
 * stat. GOD arms one roll, and picking a mode disarms it. An NPC players can't see has Someone instead of Public and
 * Hidden. The roll plays as a banner on this screen, whatever players get.
 */
function NpcRolls({ t, stats }: { t: TokenView; stats: NonNullable<TokenView['stats']> }) {
  const [pick, setPick] = useState<GmRollMode | null>(null)
  const [armed, setArmed] = useState(false)
  const modes = t.hidden ? UNSEEN_MODES : SEEN_MODES
  const mode = modes.find(([id]) => id === pick)?.[0] ?? modes[0][0]
  const label = armed ? 'God' : modes.find(([id]) => id === mode)?.[1]
  return (
    <InspectBlock label="ROLL">
      <div className="r12-rgrid">
        {STATS.map((s) => (
          <button
            key={s}
            type="button"
            className="r12-rbtn"
            aria-label={`Roll ${STAT_LOOK[s].title} for ${t.name}, d${stats[s]}, ${label}`}
            onClick={() => {
              setArmed(false)
              void gmRoll({ token: t.id, stat: s, mode: armed ? 'god' : mode })
            }}
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
      <div className="r17-rmode">
        <div className="r17-rseg" role="group" aria-label="What players see">
          {modes.map(([id, name]) => {
            const on = !armed && mode === id
            return (
              <button
                key={id}
                type="button"
                className={'r17-rb' + (on ? ' on' : '')}
                aria-pressed={on}
                onClick={() => {
                  setPick(id)
                  setArmed(false)
                }}
              >
                {name}
              </button>
            )
          })}
        </div>
        <button type="button" className={'r17-rgod' + (armed ? ' on' : '')} aria-pressed={armed} title="The next roll is God's: the whole screen, on every screen" onClick={() => setArmed(!armed)}>
          GOD
        </button>
      </div>
    </InspectBlock>
  )
}

/**
 * On a tower map (the Executive floors), move a token to another deck: straight up or down the stairs or the
 * duct, keeping where it stands. For whoever may move it: the GM, or the player whose token it is.
 */
/** M8: an NPC's health, on its card, while it's in a fight (the crew's is on the rail). */
function NpcHealth({ token, map, name }: { token: string; map: string; name: string }) {
  const x = useGame((s) => fighterIn(fightOn(s.view, map), token))
  if (!x) return null
  return (
    <div className="r10-cvit">
      <Step who={name} label="HP" tone="hp" value={x.hp} max={x.health} onChange={(hp) => void gmRun('gm.npc.hp', { token, hp })} />
    </div>
  )
}

function DeckJump({ t }: { t: TokenView }) {
  const view = useGame((s) => s.view)
  const preview = useGame((s) => s.preview)
  const look = useGame((s) => s.look)
  const floors = view?.maps[t.map]?.floors ?? []
  const mine = view?.me.role === 'gm' || (t.kind === 'crew' && t.ref === view?.me.char && !t.hidden)
  if (!floors.length || !mine || preview) return null
  const cur = floorOf(floors, t.at[2])
  return (
    <InspectBlock label="DECK">
      <div className="app-decks" role="group" aria-label={`Move ${t.name} to another deck`}>
        {floors.map((f, i) => (
          <button
            key={i}
            type="button"
            className={'r10-btn' + (i === cur ? ' on' : '')}
            aria-pressed={i === cur}
            disabled={i === cur}
            onClick={() => {
              const at = onFloor(floors, t.at, i)
              look(t.map, i, at)
              void send('token.move', { token: t.id, at })
            }}
          >
            {f.label}
          </button>
        ))}
      </div>
    </InspectBlock>
  )
}
