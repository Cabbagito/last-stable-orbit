// Mirrors server/lso/views.py: project(). Keep the two in step.

export type Vec3 = [number, number, number]
export const STATS = ['body', 'reflex', 'tech', 'intel', 'cool', 'empathy'] as const
export type StatKey = (typeof STATS)[number]

export interface Me {
  seat: string
  role: 'gm' | 'player' | 'stage' // stage: the TV at the table
  char: string | null
}

export interface ListEntry {
  name: string
  kind: 'skill' | 'chrome'
  downside: string | null
  icon: string | null
  text: string // the tooltip: what it is or does
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

export type Hum = 'bar' | 'street' | 'none' | 'beat'

export interface MoodDef {
  id: string
  label: string
  base: string
  glow: string | null
  hum: Hum // how this mood's glow flickers
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

/** A small piece of art set into the map (the black hole moving in the Promenade's window), placed as its board places it. */
export interface DecalDef {
  id: string
  src: string
  box: [number, number]
  matrix: [number, number, number, number, number, number]
  img: [number, number, number, number]
  filter: string | null
  moods: string[]
  opacity: Record<string, number> // when set, its opacity in each mood (missing: hidden)
  over: boolean // drawn over the glow
  blend: string | null
  clip: string | null
  pixelated: boolean
  fade: number // seconds
}

/** The Terminal room's wall screen: two clocks and the station's events, driven by two level switches. */
export interface FeedDef {
  box: [number, number]
  matrix: [number, number, number, number, number, number]
  title: string
  minutes: string
  factor: number
  events: string
  lines: string[]
}

/** One deck of a tower map: its floor height, and where its camera button looks. */
export interface FloorDef {
  label: string
  z: number
  centre: [number, number]
}

/** The cameras on a map's walls: each cone as world X, Y points on the floor, shown while `switch` is on. */
export interface CamerasDef {
  switch: string
  color: string
  cones: { mood: string | null; z: number; pts: [number, number][] }[]
}

/** A labelled point from the map's Key board ("what's where"). GM only. */
export interface PinDef {
  k: string
  label: string
  at: Vec3
}

export interface MapView {
  id: string
  name: string
  subtitle: string
  description: string
  display: [number, number]
  origin: [number, number]
  hum: Hum
  order: number // where it comes in the GM's lists: the order the story reaches it
  moods: MoodDef[]
  switches: SwitchDef[]
  overlays: OverlayDef[]
  decals: DecalDef[]
  cameras: CamerasDef | null
  feed: FeedDef | null
  floors: FloorDef[]
  mood: string
  values: Record<string, number>
  objects: MapObject[]
  pins?: PinDef[] // GM only
  arrive?: boolean // GM only: the crew can be sent here
}

/** Something in the world to inspect. Players get only what the GM has revealed. */
export interface MapObject {
  id: string
  name: string
  at: Vec3
  text: string
  closeup: [number, number] | null // centre of the card's close-up, in display px
  codex: string | null
  seen?: boolean // players: they've looked at it
  shown?: boolean // GM only: players can see it
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
  codex: string | null
  size?: number // NPCs: the spider mech is a double-size token
  hidden?: boolean // GM only
  gm_note?: string // GM only
  stats?: Record<StatKey, number> // GM only, NPCs: the die for each stat
}

export interface Item {
  id: string
  name: string
  icon: string
  kind: 'gear' | 'weapon' | 'tool' | 'cash' | 'key' | 'note' | 'audio'
  text: string // the tooltip; only its holder and the GM get it
  counted: boolean // credits: one entry holding an amount
  codex: string | null
}

export interface InvEntry {
  uid: string
  item: Item
  count: number | null // counted items only
  new: boolean // handed over and not yet looked at by its holder
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
  stat: StatKey | null // null: the GM's "just a die", which has no stat
  sides: number
  phase: RollPhase
  open: boolean
  pushes: number
  pushed: number
  value?: number // once landed
  count?: number // dice it took
  // the roller, the GM and the TV only:
  dice?: number[]
  bonus?: number
  seed?: number
  insult?: string | null
  handle?: string
  entry?: string | null
  shown?: number
  hidden?: boolean
}

export type Setup = 'tv' | 'notv' | 'online'
export type Camera = 'crew' | 'follow' | 'roller'

/** A film playing now. Times are the server's, in seconds. `src` only reaches screens that play it. */
export interface FilmView {
  at: number // it starts here, on every screen that plays it
  ends: number
  src?: string
  sound?: boolean
  cue?: string // GM only
  name?: string // GM only
}

export interface CueView {
  id: string
  name: string
  sub: string
  ends: string
  still: string | null
  length: number | null
  ready: boolean // its film is made
  played: boolean
}

export interface StageView {
  setup: Setup
  camera: Camera
  follow: string | null
  film: FilmView | null
  tv?: boolean // GM only: the TV is connected
  cues?: CueView[] // GM only
  films?: string[] // the TV only: every film, fetched ahead
}

export interface View {
  me: Me
  party_map: string
  crew: CrewMember[]
  maps: Record<string, MapView>
  tokens: Record<string, TokenView>
  inventory: Record<string, InvEntry[]>
  rolls: RollView[]
  stage: StageView
  roster?: RosterNpc[] // GM only
  presets?: { id: string; name: string }[] // GM only
  items?: Item[] // GM only: the catalogue, for giving
}

export interface Ack {
  id: string | null
  ok: boolean
  code?: string
  error?: string
}

export type ServerFrame =
  | { t: 'view'; v: number; now?: number; view: View }
  | { t: 'drag'; token: string; at: Vec3; by: string }
  | ({ t: 'ack' } & Ack)
  | { t: 'pong'; now?: number }
