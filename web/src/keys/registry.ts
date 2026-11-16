import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import type { StatKey } from '../types'

// The parts of the screen that can act on a key register a handler while they're on screen: the map, the roll
// screen, the soundboard, the open NPC card. KeyLayer decides what a key means; whoever holds that name does it.
// A handler returns false when it can't act right now (a film is on, no TV), and the key then does nothing.

type Handler = (arg: number) => boolean | void

const handlers = new Map<string, { fn: Handler; owner: symbol }>()

export function fire(name: string, arg = 0): boolean {
  const h = handlers.get(name)
  if (!h) return false
  return h.fn(arg) !== false
}

/** Hold `name` while mounted (and `on`). The newest component to claim a name holds it until it lets go. */
export function useKeyHandler(name: string, fn: Handler, on = true) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    if (!on) return
    const owner = Symbol(name)
    handlers.set(name, { fn: (a) => ref.current(a), owner })
    return () => {
      if (handlers.get(name)?.owner === owner) handlers.delete(name)
    }
  }, [name, on])
}

/** Keys held down right now, by KeyboardEvent.code. The map reads them every frame to pan and zoom. */
export const held = new Set<string>()

interface KeyState {
  /** B (then its first digit), or the GM's R: the next key belongs to it. */
  chord: null | 'sound' | 'soundCat' | 'roll'
  /** The soundboard category the first digit picked (its index). */
  soundCat: number | null
  help: boolean
  /** The stat this player last rolled: R opens the roll screen on it. */
  lastStat: StatKey | null
}

export const useKeys = create<KeyState>(() => ({ chord: null, soundCat: null, help: false, lastStat: null }))

export const endChord = () => useKeys.setState({ chord: null, soundCat: null })

/** "1 0" for the tenth: what you press. */
export const digitLabel = (i: number) => String((i + 1) % 10)
