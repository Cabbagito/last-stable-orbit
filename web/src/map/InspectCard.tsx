import { useEffect, useState, type CSSProperties } from 'react'
import { Cross, GiveRow, Pocket, Step, Vitals } from '../gm/parts'
import { Closeup, CodexButton, InspectBlock, Inspector } from '../inspect/Inspector'
import { useItemTip } from '../inspect/ItemTip'
import { findObject } from '../inspect/objects'
import { ring } from '../lib/ring'
import { STAT_LOOK, statIcon } from '../roll/stats'
import { RingPortrait } from '../shell/RingPortrait'
import { gmRoll, gmRun, isReadOnly, send, useGame, type GmRollMode } from '../store/game'
import { seatsLabel } from '../slots/slots'
import { STATS, type MapObject, type SlotsCard, type TokenView } from '../types'

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
  // the GM's cards close from their corner, which leaves their one row for what they can do
  const close = isGm ? null : (
    <button type="button" className="r4-btn app-small" onClick={() => select(null)} style={{ marginLeft: 'auto' }}>
      Close
    </button>
  )
  const corner = isGm && (
    <button type="button" className="gx-x gx-cardx" aria-label="Close" onClick={() => select(null)}>
      <Cross />
    </button>
  )
  const cardClass = 'app-card' + (isGm ? ' gm' : '')

  if (found) {
    const { mapId, obj } = found
    const map = view.maps[mapId]
    const art = map.moods.find((m) => m.id === map.mood)?.base ?? map.moods[0].base
    return (
      <aside aria-label={obj.name} className={cardClass}>
        {corner}
        <Inspector
          label={`OBJECT · ${map.name.toUpperCase()}`}
          name={obj.name}
          wide={obj.closeup ? <Closeup art={art} display={map.display} centre={obj.closeup} alt={`Close-up: ${obj.name}`} dark={obj.game?.out} /> : undefined}
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
          {obj.game && <SlotSeats mapId={mapId} obj={obj} game={obj.game} isGm={isGm} />}
        </Inspector>
      </aside>
    )
  }

  const t = view.tokens[selected]
  if (!t) return null
  const crew = t.kind === 'crew' ? view.crew.find((c) => c.id === t.ref) : undefined
  const pockets = crew ? view.inventory[crew.id] ?? [] : []
  return (
    <aside aria-label={t.name} className={cardClass}>
      {corner}
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
            <>
              {t.mood && <span className="app-ins-sub">{t.mood}.</span>}
              {isGm && t.health !== undefined && <Step who={t.name} label="HP" tone="hp" value={t.hp ?? 0} max={t.health} showMax onChange={(hp) => void gmRun('gm.npc.hp', { token: t.id, hp })} />}
            </>
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
            <SendTo t={t} />
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
        {isGm && !crew && t.stats && <NpcRolls key={t.id} t={t} stats={t.stats} />}
        {t.note && <div className="app-ins-txt app-ins-gap">{t.note}</div>}
        {isGm && t.gm_note && (
          <div className="r10-gmn">
            <span className="r4-lab">ONLY YOU SEE THIS</span>
            <div className="app-ins-txt">{t.gm_note}</div>
          </div>
        )}
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
 * The seats on a slot machine's card: how many are taken, and a way to sit down. The GM can't play, but can put the
 * machines out of service, or back.
 */
function SlotSeats({ mapId, obj, game, isGm }: { mapId: string; obj: MapObject; game: SlotsCard; isGm: boolean }) {
  const select = useGame((s) => s.select)
  const readOnly = useGame(isReadOnly)
  const full = game.taken >= game.seats
  const sit = async () => {
    const ack = await send('slots.sit', { map: mapId, object: obj.id })
    if (ack.ok) select(null)
  }
  return (
    <>
      {game.out ? (
        <span className="sl-cap sl-out">OUT OF SERVICE</span>
      ) : (
        <div className="sl-seats">
          <span className="sl-seatpips" aria-hidden="true">
            {Array.from({ length: game.seats }, (_, i) => (
              <i key={i} className={i < game.taken ? 'on' : ''} />
            ))}
          </span>
          <span className="sl-cap">{seatsLabel(game.taken, game.seats)}</span>
        </div>
      )}
      {isGm ? (
        <button type="button" className="r4-btn app-small sl-gmsvc" onClick={() => void gmRun('gm.slots.service', { map: mapId, object: obj.id, out: !game.out })}>
          {game.out ? 'Back in service' : 'Out of service'}
        </button>
      ) : (
        !game.out && (
          <button type="button" className="sl-cta" disabled={full || readOnly} onClick={() => void sit()}>
            {full ? 'WAIT FOR A SEAT' : `PLAY · ${game.pull} CREDITS A PULL`}
          </button>
        )
      )}
    </>
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

/** The GM moves one token to another map, from the map picker: up the stairs, down the vent. */
function SendTo({ t }: { t: TokenView }) {
  const isGm = useGame((s) => s.view?.me.role === 'gm')
  const setMapPicker = useGame((s) => s.setMapPicker)
  if (!isGm) return null
  return (
    <button type="button" className="r4-btn app-small" onClick={() => setMapPicker({ token: t.id })}>
      Send to…
    </button>
  )
}
