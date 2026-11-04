import type { CSSProperties, ReactNode } from 'react'

/**
 * Round 9's inspector (Round 8's T3): the thing at 2x, a kind label, its name, then what it says.
 * The sheet shows it on hover, to the right of the column; the map shows it on click, as a card.
 */
export function Inspector({
  label,
  name,
  media,
  wide,
  sub,
  children,
  actions,
  className = '',
  style,
  role,
  id,
}: {
  label: string
  name: string
  media?: ReactNode // a 96 px picture beside the name
  wide?: ReactNode // a close-up across the top, instead of `media`
  sub?: ReactNode // under the name: an amount, a mood, HP and Entropy
  children?: ReactNode
  actions?: ReactNode
  className?: string
  style?: CSSProperties
  role?: string
  id?: string
}) {
  const meta = (
    <div className="app-ins-meta">
      <span className="r4-lab">{label}</span>
      <span className="app-ins-name">{name}</span>
      {sub}
    </div>
  )
  return (
    <div className={'app-ins ' + className} style={style} role={role} id={id}>
      {wide ? (
        <>
          {wide}
          <div className="app-ins-wide-meta">{meta}</div>
        </>
      ) : (
        <div className="app-ins-top">
          {media}
          {meta}
        </div>
      )}
      {children}
      {actions && <div className="app-ins-acts">{actions}</div>}
    </div>
  )
}

/** A 96 px pixel icon in its well, or a labelled box when there's no art yet. */
export function InspectIcon({ src, fallback }: { src: string | null | undefined; fallback: string }) {
  return src ? (
    <img src={src} alt="" className="r3-px app-ins-big" />
  ) : (
    <span className="app-ins-big app-ins-noicon" aria-hidden="true">
      {fallback}
    </span>
  )
}

/** A ruled section inside the inspector: ON A ROLL, DOWNSIDE. */
export function InspectBlock({ label, tone, children }: { label: string; tone?: 'down'; children: ReactNode }) {
  return (
    <div className={'app-ins-blk' + (tone ? ' ' + tone : '')}>
      <span className="r4-lab">{label}</span>
      {children}
    </div>
  )
}

/** A close-up cut from the map's own art: `centre` in display px, shown at 1.5x the art (0.75 display). */
export function Closeup({ art, display, centre, alt }: { art: string; display: [number, number]; centre: [number, number]; alt: string }) {
  const k = 0.75
  const w = 278
  const h = 170
  return (
    <div
      className="app-ins-wide"
      role="img"
      aria-label={alt}
      style={{
        backgroundImage: `url(${art})`,
        backgroundSize: `${display[0] * k}px ${display[1] * k}px`,
        backgroundPosition: `${-(centre[0] * k - w / 2)}px ${-(centre[1] * k - h / 2)}px`,
      }}
    />
  )
}

/** The Codex button, shown only for things that have an entry. The Codex itself arrives in M6. */
export function CodexButton() {
  return (
    <button type="button" className="r4-btn app-small app-cdx" disabled title="The Codex arrives in a later milestone">
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M1.5 2h3.5a1 1 0 0 1 1 1v7.5a1 1 0 0 0-1-1H1.5zM10.5 2H7a1 1 0 0 0-1 1v7.5a1 1 0 0 1 1-1h3.5z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      </svg>
      Codex
    </button>
  )
}
