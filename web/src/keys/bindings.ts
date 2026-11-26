// The keyboard: which key does what, for whom, in which state. Pure, so it can be tested; KeyLayer does the rest.
// Keys are read by where they sit (KeyboardEvent.code), so WASD and the digits work on any layout (QWERTZ, Cyrillic).

export type Role = 'player' | 'gm'
export type Tab = 'scene' | 'station' | 'codex' | 'gm'

/** What a key press means. Camera keys aren't here: they're held, and the map reads them every frame. */
export type Action =
  | { a: 'help' }
  | { a: 'esc' }
  | { a: 'tab'; tab: Tab }
  | { a: 'focus' }
  | { a: 'roll' } // player: open the roll screen. GM: start "R, then a stat" on the open NPC card
  | { a: 'stat'; i: number } // 0-5, in sheet order
  | { a: 'entry'; i: number } // 0-3, a skill or chrome on the roll screen
  | { a: 'enter' }
  | { a: 'hold'; h: 'burn' | 'push' } // let go of the key and it stops
  | { a: 'mapPicker' }
  | { a: 'next' }
  | { a: 'god' }
  | { a: 'tv' }
  | { a: 'follow'; i: number }
  | { a: 'sound' } // B: the Sound deck, and the start of a pad's two digits
  | { a: 'soundCat'; i: number }
  | { a: 'soundPlay'; i: number }

export interface Ctx {
  role: Role
  tab: Tab
  /** The roll screen is open on this laptop (players only). */
  dialog: boolean
  /** In the middle of B (and its first digit) or the GM's R. */
  chord: null | 'sound' | 'soundCat' | 'roll'
}

export interface KeyLike {
  code: string
  key: string
  shift: boolean
}

export const PAN: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
}
export const ZOOM: Record<string, number> = { KeyQ: -1, KeyE: 1 }
export const isCameraKey = (code: string) => code in PAN || code in ZOOM

/** Digit1..Digit9 -> 0..8, Digit0 -> 9 (the tenth), anything else -> -1. The number pad counts too. */
export function digit(code: string): number {
  const m = /^(?:Digit|Numpad)(\d)$/.exec(code)
  if (!m) return -1
  const n = Number(m[1])
  return n === 0 ? 9 : n - 1
}

const TABS: Tab[] = ['scene', 'station', 'codex', 'gm']

export function resolve(k: KeyLike, c: Ctx): Action | null {
  if (k.key === '?' || (k.code === 'Slash' && k.shift)) return { a: 'help' }
  if (k.code === 'Escape') return { a: 'esc' }
  const d = digit(k.code)

  // the middle of a chord: the next key belongs to it
  if (c.chord === 'sound') return d >= 0 && !k.shift ? { a: 'soundCat', i: d } : null
  if (c.chord === 'soundCat') return d >= 0 && !k.shift ? { a: 'soundPlay', i: d } : null
  if (c.chord === 'roll') {
    if (d >= 0 && d < 6 && !k.shift) return { a: 'stat', i: d }
    if (k.code === 'KeyG') return { a: 'god' }
    return null
  }

  if (c.role === 'player' && c.dialog) {
    if (d >= 0 && d < 6 && !k.shift) return { a: 'stat', i: d }
    if (d >= 6 && !k.shift) return { a: 'entry', i: d - 6 } // 7, 8, 9, 0
    if (k.code === 'Enter' || k.code === 'NumpadEnter') return { a: 'enter' }
    if (k.code === 'KeyP') return { a: 'hold', h: 'push' }
    if (k.code === 'KeyB') return { a: 'hold', h: 'burn' }
    return null
  }

  if (d >= 0 && d < 5 && k.shift && c.role === 'gm') return { a: 'follow', i: d }
  if (d >= 0 && !k.shift) {
    const tab = TABS[d]
    return tab && (tab !== 'gm' || c.role === 'gm') ? { a: 'tab', tab } : null
  }
  if (k.shift) return null
  switch (k.code) {
    case 'KeyF':
      return { a: 'focus' }
    case 'KeyR':
      return { a: 'roll' }
  }
  if (c.role === 'player') return k.code === 'KeyB' ? { a: 'hold', h: 'burn' } : null
  switch (k.code) {
    case 'KeyM':
      return c.tab === 'scene' ? { a: 'mapPicker' } : null
    case 'KeyN':
      return { a: 'next' }
    case 'KeyG':
      return { a: 'god' }
    case 'KeyT':
      return { a: 'tv' }
    case 'KeyB':
      return { a: 'sound' }
  }
  return null
}

/** What the ? overlay lists. Kept beside `resolve` so the two can't drift apart. */
export const HELP: Record<Role, { title: string; rows: [string, string][] }[]> = {
  player: [
    {
      title: 'Anywhere',
      rows: [
        ['W A S D  ·  arrows', 'Move the map (Shift: faster)'],
        ['Q  ·  E', 'Zoom out, zoom in'],
        ['F', 'Find me on the map'],
        ['1  2  3', 'Scene, Station, Codex'],
        ['R', 'Roll'],
        ['Hold B', 'Burn'],
        ['Esc', 'Close'],
      ],
    },
    {
      title: 'Rolling',
      rows: [
        ['1 – 6', 'Body, Reflex, Tech, Intel, Cool, Empathy'],
        ['7  8  9  0', 'A skill or chrome, in the order shown'],
        ['Enter', 'Roll it, then the next button'],
        ['Hold P', 'Push'],
        ['Esc', 'Back to the map'],
      ],
    },
  ],
  gm: [
    {
      title: 'Anywhere',
      rows: [
        ['W A S D  ·  arrows', 'Move the map (Shift: faster)'],
        ['Q  ·  E', 'Zoom out, zoom in'],
        ['F', 'Frame the crew, or whoever is selected'],
        ['1  2  3  4', 'Scene, Station, Codex, GM'],
        ['M', 'Go somewhere else'],
        ['Esc', 'Close'],
      ],
    },
    {
      title: 'At the table',
      rows: [
        ['R, then 1 – 6', "Roll that stat for the NPC whose card is open"],
        ['G', 'Arm (or disarm) a God roll on that card'],
        ['N', 'Next turn'],
        ['B', 'The Sound deck: music, flares and sounds'],
        ['B, then two digits', 'Play a sound: each one shows its digits'],
        ['T', 'TV: whole crew, or cut to whoever rolls'],
        ['Shift + 1 – 5', 'TV follows that one of the crew'],
      ],
    },
  ],
}
