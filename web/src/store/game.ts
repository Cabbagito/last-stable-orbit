import { create } from 'zustand'
import { GameSocket, type Status } from '../net/socket'
import type { Ack, ServerFrame, Vec3, View } from '../types'

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
  connect: () => void
  disconnect: () => void
  select: (id: string | null) => void
  setLocal: (l: { token: string; at: Vec3 } | null) => void
  setGmMap: (m: string) => void
}

const DRAG_TTL = 1500 // a relayed drag with no follow-up expires, so a dropped dragger can't freeze a token

export const useGame = create<GameStore>((set, get) => {
  const onFrame = (f: ServerFrame) => {
    if (f.t === 'view') {
      const now = Date.now()
      const remote = Object.fromEntries(Object.entries(get().remote).filter(([, r]) => now - r.t < 100))
      const sel = get().selected
      set({ view: f.view, remote, selected: sel && f.view.tokens[sel] ? sel : null })
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
    connect: () => {
      if (get().socket) return
      const socket = new GameSocket(
        onFrame,
        (status) => set({ status }),
        () => set({ authLost: true }),
      )
      set({ socket })
      socket.start()
    },
    disconnect: () => {
      get().socket?.stop()
      set({ socket: null, view: null })
    },
    select: (selected) => set({ selected }),
    setLocal: (local) => set({ local }),
    setGmMap: (gmMap) => set({ gmMap }),
  }
})

export const send = (type: string, args: Record<string, unknown>): Promise<Ack> =>
  useGame.getState().socket?.send(type, args) ?? Promise.resolve({ id: null, ok: false, code: 'offline' })
