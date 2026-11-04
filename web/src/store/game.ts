import { create } from 'zustand'
import { GameSocket, type Status } from '../net/socket'
import { stillThere } from '../inspect/objects'
import { FADE, LINGER, emptyMemo, remember, type CallMemo } from '../roll/callouts'
import type { Ack, ServerFrame, StatKey, Vec3, View } from '../types'

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
  socket: GameSocket | null
  authLost: boolean
  dialog: Dialog | null
  /** Rolls this screen closed: never reopen them on reconnect. */
  dismissed: Record<string, true>
  /** After a (re)connect, reopen my own roll if the server says it's still open (a reload mid-roll). */
  resumeCheck: boolean
  calls: CallMemo
  callTick: number
  /** The GM looking at one player's screen, read-only (`/?as=tally`): nothing here may act as them. */
  preview: string | null
  /** The last GM action the server refused, shown in the GM column and the GM tab until the next one works. */
  gmError: string
  connect: () => void
  disconnect: () => void
  select: (id: string | null) => void
  setLocal: (l: { token: string; at: Vec3 } | null) => void
  setGmMap: (m: string) => void
  openPick: (stat: StatKey, entry?: number) => void
  openRoll: (rollId: string, resume?: boolean) => void
  closeDialog: () => void
}

const DRAG_TTL = 1500 // a relayed drag with no follow-up expires, so a dropped dragger can't freeze a token

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
      let dialog = get().dialog
      const isGm = f.view.me.role === 'gm'
      const resume = get().resumeCheck
      if (resume && !dialog && !isGm) {
        const mine = f.view.rolls.find((r) => r.by === f.view.me.seat && r.open && !get().dismissed[r.id])
        if (mine) dialog = { kind: 'roll', rollId: mine.id, resume: true }
      }
      set({ view: f.view, remote, selected: stillThere(f.view, sel) ? sel : null, calls: memo, dialog, resumeCheck: false })
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
    socket: null,
    authLost: false,
    dialog: null,
    dismissed: {},
    resumeCheck: false,
    calls: emptyMemo(),
    callTick: 0,
    preview: previewSeat(),
    gmError: '',
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
      set({ socket: null, view: null, dialog: null, calls: emptyMemo() })
    },
    select: (selected) => set({ selected }),
    setLocal: (local) => set({ local }),
    setGmMap: (gmMap) => set({ gmMap }),
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

/**
 * Roll for an NPC by its stat (its die is on its sheet), or "just a die" (only a die, no stat). No roll screen
 * opens: the roll plays on the NPC's chip, for players too unless it's hidden, and "just a die" lands in the GM
 * column. This screen lands the dice on a timer, explosions included, then closes the roll.
 */
export async function gmRoll(args: { token: string; stat: StatKey; hidden: boolean } | { token: null; sides: number }) {
  const ack = await gmRun('gm.roll.start', args)
  if (!ack.ok) return
  const mine = useGame.getState().view?.rolls.filter((r) => r.by === 'gm' && r.open).pop()
  if (mine) playOnMap(mine.id)
}

const GM_FIRST = 1800 // ms the dice spin on the chip before the first one lands
const GM_NEXT = 1300 // each die an explosion adds
const GM_HOLD = 2500 // after the last die lands, before the roll closes; its callout then lingers and fades
const playing = new Set<string>()

/** Land a GM roll's dice one by one, as a roll screen would, then close it. */
function playOnMap(rollId: string) {
  const r = useGame.getState().view?.rolls.find((x) => x.id === rollId)
  if (!r?.open || !r.dice || playing.has(rollId)) return
  playing.add(rollId)
  const from = r.shown ?? 0
  let t = from === 0 ? GM_FIRST : 600
  for (let shown = from + 1; shown <= r.dice.length; shown++) {
    const n = shown
    window.setTimeout(() => void send('roll.reveal', { roll: rollId, shown: n }), t)
    t += GM_NEXT
  }
  window.setTimeout(() => {
    playing.delete(rollId)
    void send('roll.close', { roll: rollId })
  }, t - GM_NEXT + GM_HOLD)
}
