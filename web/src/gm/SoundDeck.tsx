import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { gmRun, useGame } from '../store/game'
import { digitLabel, endChord, useKeyHandler, useKeys } from '../keys/registry'

const TONE = { good: '#5ee08c', great: '#f2b544', bad: '#ff5b4d' } as const

/**
 * The Sound deck (the LSO - Soundboard canvas): one button on the top bar, and a panel down the right edge with
 * everything the GM plays on the TV by hand. Music: one press changes the track and it crossfades; pressing the one
 * that's playing stops it. Flares: three, always in reach. Sounds: four tabs of pads, one press each.
 * B opens and closes it. Opened with B, the next two digits play a pad (the tab's digit, then the sound's) and it
 * closes again; a click inside keeps it open. Sounds that play by themselves have no place here: see soundboard.yaml.
 */
export function SoundDeck() {
  const deck = useGame((s) => s.view?.stage.deck) // only the GM's own feed has it
  const music = useGame((s) => s.view?.stage.music)
  const tv = useGame((s) => !!s.view?.stage.tv)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState(0)
  const chord = useKeys((s) => s.chord)
  const keyed = useRef(false) // B opened it, so it closes when B is done
  // the slider shows where the hand has it, not the server's answer to a moment ago: that would tug it back mid-drag
  const [vol, setVol] = useState(music?.volume ?? 8)
  const moved = useRef(0)
  const serverVol = music?.volume
  useEffect(() => {
    if (serverVol !== undefined && Date.now() - moved.current > 600) setVol(serverVol)
  }, [serverVol])
  const turn = (v: number) => {
    moved.current = Date.now()
    setVol(v)
    void gmRun('gm.music.volume', { volume: v })
  }

  useKeyHandler('sound.ready', () => {
    if (!deck) return false
    if (open) {
      setOpen(false)
      return false
    }
    keyed.current = true
    setOpen(true)
  })
  useKeyHandler('sound.cat', (i) => {
    if (!deck?.pads[i]) return false
    setTab(i)
  })
  useKeyHandler('sound.play', (i) => {
    const snd = deck?.pads[useKeys.getState().soundCat ?? -1]?.sounds[i]
    if (!tv || !snd) return false
    void gmRun('gm.sound.play', { sound: snd.id })
  })
  useEffect(() => {
    if (!chord && keyed.current) {
      keyed.current = false
      setOpen(false)
    }
  }, [chord])
  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [open])

  if (!deck) return null
  const armed = open && (chord === 'sound' || chord === 'soundCat')
  const pin = () => {
    keyed.current = false // a click means they're staying: it's theirs to close now
    if (armed) endChord()
  }
  const toggle = () => {
    keyed.current = false
    if (armed) endChord()
    setOpen(!open)
  }
  const playing = music?.track ?? null
  const now = deck.music.flatMap((g) => g.tracks).find((t) => t.id === playing)
  const pads = deck.pads[tab] ?? deck.pads[0]
  const padTab = deck.pads.indexOf(pads)

  return (
    <>
      <button type="button" className={'sd-open' + (open ? ' on' : '')} aria-expanded={open} title="Music, flares and sounds, on the TV (B)" onClick={toggle}>
        Sound
        {now && <span className="sd-live" aria-label={`Playing ${now.name}`} />}
      </button>
      {open &&
        createPortal(
          <aside className={'sd' + (armed ? ' keyed' : '')} aria-label="Sound deck" onPointerDownCapture={pin}>
            <div className="sd-head">
              <span className="sd-title">Sound</span>
              <span className="sd-code">B</span>
              <span className={'sd-tv' + (tv ? ' on' : '')}>
                <i aria-hidden="true" />
                {tv ? 'On the TV' : 'No TV'}
              </span>
              <button type="button" className="sd-x" aria-label="Close the Sound deck" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>

            <section className="sd-sec">
              <div className="sd-now">
                <button type="button" className="sd-pad sd-stop" aria-label="Stop the music" disabled={!playing} onClick={() => void gmRun('gm.music.stop', {})}>
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                    <rect x="1" y="1" width="10" height="10" fill="currentColor" />
                  </svg>
                </button>
                <div className="sd-nowtxt">
                  <span className="sd-lab">Music</span>
                  <span className="sd-nowname">{now ? now.name : 'Silence'}</span>
                </div>
                <label htmlFor="sd-vol" className="sd-lab">
                  Vol
                </label>
                <input
                  id="sd-vol"
                  type="range"
                  min={0}
                  max={10}
                  step={1}
                  value={vol}
                  onChange={(e) => turn(Number(e.target.value))}
                />
              </div>
              {deck.music.map((g) => (
                <div key={g.id} className="sd-group">
                  <span className="sd-lab">{g.name}</span>
                  <div className="sd-grid">
                    {g.tracks.map((t) => {
                      const on = t.id === playing
                      return (
                        <button
                          key={t.id}
                          type="button"
                          className={'sd-pad sd-track' + (on ? ' on' : '')}
                          aria-pressed={on}
                          onClick={() => void (on ? gmRun('gm.music.stop', {}) : gmRun('gm.music.play', { track: t.id }))}
                        >
                          <span className="sd-name">{t.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </section>

            <section className="sd-sec">
              <span className="sd-lab">Flares</span>
              <div className="sd-grid three">
                {deck.flares.map((f) => (
                  <button key={f.id} type="button" className="sd-pad sd-flare" disabled={!tv} onClick={() => void gmRun('gm.sound.play', { sound: f.id })}>
                    <i aria-hidden="true" style={{ background: TONE[f.tone] }} />
                    <span className="sd-name">{f.name}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="sd-sec sd-pads">
              <div className="sd-tabs" role="tablist" aria-label="Sounds">
                {deck.pads.map((c, ci) => (
                  <button key={c.id} type="button" role="tab" aria-selected={ci === padTab} className={'sd-tab' + (ci === padTab ? ' on' : '')} onClick={() => setTab(ci)}>
                    {c.name} <span>{digitLabel(ci)}</span>
                  </button>
                ))}
              </div>
              <div className="sd-grid">
                {pads?.sounds.map((s, si) => (
                  <button key={s.id} type="button" className="sd-pad" disabled={!tv} onClick={() => void gmRun('gm.sound.play', { sound: s.id })}>
                    <span className="sd-name">{s.name}</span>
                    {padTab < 10 && si < 10 && (
                      <span className="sd-code" aria-label={`B ${digitLabel(padTab)} ${digitLabel(si)}`}>
                        {digitLabel(padTab)} {digitLabel(si)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          </aside>,
          document.querySelector('.r4') ?? document.body,
        )}
    </>
  )
}
