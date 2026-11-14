import { useEffect, useState, type CSSProperties } from 'react'
import { FullscreenButton, Logo } from '../shell/Header'
import { gmRun, send, useGame } from '../store/game'
import { STATS, type CodexArt, type CodexEntryView, type CodexSec, type CodexTile, type View } from '../types'

// The Codex, from the UI canvas's page "Codex, pinned" (board Cdx3Main, with the name on the art as Cdx3On):
// a landing of five full-width rows, a section as a grid of playing cards, and a page with the whole sprite pinned
// on the left and two columns beside it. Players get only what the GM has unlocked (the server sees to that);
// the GM sees every entry, can open it for the crew from its page, and sees what's still locked.

const Q = 100 / 426 // the board's card is 426 px wide: card art is placed in card widths (cqw)
const PER_ROW = 3

type Route = { sec: CodexSec | null; entry: string | null }

/** `#codex`, `#codex/<section>` and `#codex/<section>/<entry>`. */
function readRoute(): Route {
  const [, sec, entry] = location.hash.slice(1).split('/')
  return { sec: (sec as CodexSec) || null, entry: entry || null }
}

export function codexHref(view: View | null, id: string): string | null {
  const e = view?.codex?.entries.find((x) => x.id === id)
  return e ? `#codex/${e.sec}/${e.id}` : null
}

function go(sec: CodexSec | null, entry: string | null = null) {
  location.hash = sec ? (entry ? `codex/${sec}/${entry}` : `codex/${sec}`) : 'codex'
}

