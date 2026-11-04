const COPY: Record<string, [string, string]> = {
  station: ['Station', 'A cross-section of Ergo. Hover an area for its info, and jump to any map from here. Designed in a later milestone.'],
  crew: ['Crew', 'A card per character, with lore and stats. Designed in a later milestone.'],
  codex: ['Codex', 'World entries, the glossary and How to play. Designed in a later milestone.'],
  gm: ['GM', 'For now the GM controls sit on the Scene, in the left column. This tab gets its own design in Milestone 4.'],
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
