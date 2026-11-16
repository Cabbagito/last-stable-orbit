import { HELP, type Role } from './bindings'
import { useKeys } from './registry'

/** The ? sheet: every key, for whoever is logged in. ? or Esc (or a click outside) closes it. */
export function KeyHelp({ role }: { role: Role }) {
  const open = useKeys((s) => s.help)
  if (!open) return null
  const close = () => useKeys.setState({ help: false })
  return (
    <div className="app-fscrim app-keyscrim" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <section className="app-fdlg app-keyhelp" role="dialog" aria-modal="true" aria-label="Keys">
        <div className="r4-name">Keys</div>
        {HELP[role].map((g) => (
          <div key={g.title}>
            <div className="r5-sec app-fdsec">{g.title}</div>
            <dl className="app-keys">
              {g.rows.map(([k, what]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{what}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </section>
    </div>
  )
}