function useRoute(): Route {
  const [r, setR] = useState(readRoute)
  useEffect(() => {
    const on = () => setR(readRoute())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return r
}

function useWindow() {
  const read = () => ({ w: window.innerWidth, h: window.innerHeight })
  const [s, setS] = useState(read)
  useEffect(() => {
    const on = () => setS(read())
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return s
}

const Diamond = ({ size = 10 }: { size?: number }) => (
  <svg className="dia" width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
    <path d="M9 1.5 L16.5 9 L9 16.5 L1.5 9 Z" fill="#ff4fa3" />
  </svg>
)

const Back = () => (
  <svg width="7" height="11" viewBox="0 0 7 11" aria-hidden="true">
    <path d="M6 1 L1.5 5.5 L6 10" fill="none" stroke="currentColor" strokeWidth="1.2" />
  </svg>
)

const Fwd = () => (
  <svg width="7" height="11" viewBox="0 0 7 11" aria-hidden="true">
    <path d="M1 1 L5.5 5.5 L1 10" fill="none" stroke="currentColor" strokeWidth="1.2" />
  </svg>
)

function Tiles({ tiles }: { tiles: CodexTile[] }) {
  return (
    <span className="art" aria-hidden="true">
      {tiles.map((t, i) => (
        <img key={i} className="tile" src={t.src} alt="" style={{ left: t.l, top: `calc(50% + ${t.t}px)`, width: t.w }} />
      ))}
    </span>
  )
}

/** The board's onCard(): the art inside a card, in card widths. */
function cardArt(a: CodexArt): CSSProperties {
  const f = (n: number) => +n.toFixed(3)
  return { left: `calc(50cqw - ${f(a.cx * a.k * Q)}cqw)`, top: `${f(-a.y0 * a.k * Q)}cqw`, width: `${f(a.px * a.k * Q)}cqw` }
}

/** The board's zoomed(): a See also mini, in px. */
function miniArt(a: CodexArt): CSSProperties {
  return { left: `calc(50% - ${a.cx * a.km}px)`, top: -a.my * a.km, width: a.px * a.km }
}

export function Codex() {
  const view = useGame((s) => s.view)
  const route = useRoute()
  const win = useWindow()
  const codex = view?.codex
  if (!view || !codex) return <div className="app-body" />
  const isGm = view.me.role === 'gm'
  const sec = codex.sections.find((s) => s.id === route.sec) ?? null
  const entry = sec && route.entry ? codex.entries.find((e) => e.id === route.entry && e.sec === sec.id) ?? null : null

  return (
    <div className="cx" style={{ '--art': '40%' } as CSSProperties}>
      {!sec ? <Landing view={view} isGm={isGm} /> : !entry ? <Section view={view} sec={sec.id} isGm={isGm} /> : <Page key={entry.id} view={view} e={entry} isGm={isGm} win={win} />}
    </div>
  )
}

function countText(n: number, isGm: boolean, locked: number) {
  const base = `${n} ${n === 1 ? 'entry' : 'entries'}`
  return isGm && locked ? `${base} · ${locked} locked` : base
}

function Landing({ view, isGm }: { view: View; isGm: boolean }) {
  const codex = view.codex!
  return (
    <main className="rows" aria-label="Codex sections">
      {codex.sections.map((s) => {
        const locked = isGm ? codex.entries.filter((e) => e.sec === s.id && !e.unlocked).length : 0
        return (
          <button
            key={s.id}
            type="button"
            className="row"
            onClick={() => go(s.id)}
            aria-label={`${s.name}, ${countText(s.count, isGm, locked)}` + (s.new ? `, ${s.new} new` : '')}
          >
            <Tiles tiles={s.tiles} />
            <span className="label">
              <span className="name">{s.name}</span>
              <span className="count">
                <span>{countText(s.count, isGm, locked)}</span>
                {s.new > 0 && (
                  <>
                    <Diamond size={9} />
                    <span className="pink">{s.new} new</span>
                  </>
                )}
              </span>
            </span>
            <span className="tick a" />
            <span className="tick b" />
            <span className="sweep" />
          </button>
        )
      })}
    </main>
  )
}

function Strip({ view, sec }: { view: View; sec: CodexSec }) {
  const codex = view.codex!
  const s = codex.sections.find((x) => x.id === sec)!
  return (
    <div className="strip">
      <Tiles tiles={s.strip} />
      <button type="button" className="back" onClick={() => go(null)}>
        <Back />
        Codex
      </button>
      <h1 className="sname">{s.name}</h1>
      <nav className="sects" aria-label="Codex sections">
        {codex.sections.map((x) => (
          <button key={x.id} type="button" className={'sect' + (x.id === sec ? ' on' : '')} aria-current={x.id === sec ? 'page' : undefined} onClick={() => go(x.id)}>
            {x.short}
          </button>
        ))}
      </nav>
    </div>
  )
}

function Section({ view, sec, isGm }: { view: View; sec: CodexSec; isGm: boolean }) {
  const list = view.codex!.entries.filter((e) => e.sec === sec)
  const name = view.codex!.sections.find((x) => x.id === sec)!.name
  return (
    <>
      <Strip view={view} sec={sec} />
      <main className="scroll" key={sec}>
        {list.length === 0 && <p className="app-cx-empty">Nothing here yet. Pages open as you find things.</p>}
        <div className="grid" style={{ '--cols': PER_ROW } as CSSProperties} role="list" aria-label={name}>
          {list.map((e) => {
            const locked = isGm && !e.unlocked
            return (
              <button
                key={e.id}
                type="button"
                role="listitem"
                className={'card' + (locked ? ' app-cx-locked' : '')}
                onClick={() => go(sec, e.id)}
                aria-label={`${e.name}, ${e.role}` + (e.new ? ', new' : '') + (locked ? ', locked for the crew' : '')}
              >
                <span className="c-art" aria-hidden="true">
                  <img className="tile" src={e.art.src} alt="" style={cardArt(e.art)} />
                </span>
                <span className="c-txt">
                  <span className="cname">{e.name}</span>
                  <span className="crole">{e.role}</span>
                </span>
                {e.new && (
                  <span className="c-new">
                    <Diamond />
                  </span>
                )}
                {locked && <span className="app-cx-lock">Locked</span>}
                <span className="tick a" />
                <span className="tick b" />
                <span className="tick c" />
                <span className="tick d" />
                <span className="sweep" />
              </button>
            )
          })}
        </div>
      </main>
    </>
  )
}

/**
 * First play: while the GM holds the players for the opening, a player's laptop shows their own character's page, brief
 * first, and nothing else of the game: no tabs, no links to other pages. Change character is always there, for a
 * wrong pick. The GM's Play takes it away.
 */
export function HeldCodex({ onLogout }: { onLogout?: () => void }) {
  const view = useGame((s) => s.view)
  const win = useWindow()
  const e = view?.codex?.entries.find((x) => x.crew && x.crew.id === view.me.char) ?? null
  if (!view || !e) return null
  return (
    <>
      <header className="r4-head">
        <Logo />
        <span className="app-heldwait">
          <i aria-hidden="true" />
          Waiting for the opening
        </span>
        <div className="app-headright">
          <span className="r4-lab">{view.me.seat.toUpperCase()}</span>
          {onLogout && <FullscreenButton />}
          {onLogout && (
            <button type="button" className="app-link" onClick={onLogout}>
              Change character
            </button>
          )}
        </div>
      </header>
      <div className="cx" style={{ '--art': '40%' } as CSSProperties}>
        <Page view={view} e={e} isGm={false} win={win} held />
      </div>
    </>
  )
}

/** A crew page's brief. Its owner reads "Only you"; the GM sees whose it is. The server sends it to nobody else. */
function Private({ p, isGm }: { p: NonNullable<CodexEntryView['private']>; isGm: boolean }) {
  return (
    <section className="blk app-cx-priv" aria-label={isGm ? `${p.who}'s private brief` : 'Your private brief'}>
      <span className="pk a" />
      <span className="pk b" />
      <span className="pk c" />
      <span className="pk d" />
      <div className="app-cx-privhd">
        <span className="lab">
          <Lock />
          {isGm ? `Private · ${p.who} only` : `Only you · ${p.who}`}
        </span>
        <span className="app-cx-privnote">{isGm ? `Only ${p.who} and you see this.` : "The rest of the crew can't see this."}</span>
      </div>
      {p.parts.map((x, i) => (
        <p key={i}>
          <b>{x.h}</b> {x.text}
        </p>
      ))}
    </section>
  )
}

const Lock = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
    <rect x="3" y="7" width="10" height="7" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
  </svg>
)

function Page({ view, e, isGm, win, held = false }: { view: View; e: CodexEntryView; isGm: boolean; win: { w: number; h: number }; held?: boolean }) {
  const list = view.codex!.entries.filter((x) => x.sec === e.sec)
  const secName = view.codex!.sections.find((x) => x.id === e.sec)!.name
  const i = list.findIndex((x) => x.id === e.id)
  const prev = list[(i - 1 + list.length) % list.length]
  const next = list[(i + 1) % list.length]
  const isNew = !!e.new

  // reading it clears "new" for this player only
  useEffect(() => {
    if (isNew) void send('codex.read', { entry: e.id })
  }, [e.id, isNew])

  // the sprite at the largest whole-number zoom that fits, leaving room for its strip (the board's rule)
  const zoom = Math.max(3, Math.min(Math.floor((win.h - 56 - (held ? 0 : 44) - 84) / 96), Math.floor((win.w * 0.48) / 96)))
  const sprite = e.art.kind === 'bust'
  const a = e.art
  const facts: [string, string][] = e.crew ? [['Health', String(e.crew.health)], ...e.facts] : e.facts

  const brief = e.private && <Private p={e.private} isGm={isGm} />

  return (
    <>
      {!held && (
      <nav className="crumb" aria-label="Entry">
        <button type="button" className="back" onClick={() => go(e.sec)}>
          <Back />
          {secName}
        </button>
        {isGm && <UnlockToggle e={e} />}
        {list.length > 1 && (
          <span className="pn">
            <button type="button" className="back" onClick={() => go(e.sec, prev.id)}>
              <Back />
              {prev.name}
            </button>
            <button type="button" className="back" onClick={() => go(e.sec, next.id)}>
              {next.name}
              <Fwd />
            </button>
          </span>
        )}
      </nav>
      )}
      <article className={'pin' + (held ? ' app-cx-held' : '')} aria-label={e.name}>
        <div className="pin-l" style={{ width: zoom * 96 }}>
          <div className={'pin-art' + (sprite ? ' sq' : '')}>
            <img
              className={'hero-img' + (a.kind === 'icon' ? ' icon' : '')}
              src={a.src}
              alt={e.name}
              style={{ objectPosition: a.pos, transform: a.z !== 1 ? `scale(${a.z})` : undefined, transformOrigin: a.pos }}
            />
          </div>
          {sprite && (e.crew || e.npc) && (
            <div className="plate">
              {e.crew && (
                <div className="stats" aria-label="Stats">
                  {STATS.map((s) => (
                    <div key={s} className="stat">
                      <img className="px" src={`/assets/icons/stats/${s}.png`} alt="" style={{ width: 40, height: 40 }} />
                      <span className="lab">{s}</span>
                      <span className="die">d{e.crew!.stats[s]}</span>
                    </div>
                  ))}
                </div>
              )}
              {e.npc && (
                <div className="plate-mood">
                  <span className="lab">Mood</span>
                  <span className="plate-val">{e.npc.mood || '—'}</span>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="pin-r">
          <div className="pin-hd">
            <div className="hd">
              <span className="lab">
                {isNew && <Diamond />}
                {e.label}
              </span>
              <h2 className="ename">{e.name}</h2>
              {e.sub && <span className="esub">{e.sub}</span>}
            </div>
          </div>
          <div className="pin-cols">
            {held && brief}
            <div className="pin-main">
              {e.lead && <p className="lead">{e.lead}</p>}
              {e.quote && <p className="quote">{e.quote}</p>}
              {e.crew && e.crew.skills.length > 0 && (
                <section className="blk">
                  <span className="lab">Skills</span>
                  <div className="tbl">
                    {e.crew.skills.map((k) => (
                      <div key={k.name} className="tr">
                        {k.icon && <img className="px" src={k.icon} alt="" />}
                        <span className="trt">
                          <span className="trn">{k.name}</span>
                          <span className="trd">{k.text}</span>
                          {k.downside && (
                            <span className="app-cx-down">
                              <span className="lab">If the roll fails</span>
                              {k.downside}
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {e.crew?.burn && (
                <section className="blk">
                  <span className="lab">Burn · 2 Entropy</span>
                  <div className="tbl">
                    <div className="tr">
                      <img className="px" src={e.crew.burn.icon} alt="" />
                      <span className="trt">
                        <span className="trn">
                          {e.crew.burn.name} <span className="trd">· {e.crew.burn.when}</span>
                        </span>
                        <span className="trd">{e.crew.burn.text}</span>
                      </span>
                    </div>
                  </div>
                </section>
              )}
              {e.blocks.map((b) => (
                <section key={b.id} className={'blk' + (b.new ? ' new' : '') + (isGm && b.locked && !b.unlocked ? ' app-cx-shut' : '')}>
                  <span className="lab">
                    {b.new && <Diamond />}
                    {b.h}
                    {isGm && b.locked && <BlockToggle e={e} b={b} />}
                  </span>
                  <p className="txt">{b.text}</p>
                </section>
              ))}
              {e.rows.length > 0 && (
                <section className="blk">
                  {e.rows_label && <span className="lab">{e.rows_label}</span>}
                  <div className="tbl">
                    {e.rows.map((r, n) => (
                      <div key={n} className="tr">
                        {r.icon && <img className="px" src={r.icon} alt="" />}
                        <span className="trt">
                          <span className="trn">{r.n}</span>
                          {r.d && <span className="trd">{r.d}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {e.shots.length > 0 && (
                <section className="blk">
                  {e.shots_label && <span className="lab">{e.shots_label}</span>}
                  <div className="shots">
                    {e.shots.map((p) => (
                      <figure key={p.cap} className="shot" style={{ margin: 0 }}>
                        <img src={p.src} alt={p.cap} style={{ objectPosition: p.pos }} />
                        <figcaption>{p.cap}</figcaption>
                      </figure>
                    ))}
                  </div>
                </section>
              )}
            </div>
            <aside className="pin-rail">
              {facts.length > 0 && (
                <section className="blk">
                  <span className="lab">At a glance</span>
                  <dl className="facts">
                    {facts.map(([k, v]) => (
                      <div key={k} className="fact">
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}
              {!held && e.see.length > 0 && (
                <section className="blk">
                  <span className="lab">See also</span>
                  <div className="minis">
                    {e.see.map((c) => {
                      const to = view.codex!.entries.find((x) => x.id === c.id)
                      return (
                        <button key={c.id} type="button" className="mini" onClick={() => to && go(to.sec, to.id)}>
                          <span className="m-art">
                            <img className="tile" src={c.art.src} alt="" style={miniArt(c.art)} />
                          </span>
                          <span>{c.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )}
            </aside>
            {!held && brief}
          </div>
        </div>
      </article>
    </>
  )
}

/** The GM's switch for a whole page: players don't know it exists until it's on. */
function UnlockToggle({ e }: { e: CodexEntryView }) {
  const on = !!e.unlocked
  return (
    <button
      type="button"
      className={'app-cx-toggle' + (on ? ' on' : '')}
      aria-pressed={on}
      onClick={() => void gmRun('gm.codex.unlock', { entry: e.id, unlocked: !on })}
      title={on ? 'The crew can read this page. Click to lock it again.' : 'Only you can see this page. Click to unlock it for the whole crew.'}
    >
      {on ? 'Unlocked for the crew' : 'Locked · unlock for the crew'}
    </button>
  )
}

/** The GM's switch for one locked block: the page grows when it's on. */
function BlockToggle({ e, b }: { e: CodexEntryView; b: CodexEntryView['blocks'][number] }) {
  const on = !!b.unlocked
  return (
    <button
      type="button"
      className={'app-cx-toggle small' + (on ? ' on' : '')}
      aria-pressed={on}
      aria-label={`${b.h}: ${on ? 'open for the crew' : 'locked'}`}
      onClick={() => void gmRun('gm.codex.unlock', { entry: e.id, block: b.id, unlocked: !on })}
    >
      {on ? 'Open' : 'Locked'}
    </button>
  )
}
