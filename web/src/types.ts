// Mirrors server/lso/views.py: project(). Keep the two in step.

export type Vec3 = [number, number, number]
export const STATS = ['body', 'reflex', 'tech', 'intel', 'cool', 'empathy'] as const
export type StatKey = (typeof STATS)[number]

export interface Me {
  seat: string
  role: 'gm' | 'player'
  char: string | null
}

export interface ListEntry {
  name: string
  kind: 'skill' | 'chrome'
  downside: string | null
  icon: string | null
}

export interface CrewMember {
  id: string
  name: string
  short: string
  role: string
  portrait: string
  color: string
  stats: Record<StatKey, number>
  list: ListEntry[]
  hp: number
  entropy: number
}

export interface MoodDef {
  id: string
  label: string
  base: string
  glow: string | null
}

export interface SwitchDef {
  id: string
  label: string
  type: 'bool' | 'level'
  max: number
  moods: string[]
}

export interface OverlayDef {
  id: string
  src: string
  layer: 'patch' | 'gas'
  mood: string
  switch: string
  value: number
}

export interface MapView {
  id: string
  name: string
  subtitle: string
  description: string
  display: [number, number]
  origin: [number, number]
  moods: MoodDef[]
  switches: SwitchDef[]
  overlays: OverlayDef[]
  mood: string
  values: Record<string, number>
}

export interface TokenView {
  id: string
  kind: 'crew' | 'npc'
  ref: string
  map: string
  at: Vec3
  name: string
  role: string
  portrait: string
  color: string
  mood: string
  note: string
  hidden?: boolean // GM only
  gm_note?: string // GM only
}

export interface Item {
  id: string
  name: string
  icon: string
  kind: string
}

export interface InvEntry {
  uid: string
  item: Item
}

export interface RosterNpc {
  id: string
  name: string
  role: string
  portrait: string
  color: string
}

export type RollPhase = 'roll' | 'boom' | 'land' | 'nat1' | 'push'

/** A roll as this viewer may see it. Others get the dice only as they land on the roller's screen. */
export interface RollView {
  id: string
  by: string // the seat that rolled
  char: string | null // crew rolls
  token: string | null // where its callout sits on this viewer's map, if anywhere
  stat: StatKey
  sides: number
  phase: RollPhase
  open: boolean
  pushes: number
  pushed: number
  value?: number // once landed
  count?: number // dice it took
  // the roller and the GM only:
  dice?: number[]
  bonus?: number
  seed?: number
  insult?: string | null
  handle?: string
  entry?: string | null
  shown?: number
  hidden?: boolean
}

export interface View {
  me: Me
  party_map: string
  crew: CrewMember[]
  maps: Record<string, MapView>
  tokens: Record<string, TokenView>
  inventory: Record<string, InvEntry[]>
  rolls: RollView[]
  roster?: RosterNpc[] // GM only
  presets?: { id: string; name: string }[] // GM only
}

export interface Ack {
  id: string | null
  ok: boolean
  code?: string
  error?: string
}

export type ServerFrame =
  | { t: 'view'; v: number; view: View }
  | { t: 'drag'; token: string; at: Vec3; by: string }
  | ({ t: 'ack' } & Ack)
  | { t: 'pong' }
