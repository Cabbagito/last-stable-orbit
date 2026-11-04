import { ring } from '../lib/ring'
import { RingPortrait } from '../shell/RingPortrait'
import { STATS, type CrewMember, type InvEntry } from '../types'

const STAT_NAME: Record<string, string> = {
  body: 'BODY',
  reflex: 'REFLEX',
  tech: 'TECH',
  intel: 'INTEL',
  cool: 'COOL',
  empathy: 'EMPATHY',
}

/** The R6 character sheet: portrait in its ring, name, the 3x2 stat table, skills + chrome, items. */
export function Sheet({ me, items }: { me: CrewMember; items: InvEntry[] }) {
  return (
    <aside aria-label="Character sheet" className="r4-col">
      <div role="img" aria-label={`${me.short}. HP ${me.hp} of 6, Entropy ${me.entropy} of 6`} style={{ alignSelf: 'center' }}>
        <RingPortrait src={me.portrait} ring={ring(me.hp, me.entropy, 216, 12)} size={216} />
      </div>
      <div style={{ flex: 'none' }}>
        <div className="r4-name">{me.name}</div>
        <div className="r5-role">{me.role}</div>
      </div>
      <section aria-label="Stats" className="r5-table" style={{ flex: 'none' }}>
        {STATS.map((s) => {
          const die = me.stats[s]
          return (
            // Rolling arrives in Milestone 2; until then the dice are physical and the tile just wiggles.
            <button key={s} type="button" className="r5-cell" aria-label={`${STAT_NAME[s]}, d${die}`} title="Rolling in the app comes next">
              <span style={{ display: 'flex' }}>
                <img src={`/assets/icons/stats/${s}.png`} alt="" className="r3-px" style={{ width: 48, height: 48 }} />
                <img src={`/assets/icons/dice/${s}-d${die}.png`} alt="" className="r3-px r4-sdie" style={{ width: 48, height: 48 }} />
              </span>
              <span className="r4-lab">{STAT_NAME[s]}</span>
            </button>
          )
        })}
      </section>
      <section aria-label="Skills and chrome" className="r5-rows" style={{ flex: 'none' }}>
        {me.list.map((k) => (
          <div key={k.name} className="r5-row" title={k.downside ? `Downside: ${k.downside}` : k.kind === 'chrome' ? 'Chrome' : undefined}>
            {k.icon ? (
              <img src={k.icon} alt="" className="r3-px" style={{ width: 48, height: 48 }} />
            ) : (
              <span className="app-noicon" aria-hidden="true">
                {k.kind === 'chrome' ? 'CHROME' : 'SKILL'}
              </span>
            )}
            <span>{k.name}</span>
          </div>
        ))}
      </section>
      <section aria-label="On hand" className="r5-items" style={{ flex: 'none' }}>
        {items.map((i) => (
          <span key={i.uid} className="r5-tip" data-name={i.item.name} tabIndex={0}>
            <img src={i.item.icon} alt={i.item.name} className="r3-px" style={{ width: 48, height: 48 }} />
          </span>
        ))}
      </section>
    </aside>
  )
}
