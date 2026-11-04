import type { Ack, ServerFrame, Vec3 } from '../types'

export type Status = 'connecting' | 'live' | 'offline'

// crypto.randomUUID only exists on https or localhost; a LAN address over http needs a fallback.
const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

/**
 * One reconnecting WebSocket. The server sends a full view on every (re)connect, so a dropped
 * connection needs no catch-up logic: reconnect and the next frame is the truth.
 */
export class GameSocket {
  private ws: WebSocket | null = null
  private backoff = 500
  private pending = new Map<string, (a: Ack) => void>()
  private lastSeen = 0
  private timer: number | undefined
  private retry: number | undefined
  private stopped = false

  constructor(
    private onFrame: (f: ServerFrame) => void,
    private onStatus: (s: Status) => void,
    private onAuthLost: () => void,
  ) {}

  start() {
    this.stopped = false
    this.open()
    this.timer = window.setInterval(() => this.heartbeat(), 10_000)
    document.addEventListener('visibilitychange', this.wake)
    window.addEventListener('online', this.wake)
  }

  stop() {
    this.stopped = true
    window.clearInterval(this.timer)
    window.clearTimeout(this.retry)
    document.removeEventListener('visibilitychange', this.wake)
    window.removeEventListener('online', this.wake)
    this.ws?.close()
  }

  private wake = () => {
    // a laptop waking from sleep: don't wait out the backoff
    if (document.visibilityState === 'visible' && (!this.ws || this.ws.readyState > WebSocket.OPEN)) {
      window.clearTimeout(this.retry)
      this.backoff = 500
      this.open()
    }
  }

  private heartbeat() {
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    if (Date.now() - this.lastSeen > 30_000) {
      ws.close() // silent for too long: treat as dead and reconnect
      return
    }
    ws.send('{"t":"ping"}')
  }

  private open() {
    if (this.stopped) return
    this.onStatus('connecting')
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/ws`)
    this.ws = ws
    ws.onopen = () => {
      this.backoff = 500
      this.lastSeen = Date.now()
      this.onStatus('live')
    }
    ws.onmessage = (e) => {
      this.lastSeen = Date.now()
      let f: ServerFrame
      try {
        f = JSON.parse(e.data)
      } catch {
        return
      }
      if (f.t === 'ack' && f.id) {
        this.pending.get(f.id)?.(f)
        this.pending.delete(f.id)
      }
      this.onFrame(f)
    }
    ws.onclose = (e) => {
      if (this.ws !== ws) return
      this.ws = null
      for (const [id, resolve] of this.pending) resolve({ id, ok: false, code: 'offline' })
      this.pending.clear()
      if (e.code === 4401) {
        this.onAuthLost()
        return
      }
      this.onStatus('offline')
      if (this.stopped) return
      this.retry = window.setTimeout(() => this.open(), this.backoff)
      this.backoff = Math.min(this.backoff * 2, 8000)
    }
  }

  /** Send an intent; resolves with the server's ack (or offline). */
  send(type: string, args: Record<string, unknown>): Promise<Ack> {
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.resolve({ id: null, ok: false, code: 'offline' })
    const id = uid()
    return new Promise((resolve) => {
      this.pending.set(id, resolve)
      ws.send(JSON.stringify({ t: 'intent', id, type, args }))
    })
  }

  /** A live drag frame: not logged, relayed to whoever can see the token. */
  drag(token: string, at: Vec3) {
    const ws = this.ws
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'intent', type: 'token.drag', args: { token, at } }))
  }
}
