import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { serverClock } from '../net/clock'
import { send, useGame } from '../store/game'
import type { SlotView } from '../types'
import { BONUS_SOON_AT, COMFORT_PIPS, coins, rateLabel, secondsLeft, spinSeconds } from './slots'

const HEIGHT = 840 // the machine is drawn into a 500 x 840 box
const SINK = 450 // ms the machine takes to sink away
const FRAME = 150 // ms per tick of the lights
const REST = 30 // reels land this many symbols down the strip
const NO_MOVE = ['none', 'none', 'none']

/**
 * The slot machine, once you've sat down at it (the Slots canvas). The map dims and the machine rises over it; the
 * sheet stays clear. The server picks every reel stop and counts who stood; this only animates what it's told.
 */
export function SlotsLayer() {
  const live = useGame((s) => s.view?.slots ?? null)
  const credits = useGame((s) => {
    const me = s.view?.me.char
    return (me && s.view?.inventory[me]?.find((e) => e.item.counted)?.count) || 0
  })
  const [held, setHeld] = useState<SlotView | null>(null)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const [k, setK] = useState(1)

  useEffect(() => {
    if (live) {
      setHeld(live)
      const t = window.requestAnimationFrame(() => window.requestAnimationFrame(() => setOpen(true)))
      return () => window.cancelAnimationFrame(t)
    }
    setOpen(false)
    const t = window.setTimeout(() => setHeld(null), SINK)
    return () => window.clearTimeout(t)
  }, [live])

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => setK(Math.min(1, (el.clientHeight - 24) / HEIGHT))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [!!held])

  if (!held) return null
  return (
    <div ref={box} className={'ov-layer' + (open ? ' open' : '')} aria-hidden={!open}>
      <div className="ov-veil" />
      <div className="sl-dev" style={{ '--sl-k': k } as CSSProperties} role="dialog" aria-label="Slot machine" aria-modal="false">
        <Machine seat={live ?? held} credits={credits} />
      </div>
    </div>
  )
}

