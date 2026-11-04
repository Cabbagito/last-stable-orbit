import type { CSSProperties } from 'react'

/** Where a hovered row or item is, in the viewport, so the inspector can sit beside the sheet and point at it. */
export interface Anchor {
  key: string
  left: number // just right of the sheet column
  y: number // the hovered thing's middle
  vh: number
}

const CARET = 46 // the caret's middle, from the inspector's top (or bottom) edge
const EDGE = 8

export function anchorOf(key: string, el: HTMLElement): Anchor {
  const r = el.getBoundingClientRect()
  const col = el.closest('.r4-col')?.getBoundingClientRect()
  return { key, left: (col?.right ?? r.right) + 10, y: r.top + r.height / 2, vh: window.innerHeight }
}

/** In the top half it hangs down from the thing; lower down it grows up from it, so it never runs off the screen. */
export function anchorStyle(a: Anchor): { style: CSSProperties; side: 'cl-top' | 'cl-bot' } {
  if (a.y > a.vh * 0.55) return { style: { left: a.left, bottom: Math.max(EDGE, a.vh - a.y - CARET) }, side: 'cl-bot' }
  return { style: { left: a.left, top: Math.max(EDGE, a.y - CARET) }, side: 'cl-top' }
}
