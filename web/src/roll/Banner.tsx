import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { useGame } from '../store/game'
import type { RollView, View } from '../types'
import { livePlates, type LivePlate } from './banners'
import { dieIcon, lookOf, statIcon } from './stats'

// Round 17: a roll on anyone else's screen is one big banner. The face and name, what's being rolled, the skill, and
// a box where each stat's motion runs while the dice fly and the number slams in when they land. The map isn't dimmed
// on a laptop; on the TV the banner takes the whole screen.

export const SIL_PATH =
  'M14 2H18V3H14ZM12 3H20V4H12ZM11 4H21V5H11ZM10 5H22V6H10ZM10 6H22V7H10ZM9 7H23V8H9ZM9 8H23V9H9ZM9 9H23V10H9ZM9 10H23V11H9ZM9 11H23V12H9ZM9 12H23V13H9ZM9 13H23V14H9ZM9 14H23V15H9ZM9 15H23V16H9ZM10 16H22V17H10ZM10 17H22V18H10ZM11 18H21V19H11ZM12 19H20V20H12ZM13 20H19V21H13ZM13 21H19V22H13ZM9 22H23V23H9ZM8 23H24V24H8ZM7 24H25V25H7ZM6 25H26V26H6ZM5 26H27V27H5ZM4 27H28V28H4ZM3 28H29V29H3ZM3 29H29V30H3ZM3 30H29V31H3ZM3 31H29V32H3ZM3 32H29V33H3ZM3 33H29V34H3Z'

const SPARKS = [[120, -90], [170, -30], [150, 60], [90, 120], [20, 150], [-60, 130], [-130, 90], [-180, 20], [-160, -60], [-90, -120], [-20, -150], [60, -140], [200, 90], [-210, -90]]
const STRIPS = {
  reel: { cls: 'g-reel', frames: ['7', '2', '9', '4', '1', '8', '7'] },
  decrypt: { cls: 'g-dec', frames: ['0x', 'A7', 'F3', '1C', '9E', 'B2', '0x'] },
  solve: { cls: 'g-sol', frames: ['∑', '∫', 'π', '√', 'Δ', '∂', '∑'] },
} as const
const WIDE = 862 // a banner with a skill in it, at full size
const NARROW = 724 // one without
const HEIGHT = 188

/** The banners up on this screen right now. */
export function usePlates(): LivePlate[] {
  const view = useGame((s) => s.view)
  const memo = useGame((s) => s.plates)
  useGame((s) => s.callTick) // re-render when one leaves
  return view ? livePlates(view.rolls, memo, Date.now(), view.me.role === 'gm') : []
}

/** Who a roll belongs to, as this screen may know it. */
export function rollerOf(view: View, r: RollView) {
  const crew = r.char ? view.crew.find((c) => c.id === r.char) : undefined
  const tok = !crew && r.token ? view.tokens[r.token] : undefined
  return {
    crew,
    name: (crew?.short ?? tok?.name ?? (r.stat ? 'Someone' : 'Just a die')).toUpperCase(),
    face: crew?.portrait ?? tok?.portrait ?? null,
  }
}

function Motion({ r, die }: { r: RollView; die: string }) {
  const mode = lookOf(r.stat).mode
  if (mode === 'reel' || mode === 'decrypt' || mode === 'solve')
    return (
      <span className="r17-win">
        <span className={'r17-strip ' + STRIPS[mode].cls}>
          {STRIPS[mode].frames.map((f, i) => (
            <span key={i} className="r17-fr">
              {f}
            </span>
          ))}
        </span>
      </span>
    )
  if (mode === 'slam') return <img className={'r17-px r17-mo-slam' + (r.stat ? '' : ' r17-gray')} src={die} alt="" draggable={false} />
  if (mode === 'fade') return <span className="r17-mo-cool">?</span>
  return (
    <svg className="r17-mo-pulse" viewBox="0 0 28 20" aria-hidden="true">
      <path d="M0 11 H7 L9 6 L12 16 L15 3 L18 13 L20 11 H28" fill="none" stroke="currentColor" strokeWidth="1.2" pathLength={60} />
    </svg>
  )
}