function Machine({ seat, credits }: { seat: SlotView; credits: number }) {
  const art = seat.art
  const [reels, setReels] = useState(() => seat.reels.map((r) => r + REST))
  const [trans, setTrans] = useState(NO_MOVE)
  const [spinning, setSpinning] = useState(false)
  const [crank, setCrank] = useState<'up' | 'mid' | 'down'>('up')
  const [msg, setMsg] = useState(seat.spin ? seat.line : '')
  const [blinkMsg, setBlinkMsg] = useState(false)
  const [audit, setAudit] = useState(false)
  const [tick, setTick] = useState(0)
  const [fly, setFly] = useState(false)
  const lastSpin = useRef(seat.spin)
  const pending = useRef(false) // a pull is on its way to the server
  const timers = useRef<number[]>([])
  const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms))

  useEffect(() => {
    const iv = window.setInterval(() => setTick((t) => t + 1), FRAME)
    return () => {
      window.clearInterval(iv)
      timers.current.forEach(window.clearTimeout)
    }
  }, [])

  // a new pull: the crank goes down, the reels run to where the server stopped them
  useEffect(() => {
    if (seat.spin === lastSpin.current) return
    lastSpin.current = seat.spin
    const durs = spinSeconds(seat.near)
    setMsg('')
    setBlinkMsg(false)
    setSpinning(true)
    setCrank('mid')
    setTrans(NO_MOVE)
    setReels((r) => r.map((x) => (Math.round(x) % 5) + 5))
    later(50, () => {
      setReels(seat.reels.map((t) => t + REST))
      setTrans(durs.map((d) => `transform ${d}s cubic-bezier(.12,.62,.22,1.03)`))
    })
    later(90, () => setCrank('down'))
    later(300, () => setCrank('mid'))
    later(420, () => setCrank('up'))
    later(Math.max(...durs) * 1000 + 80, () => {
      setSpinning(false)
      pending.current = false
      setMsg(seat.line)
    })
  }, [seat.spin, seat.near, seat.reels, seat.line])

  // the flood: the coins keep bursting out of the tray
  const flood = seat.page === 'flood'
  useEffect(() => {
    if (!flood) return
    setFly(false)
    const go = window.setTimeout(() => setFly(true), 60)
    const iv = window.setInterval(() => {
      setFly(false)
      window.setTimeout(() => setFly(true), 40)
    }, FRAME * 9)
    return () => {
      window.clearTimeout(go)
      window.clearInterval(iv)
    }
  }, [flood])

  const burst = useMemo(() => coins(30, 7, 230, 70, 80, 0.45, [0.75, 0.4]), [])

  const busy = spinning || pending.current
  const pull = () => {
    if (busy || seat.page !== 'play') return
    if (!seat.free && credits < seat.pull) {
      setMsg('INSERT CREDITS')
      setBlinkMsg(true)
      return
    }
    pending.current = true
    void send('slots.pull', {}).then((a) => {
      if (!a.ok) pending.current = false
    })
  }
  const stand = () => {
    if (!busy && seat.page === 'play') void send('slots.stand', {})
  }
  const sitBack = () => {
    setMsg('WELCOME BACK!')
    void send('slots.sit_back', {})
  }
  const freeSpin = () => {
    setMsg('')
    void send('slots.free', {})
  }
  const leave = () => void send('slots.leave', {})

  const phase = flood ? tick % 2 : Math.floor(tick / 3) % 2
  const shown = seat.page === 'play' && audit ? 'audit' : seat.page
  const left = secondsLeft(seat.until, serverClock.now(), seat.window)
  const pips = Array.from({ length: Math.ceil(seat.window) }, (_, i) => i < left)
  const y = (i: number) => `translateY(${45 - 60 * i}px)`
  const line = msg || (seat.free ? 'FREE SPIN!' : '')
  const out = seat.page === 'out'

  return (
    <div className="sl-machine" onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}>
      {out ? (
        <img className="sl-art" src={art.dark} alt="" draggable={false} />
      ) : (
        <>
          <img className="sl-art" src={art.lit_a} alt="" draggable={false} />
          <img className="sl-art" src={art.lit_b} alt="" draggable={false} style={{ opacity: phase }} />
        </>
      )}

      <div className="sl-screen">
        {shown === 'play' && (
          <div className="sl-pg sl-play">
            <div className="sl-top">
              <span>
                <span className="sl-dim">CREDIT</span> {credits}
              </span>
              <span style={{ opacity: blinkMsg && phase ? 0 : 1 }}>{line}</span>
            </div>
            <div className="sl-reels">
              {[0, 1, 2].map((i) => (
                <div key={i} className="sl-reel">
                  <img src={art.reel} alt="" draggable={false} style={{ transform: y(reels[i]), transition: trans[i], filter: spinning ? 'blur(1.4px)' : 'none' }} />
                </div>
              ))}
              <div className="sl-payline" />
            </div>
            <div className="sl-comfort">
              <span className="sl-dim">COMFORT</span>
              <span className="sl-pips">
                {Array.from({ length: COMFORT_PIPS }, (_, i) => (
                  <i key={i} className={i < seat.pulls ? 'on' : ''} />
                ))}
              </span>
              <span className="sl-bonus" style={{ opacity: seat.pulls >= BONUS_SOON_AT ? (phase ? 0.2 : 1) : 0 }}>BONUS SOON</span>
            </div>
            <div className="sl-row">
              <button type="button" className="sl-b" onClick={pull}>PULL</button>
              {seat.audit && <button type="button" className="sl-b" onClick={() => setAudit(true)}>AUDIT</button>}
              <button type="button" className="sl-b solid" onClick={stand}>STAND UP</button>
            </div>
          </div>
        )}

        {shown === 'wait' && (
          <div className="sl-pg sl-wait">
            <div style={{ fontSize: 60, lineHeight: '52px' }}>WAIT—</div>
            <div style={{ fontSize: 40, lineHeight: '38px' }}>DON'T GO.</div>
            <div className="sl-dim" style={{ fontSize: 20, lineHeight: '20px', marginTop: 6 }}>YOUR LUCK IS TURNING.</div>
            <div className="sl-waitpips">
              {pips.map((on, i) => (
                <i key={i} className={on ? 'on' : ''} />
              ))}
            </div>
            <div className="sl-foot">
              <button type="button" className="sl-b" onClick={sitBack}>SIT BACK DOWN</button>
            </div>
          </div>
        )}

        {shown === 'lucky' && (
          <div className="sl-pg sl-lucky">
            <div style={{ fontSize: 58, lineHeight: '52px', opacity: phase ? 0.25 : 1 }}>LUCKY!</div>
            <div style={{ fontSize: 84, lineHeight: '76px', color: '#d8327e' }}>+{seat.payout}</div>
            <div className="sl-dim" style={{ fontSize: 20, lineHeight: '20px' }}>CREDIT {credits}</div>
            <div className="sl-foot sl-between">
              <button type="button" className="sl-b solid" onClick={freeSpin}>FREE SPIN?</button>
              <button type="button" className="sl-b" onClick={leave}>LEAVE</button>
            </div>
          </div>
        )}

        {shown === 'flood' && (
          <div className="sl-pg sl-lucky sl-floodpg">
            <div style={{ fontSize: 44, lineHeight: '40px', opacity: phase ? 0.25 : 1 }}>EVENT<br />HORIZON!</div>
            <div style={{ fontSize: 76, lineHeight: '70px', color: '#ff7dbb' }}>+{seat.payout}</div>
            <div style={{ fontSize: 20, lineHeight: '20px', color: '#cfc4ff' }}>CREDIT {credits}</div>
            <div className="sl-foot sl-end">
              <button type="button" className="sl-b" onClick={leave}>LEAVE</button>
            </div>
          </div>
        )}

        {shown === 'out' && (
          <div className="sl-pg sl-outpg">
            <div style={{ fontSize: 44, lineHeight: '40px' }}>OUT OF<br />SERVICE</div>
            <div style={{ fontSize: 22, lineHeight: '22px', marginTop: 10 }}>WE'RE SORRY.</div>
            <div style={{ fontSize: 22, lineHeight: '22px' }}>PLEASE ENJOY THE BAR.</div>
            <div className="sl-foot sl-end">
              <button type="button" className="sl-b" onClick={leave}>LEAVE</button>
            </div>
          </div>
        )}

        {shown === 'audit' && seat.audit && (
          <div className="sl-pg sl-audit">
            <div className="sl-svc">SERVICE MODE · UNIT {seat.unit}</div>
            <div className="sl-grid">
              <span className="sl-dim">SCORES</span><span>SEAT TIME</span>
              <span className="sl-dim">PROFIT</span><span>NOT KEPT</span>
              <span className="sl-dim">PAYS ON PULL</span><span>NEVER</span>
              <span className="sl-dim">PAYS ON STAND</span><span>LOST × RATE</span>
              <span className="sl-dim">WINDOW</span><span>{seat.audit.window} SEC</span>
            </div>
            <div className="sl-rates">
              <span className="sl-dim">STANDING</span>
              {seat.audit.paid_back.map((_, i) => <span key={i}>{i + 1}</span>)}
              <span className="sl-dim">RATE</span>
              {seat.audit.paid_back.map((p, i) => <span key={i}>{rateLabel(p)}</span>)}
            </div>
            <div className="sl-foot sl-end">
              <button type="button" className="sl-b" onClick={() => setAudit(false)}>EXIT</button>
            </div>
          </div>
        )}

        <div className="sl-glass" />
      </div>

      {/* all three cranks are always there, so the first pull doesn't wait on an image */}
      <img className="sl-art" src={art.crank_up} alt="A white slot machine with a crank" draggable={false} style={{ visibility: crank === 'up' ? 'visible' : 'hidden' }} />
      <img className="sl-art" src={art.crank_mid} alt="" draggable={false} style={{ visibility: crank === 'mid' ? 'visible' : 'hidden' }} />
      <img className="sl-art" src={art.crank_down} alt="" draggable={false} style={{ visibility: crank === 'down' ? 'visible' : 'hidden' }} />

      <button type="button" aria-label="Pull the crank" className="sl-crank" onClick={pull} />

      {flood && (
        <div className="sl-coins">
          {burst.map((c, i) => (
            <span key={i} style={{ transform: `translateX(${fly ? c.dx : 0}px)`, transition: fly ? `transform ${c.t}s linear ${c.d}s` : 'none' }}>
              <img src={art.coin} alt="" style={{ transform: `translateY(${fly ? c.dy : 0}px)`, transition: fly ? `transform ${c.t}s cubic-bezier(.3,-1.8,.65,1) ${c.d}s` : 'none' }} />
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
