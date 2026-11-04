import { create } from 'zustand'
import { GameSocket, type Status } from '../net/socket'
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
      if (get().resumeCheck && !dialog) {
        const mine = f.view.rolls.find((r) => r.by === f.view.me.seat && r.open && !get().dismissed[r.id])
        if (mine) dialog = { kind: 'roll', rollId: mine.id, resume: true }
      }
      set({ view: f.view, remote, selected: sel && f.view.tokens[sel] ? sel : null, calls: memo, dialog, resumeCheck: false })
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
    connect: () => {
      if (get().socket) return
      const socket = new GameSocket(
        onFrame,
        (status) => set(status === 'live' ? { status, resumeCheck: true } : { status }),
        () => set({ authLost: true }),
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
    openPick: (stat, entry = -1) => set({ dialog: { kind: 'pick', stat, entry } }),
    openRoll: (rollId, resume = false) => set({ dialog: { kind: 'roll', rollId, resume } }),
    closeDialog: () => {
      const d = get().dialog
      set({ dialog: null, dismissed: d?.kind === 'roll' ? { ...get().dismissed, [d.rollId]: true } : get().dismissed })
    },
  }
})

export const send = (type: string, args: Record<string, unknown>): Promise<Ack> =>
  useGame.getState().socket?.send(type, args) ?? Promise.resolve({ id: null, ok: false, code: 'offline' })
