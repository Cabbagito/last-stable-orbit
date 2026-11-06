import { create } from 'zustand'
import { GameSocket, type Status } from '../net/socket'
import { stillThere } from '../inspect/objects'
import { serverClock } from '../net/clock'
import { foldPlates, type PlateMemo } from '../roll/banners'
import { FADE, LINGER, emptyMemo, remember, type CallMemo } from '../roll/callouts'
import { burnTicks } from '../stage/burntime'
import { changes, type Change } from '../fx/changes'
import type { Ack, BurnView, ServerFrame, StatKey, Vec3, View } from '../types'

/** The roll screen: picking a stat, or playing (or showing the end of) one roll. */
export type Dialog = { kind: 'pick'; stat: StatKey; entry?: number } | { kind: 'roll'; rollId: string; resume: boolean }

interface RemoteDrag {
  at: Vec3
  t: number
}

interface GameStore {
  status: Status
  view: View | null
  /** Someone else is dragging this token right now. */
  remote: Record<string, RemoteDrag>
  /** I'm dragging this token: draw it here, whatever the last view says, until the server answers. */
  local: { token: string; at: Vec3 } | null
  selected: string | null
  gmMap: string | null
  /** The GM's map shows the Key board's pins ("what's where"). Remembered on this browser. */
  pins: boolean
  /** A request for the map to bring a tower's deck into view, around a spot: after a deck jump. */
  lookAt: { map: string; floor: number; at: Vec3; n: number } | null
  socket: GameSocket | null
  authLost: boolean
  dialog: Dialog | null
  /** Rolls this screen closed: never reopen them on reconnect. */
  dismissed: Record<string, true>
  /** After a (re)connect, reopen my own roll if the server says it's still open (a reload mid-roll). */
  resumeCheck: boolean
  calls: CallMemo
  /** Round 17: each roll's banner on this screen, which has its own timeline. */
  plates: PlateMemo
  callTick: number
  /** The newest Burn this screen saw, kept after the server clears it so its mark can linger (BurnMark). */
  burnSeen: BurnView | null
  /** The GM looking at one player's screen, read-only (`/?as=tally`): nothing here may act as them. */
  preview: string | null
  /** The last GM action the server refused, shown in the GM column and the GM tab until the next one works. */
  gmError: string
  /** M8: the latest change on each chip ("c:<character>", "t:<token>"), playing for FX_LIFE ms. `n` restarts it. */
  fx: Record<string, Change & { n: number }>
  connect: () => void
  disconnect: () => void
  select: (id: string | null) => void
  setLocal: (l: { token: string; at: Vec3 } | null) => void
  setGmMap: (m: string) => void
  setPins: (on: boolean) => void
  look: (map: string, floor: number, at: Vec3) => void
  openPick: (stat: StatKey, entry?: number) => void
  openRoll: (rollId: string, resume?: boolean) => void
  closeDialog: () => void
}

const PINS_KEY = 'lso.pins'
function readPins() {
  try {
    return localStorage.getItem(PINS_KEY) !== '0'
  } catch {
    return true
  }
}

const DRAG_TTL = 1500 // a relayed drag with no follow-up expires, so a dropped dragger can't freeze a token
export const FX_LIFE = 3800 // ms a change plays on its chip