function Plate({ p, y, k }: { p: LivePlate; y: number; k: number }) {
  const view = useGame((s) => s.view)
  if (!view) return null
  const { r, phase } = p
  const L = lookOf(r.stat)
  const who = rollerOf(view, r)
  const skill = r.entry ? who.crew?.list.find((e) => e.name === r.entry) : undefined
  const die = dieIcon(r.stat ?? 'body', r.sides)
  const shut = r.sealed && (phase === 'seal' || phase === 'out')
  const rolling = phase === 'roll' || phase === 'boom' || phase === 'seal'
  const landed = phase === 'land' || phase === 'nat1' || phase === 'push' || phase === 'repush'
  const hold = phase === 'out' && r.value !== undefined
  const nat1 = r.phase === 'nat1'
  const pushedNow = phase === 'push' || phase === 'repush'
  const tag = r.tag || (shut ? 'HIDDEN' : '')
  const doing = shut ? 'ROLLED' : rolling ? 'ROLLING' : phase === 'nat1' ? 'NATURAL 1' : landed || hold ? 'ROLLED' : ''
  const sub = phase === 'land' && (r.count ?? 1) > 1 ? `×${r.count}` : pushedNow ? 'PUSHED' : ''
  const fx = phase === 'land' || phase === 'boom' || phase === 'nat1' || pushedNow
  const say = `${who.name} rolls ${L.title}${r.entry ? ` using ${r.entry}` : ''}` + (landed ? `: ${nat1 ? 'natural 1' : r.value}` : shut ? ', hidden' : '')
  return (
    <div className="r17-plw" style={{ top: y, '--k': k, '--c': L.col, '--fx': L.fx } as CSSProperties}>
      <div className={`r17-pl p-${phase} m-${L.mode}`} role="img" aria-label={say}>
        <div className={'r17-pf' + (who.face ? '' : ' nosee')}>
          {who.face ? (
            <img className="r17-px" src={who.face} alt="" draggable={false} />
          ) : (
            <svg className="r17-sil" viewBox="0 0 32 34" shapeRendering="crispEdges" aria-hidden="true">
              <path d={SIL_PATH} fill="currentColor" />
            </svg>
          )}
        </div>
        <div className="r17-pm">
          <div className="r17-pn">
            <span className="r17-pname">{who.name}</span>
            <span className="r17-pdoing">{doing}</span>
            {tag && <span className="r17-phid">{tag}</span>}
          </div>
          <div className="r17-ptiles">
            {r.stat && (
              <div className="r17-tile">
                <img className="r17-px" src={statIcon(r.stat)} alt="" draggable={false} />
                <span>{L.name}</span>
              </div>
            )}
            <div className="r17-tile t2">
              <img className={'r17-px' + (r.stat ? '' : ' r17-gray')} src={die} alt="" draggable={false} />
              <span>D{r.sides}</span>
            </div>
            {r.entry && (
              <div className="r17-sk">
                {skill?.icon ? (
                  <img className="r17-px" src={skill.icon} alt="" draggable={false} />
                ) : (
                  <span className="r17-sknoicon" aria-hidden="true">
                    {skill?.kind === 'chrome' ? 'CHROME' : 'SKILL'}
                  </span>
                )}
                <div className="r17-skt">
                  <div className="r17-sku">USING</div>
                  <div className="r17-skn">{r.entry}</div>
                </div>
              </div>
            )}
          </div>
          {nat1 && (phase === 'nat1' || phase === 'out') && r.insult && <div className="r17-insult">{r.insult}</div>}
        </div>
        <div className="r17-pb">
          {rolling && <Motion r={r} die={die} />}
          {(landed || hold) && (
            <span key={r.value} className="r17-num">
              {r.value}
            </span>
          )}
          {(phase === 'boom' || phase === 'land') && r.chain !== undefined && <span className="r17-chain">{r.chain} +</span>}
          {shut && (
            <span className="r17-shutw">
              <span className="r17-shut t" />
              <span className="r17-shut b" />
              <span className="r17-sealq">?</span>
            </span>
          )}
          {sub && <span className="r17-sub">{sub}</span>}
          {pushedNow && r.pushes > 0 && (
            <span key={r.pushes} className="r17-pushf">
              +{r.pushed / r.pushes}
            </span>
          )}
          {fx && (
            <span key={`${phase}-${r.pushes}-${r.chain}`} className="r17-fxw">
              <span className="r17-shock" />
              <span className="r17-shock s2" />
              {SPARKS.map(([dx, dy], i) => (
                <span key={i} className="r17-spark" style={{ '--dx': `${dx}px`, '--dy': `${dy}px` } as CSSProperties} />
              ))}
            </span>
          )}
        </div>
        {phase === 'boom' && (
          <div key={r.chain} className="r17-ribbon">
            EXPLODES
          </div>
        )}
        {nat1 && (phase === 'nat1' || phase === 'out') && (
          <svg className="r17-crack" viewBox="0 0 860 188" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
            <polyline points="610,0 650,52 628,84 700,118 684,188" fill="none" stroke="#ff5b4d" strokeWidth="2.5" />
            <polyline points="650,52 760,34 860,62" fill="none" stroke="#ff5b4d" strokeWidth="2" />
            <polyline points="700,118 790,150 860,132" fill="none" stroke="#ff5b4d" strokeWidth="1.5" />
          </svg>
        )}
        {(phase === 'roll' || phase === 'land') && <span key={phase} className="r17-sweep" />}
      </div>
    </div>
  )
}

/**
 * The banners, in the middle of what's free: on the Scene that's the map between the sheet and the crew rail, moved
 * clear of an open card, and under the turn strip in a fight; on the TV the whole screen, dimmed behind it.
 */
export function Banners({ where, low = false }: { where: 'scene' | 'page' | 'tv'; low?: boolean }) {
  const plates = usePlates()
  const card = useGame((s) => where === 'scene' && !!s.selected)
  const box = useRef<HTMLDivElement>(null)
  const [[w, h], setSize] = useState<[number, number]>([0, 0])
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize([e.contentRect.width, e.contentRect.height]))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const tv = where === 'tv'
  const many = plates.length > 1 ? 0.74 : 1
  const fit = w ? w / (plates.some((p) => p.r.entry) ? WIDE : NARROW) : 1
  const k = (tv ? 1.56 * Math.min(w / 1440 || 1, h / 900 || 1) : Math.min(card ? 0.9 : 1, fit)) * many
  const y0 = tv ? h / 3 : low ? 124 : 0
  const last = plates[plates.length - 1]
  const landed = last && !last.r.sealed && last.r.value !== undefined
  return (
    <div ref={box} className={`r17-lane ${where}${card ? ' card' : ''}`}>
      {tv && <div className={'r17-spot' + (plates.length ? ' on' : '')} />}
      {plates.map((p, i) => (
        <Plate key={p.r.id} p={p} y={y0 + i * (HEIGHT * k + 10)} k={k} />
      ))}
      <div className="app-sr" aria-live="polite">
        {last && landed ? `${rollerOf(useGame.getState().view!, last.r).name} rolled ${lookOf(last.r.stat).title}: ${last.r.phase === 'nat1' ? 'a natural 1' : last.r.value}` : ''}
      </div>
    </div>
  )
}
