import { gmRun } from '../store/game'
import type { View } from '../types'

/**
 * The GM tab's Codex: every page by section, with a switch to unlock it for the whole crew, and a switch for each
 * locked part inside it (the saint, then the man, then the truth). Players never learn a locked page exists. Open
 * goes to the page in the Codex tab, where you see it as the crew would, plus what's still locked.
 */
export function CodexSection({ view }: { view: View }) {
  const codex = view.codex
  if (!codex) return null
  return (
    <section aria-label="Codex" style={{ minWidth: 0 }}>
      <div className="r10-h">Codex</div>
      <div className="r5-role" style={{ marginBottom: 14 }}>
        Unlocking is for the whole crew. A new page or part stays marked for each player until they read it.
      </div>
      <div className="app-cxgm">
        {codex.sections.map((s) => {
          const list = codex.entries.filter((e) => e.sec === s.id)
          const open = list.filter((e) => e.unlocked).length
          return (
            <div key={s.id} className="app-cxgm-sec">
              <div className="r5-sec">
                {s.name} <span style={{ letterSpacing: '.08em' }}>· {open} of {list.length} unlocked</span>
              </div>
              <div className="r5-rows">
                {list.map((e) => {
                  const shut = e.blocks.filter((b) => b.locked)
                  return (
                    <div key={e.id} className={'app-cxgm-row' + (e.unlocked ? '' : ' off')}>
                      <img src={e.art.src} alt="" className="r3-px app-cxgm-art" />
                      <div className="app-cxgm-name">
                        <span>{e.name}</span>
                        <span className="r10-dimtxt">{e.role}</span>
                        {shut.length > 0 && (
                          <span className="app-cxgm-blocks">
                            {shut.map((b) => (
                              <button
                                key={b.id}
                                type="button"
                                className={'app-cxgm-chip' + (b.unlocked ? ' on' : '')}
                                aria-pressed={!!b.unlocked}
                                title={b.unlocked ? 'Open for the crew. Click to lock it again.' : 'Locked. Click to open it for the crew.'}
                                onClick={() => void gmRun('gm.codex.unlock', { entry: e.id, block: b.id, unlocked: !b.unlocked })}
                              >
                                {b.h}
                              </button>
                            ))}
                          </span>
                        )}
                      </div>
                      <a className="app-link" href={`#codex/${e.sec}/${e.id}`}>
                        Open
                      </a>
                      <button
                        type="button"
                        className={'app-cxgm-sw' + (e.unlocked ? ' on' : '')}
                        aria-pressed={!!e.unlocked}
                        aria-label={`${e.name}: ${e.unlocked ? 'unlocked for the crew' : 'locked'}`}
                        onClick={() => void gmRun('gm.codex.unlock', { entry: e.id, unlocked: !e.unlocked })}
                      >
                        {e.unlocked ? 'Unlocked' : 'Locked'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