export const useGame = create<GameStore>((set, get) => {
  const onFrame = (f: ServerFrame) => {
    if (f.t === 'view') {
      const now = Date.now()
      const remote = Object.fromEntries(Object.entries(get().remote).filter(([, r]) => now - r.t < 100))
      const sel = get().selected
      const { memo, closed } = remember(get().calls, f.view.rolls, now)
      if (closed.length) {
        // re-render when a closed roll's callout starts to fade, and when it's gone
        window.setTimeout(() => set({ callTick: get().callTick + 1 }), LINGER + 20)
        window.setTimeout(() => set({ callTick: get().callTick + 1 }), LINGER + FADE + 20)
      }
      const folded = foldPlates(get().plates, f.view.rolls, now, f.view.me.seat, !get().view)
      for (const d of folded.wake) window.setTimeout(() => set({ callTick: get().callTick + 1 }), d + 20)
      let burnSeen = get().burnSeen
      const b = f.view.stage.burn
      if (b && (b.at !== burnSeen?.at || b.char !== burnSeen?.char)) {
        burnSeen = b
        // re-render when its film ends, when its mark starts to fade, and when it's gone
        for (const d of burnTicks(b, serverClock.now())) window.setTimeout(() => set({ callTick: get().callTick + 1 }), d + 20)
      }
      let dialog = get().dialog
      const isGm = f.view.me.role === 'gm'
      const resume = get().resumeCheck
      if (resume && !dialog && !isGm) {
        const mine = f.view.rolls.find((r) => r.by === f.view.me.seat && r.open && !get().dismissed[r.id])
        if (mine) dialog = { kind: 'roll', rollId: mine.id, resume: true }
      }
      let fx = get().fx
      const ch = changes(get().view, f.view)
      if (ch.length) {
        fx = { ...fx }
        for (const c of ch) {
          const n = (fx[c.key]?.n ?? 0) + 1
          fx[c.key] = { ...c, n }
          window.setTimeout(() => {
            if (get().fx[c.key]?.n !== n) return // a newer change is playing there
            const { [c.key]: _done, ...rest } = get().fx
            set({ fx: rest })
          }, FX_LIFE)
        }
      }
      set({ view: f.view, remote, selected: stillThere(f.view, sel) ? sel : null, calls: memo, plates: folded.memo, burnSeen, dialog, resumeCheck: false, fx })
      // the GM reloaded mid-roll: finish landing it on the map
      if (resume && isGm) for (const r of f.view.rolls) if (r.by === 'gm' && r.open) playOnMap(r.id)
    } else if (f.t === 'drag') {
      const t = Date.now()
      set({ remote: { ...get().remote, [f.token]: { at: f.at, t } } })
      window.setTimeout(() => {
        const r = get().remote[f.token]
        if (r && r.t === t) {
          const { [f.token]: _gone, ...rest } = get().remote
          set({ remote: rest })
        }
      }, DRAG_TTL)
    }
  }

  return {
    status: 'connecting',
    view: null,
    remote: {},
    local: null,
    selected: null,
    gmMap: null,
    pins: readPins(),
    lookAt: null,
    socket: null,
    authLost: false,
    dialog: null,
    dismissed: {},
    resumeCheck: false,
    calls: emptyMemo(),
    plates: {},
    callTick: 0,
    burnSeen: null,
    preview: previewSeat(),
    gmError: '',
    fx: {},
    connect: () => {
      if (get().socket) return
      const as = get().preview
      const socket = new GameSocket(
        onFrame,
        (status) => set(status === 'live' ? { status, resumeCheck: true } : { status }),
        () => set({ authLost: true }),
        as ? `/ws?as=${encodeURIComponent(as)}` : '/ws',
      )
      set({ socket })
      socket.start()
    },
    disconnect: () => {
      get().socket?.stop()
      set({ socket: null, view: null, dialog: null, calls: emptyMemo(), plates: {}, burnSeen: null, fx: {} })
    },
    select: (selected) => set({ selected }),
    setLocal: (local) => set({ local }),
    setGmMap: (gmMap) => set({ gmMap }),
    look: (map, floor, at) => set({ lookAt: { map, floor, at, n: (get().lookAt?.n ?? 0) + 1 } }),
    setPins: (pins) => {
      try {
        localStorage.setItem(PINS_KEY, pins ? '1' : '0')
      } catch {
        // private window or blocked storage: it just isn't remembered
      }
      set({ pins })
    },
    openPick: (stat, entry = -1) => {
      if (!get().preview) set({ dialog: { kind: 'pick', stat, entry } })
    },
    openRoll: (rollId, resume = false) => set({ dialog: { kind: 'roll', rollId, resume } }),
    closeDialog: () => {
      const d = get().dialog
      set({ dialog: null, dismissed: d?.kind === 'roll' ? { ...get().dismissed, [d.rollId]: true } : get().dismissed })
    },
  }
})

/** Which seat this window is viewing as, if it's the GM's read-only view of a player. */
function previewSeat(): string | null {
  return new URLSearchParams(location.search).get('as') || null
}

export const send = (type: string, args: Record<string, unknown>): Promise<Ack> => {
  if (useGame.getState().preview) return Promise.resolve({ id: null, ok: false, code: 'read_only' }) // the server refuses it too
  return useGame.getState().socket?.send(type, args) ?? Promise.resolve({ id: null, ok: false, code: 'offline' })
}

/** A GM action: a refusal shows in the GM column (or the GM tab) until the next action works. */
export async function gmRun(type: string, args: Record<string, unknown>): Promise<Ack> {
  const ack = await send(type, args)
  useGame.setState({ gmError: ack.ok ? '' : ack.error || ack.code || 'That did not work' })
  return ack
}

export type GmRollMode = 'public' | 'hidden' | 'someone' | 'secret' | 'god'

/**
 * Roll for an NPC by its stat (its die is on its sheet), or "just a die" (only a die, no stat), in one of the modes
 * on the card (Round 17). No roll screen opens: this screen shows its own banner, and lands the dice on a timer, then
 * closes the roll. A public roll's explosions land one by one, as a roll screen's would. Anything players aren't to
 * read lands all at once, at the same moment whatever it came to, so how long it took tells them nothing.
 */
export async function gmRoll(args: { token: string; stat: StatKey; mode: GmRollMode } | { token: null; sides: number; mode: 'god' | 'secret' }) {
  const ack = await gmRun('gm.roll.start', args)
  if (!ack.ok) return
  const mine = useGame.getState().view?.rolls.filter((r) => r.by === 'gm' && r.open).pop()
  if (mine) playOnMap(mine.id)
}

const GM_FIRST = 2800 // ms the dice fly before they land (a God roll's die hits here too, by the server's clock)
const GM_NEXT = 1600 // each die an explosion adds
const GM_HOLD = 4000 // after the last die lands, before the roll closes: when its banner leaves
const playing = new Set<string>()

/** Land a GM roll's dice, as a roll screen would, then close it. */
function playOnMap(rollId: string) {
  const r = useGame.getState().view?.rolls.find((x) => x.id === rollId)
  if (!r?.open || !r.dice || playing.has(rollId)) return
  playing.add(rollId)
  const from = r.shown ?? 0
  const n = r.dice.length
  let t = from === 0 ? Math.max(100, r.started * 1000 + GM_FIRST - serverClock.now()) : 600
  const steps = r.tag ? [n] : Array.from({ length: n - from }, (_, i) => from + i + 1)
  for (const shown of steps) {
    window.setTimeout(() => void send('roll.reveal', { roll: rollId, shown }), t)
    t += GM_NEXT
  }
  window.setTimeout(() => {
    playing.delete(rollId)
    void send('roll.close', { roll: rollId })
  }, t - GM_NEXT + GM_HOLD)
}
