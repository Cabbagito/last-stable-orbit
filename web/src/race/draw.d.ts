// Types for draw.js (the prototype's bot art and race drawing, kept as plain JS so it stays verbatim).
import type { Look, Race } from './sim'

export const PAL: Record<string, string>
export const SPOILERS: string[]
export const STRIPES: string[]
export const WHEELS: string[]
export const TOPPERS: string[]
export const FACES: string[]
export const PAINTS: string[]
export const LIGHTS: string[]
/** The race layer: 800 x 450 pixels, shown at 2x over the map art. */
export const VW: number
export const VH: number
/** Where that layer sits on the Bot bays art (display px / 2). */
export const OX: number
export const OY: number
export function wp(X: number, Y: number): [number, number]
/** The big side view on the prep screen: 160 x 112. rev > 0 shakes it and blows smoke. */
export function drawBig(cv: HTMLCanvasElement, look: Look, color: string, num: string, t: number, rev: number): void
/** cv: the 800 x 450 layer; ui: a 1600 x 900 layer for the names; time: seconds, for the wobble. */
export function drawRace(cv: HTMLCanvasElement, ui: HTMLCanvasElement, r: Race, time: number): void
