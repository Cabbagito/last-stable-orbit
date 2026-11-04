const COPY: Record<string, [string, string]> = {
  station: ['Station', 'A cross-section of Ergo. Hover an area for its info, and jump to any map from here. Designed in a later milestone.'],
}

export function Placeholder({ tab }: { tab: string }) {
  const [title, body] = COPY[tab] ?? ['', '']
  return (
    <div className="app-body app-placeholder">
      <div>
        <div className="r4-place">{title}</div>
        <p style={{ color: 'var(--dim)', maxWidth: 520, lineHeight: 1.4 }}>{body}</p>
      </div>
    </div>
  )
}
