// Types for opening_player.js (it came with the opening's files, and is kept as plain JS so it stays verbatim).

export interface OpeningTimes {
  loopStartedAt: number | null // ms on the shared clock
  filmStartAt: number | null
}

export class OpeningAudio {
  constructor(o: { url?: string; now?: () => number; ctx?: AudioContext | null; volume?: number })
  out: GainNode
  load(): Promise<void>
  unlock(): Promise<void>
  apply(state: OpeningTimes | null): void
  stop(): void
}

export class OpeningScreen {
  constructor(o: { loopVideo: HTMLVideoElement; filmVideo: HTMLVideoElement; now?: () => number; onEnd?: (() => void) | null })
  apply(state: OpeningTimes | null): void
  destroy(): void
}
