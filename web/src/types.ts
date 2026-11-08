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
  health: number // the most health they can have
  hp: number
  entropy: number
  burn: BurnDef | null
}

/** One of a Burn's films. Ves has two: in a fight, and just vanishing. */
export interface BurnCut {
  id: string
  label: string
  src?: string // the TV only
  length: number
}

/** A character's signature move: 2 Entropy, no roll, and its film on the TV. Public, like the skills. */
export interface BurnDef {
  name: string
  when: string
  text: string
  icon: string
  color: string
  react: 'roll' | 'hurt' | null // its row pulses after a die lands (Recount) or one of the others is hurt (Not them)
  cuts: BurnCut[]
}

/** A Burn's film playing now. `src` only reaches the screens that play it. */
export interface BurnView {
  char: string
  name: string
  color: string
  at: number
  ends: number
  src?: string // the TV only
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
/** The cameras on a map's walls: each cone as world X, Y points on the floor, shown while `switch` is on. */
export interface CamerasDef {
  switch: string
  color: string
  cones: { mood: string | null; pts: [number, number][] }[]
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
  game?: SlotsCard // something to sit down and play
}

/** How a slot machine's card reads: anyone who can see it knows how full it is, and no more. */
export interface SlotsCard {
  kind: 'slots'
  seats: number
  taken: number
  pull: number // credits a pull
  out: boolean // out of service
}

/** The machine this player is sitting at. Nobody else gets this; what they've lost stays on the server. */
export interface SlotView {
  unit: number
  page: 'play' | 'wait' | 'lucky' | 'flood' | 'out'
  pulls: number
  free: boolean
  payout: number
  reels: number[]
  spin: number // counts pulls: a new number is a new pull to animate
  near: boolean
  line: string
  pull: number
  window: number // seconds of the stand window
  until: number | null // when it closes, on the server's clock
  art: Record<'lit_a' | 'lit_b' | 'dark' | 'crank_up' | 'crank_mid' | 'crank_down' | 'reel' | 'coin', string>
  audit: { paid_back: number[]; window: number } | null // whoever can audit the machines
}

/** The TV only: the flood, while it's on. */
export interface FloodView {
  at: number
  ends: number
  paid: number[]
  art: Record<'lit_a' | 'lit_b' | 'crank_up' | 'coin', string>
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

export type RollPhase = 'roll' | 'boom' | 'seal' | 'land' | 'nat1' | 'push'

/** A roll as this viewer may see it. Others get the dice only as they land on the roller's screen. */
export interface RollView {
  id: string
  by: string // the seat that rolled
  char: string | null // crew rolls
  token: string | null // its token on this viewer's map, if they can see it. No token and a stat: "Someone"
  stat: StatKey | null // null: the GM's "just a die", which has no stat
  sides: number
  phase: RollPhase
  open: boolean
  pushes: number
  pushed: number
  failed: boolean // the GM called it a failure, or it's a natural 1: a skill's downside shows on the TV
  sealed: boolean // this viewer never gets to know how it came out (Hidden, Someone, or God for an NPC they can't see)
  god: boolean // the whole-screen God roll
  started: number // server time, in seconds
  entry?: string | null // the skill or chrome it used
  value?: number // once landed
  count?: number // dice it took
  chain?: number // what the dice before the last one came to, when it exploded
  insult?: string | null // a natural 1, once it has landed
  tag?: string // the GM only: what their own roll shows on their banner (GOD, SECRET, HIDDEN, SOMEONE)
  // the roller and the GM only:
  dice?: number[]
  bonus?: number
  seed?: number
  handle?: string
  shown?: number
  hidden?: boolean
}

export type Camera = 'crew' | 'follow' | 'roller'

/** A film playing now. Times are the server's, in seconds. `src` only reaches the TV. */
export interface FilmView {
  at: number // it starts here
  ends: number
  src?: string
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

export interface JoinQr {
  size: number // modules a side
  path: string // an SVG path
}

/** The join card: only the TV and the GM get it, and only when the server has one. */
export interface JoinView {
  show: boolean // on the TV
  url: string
  url_qr: JoinQr
  fallback: string
  ssid?: string
  password?: string
  wifi_qr?: JoinQr
}

export interface StageView {
  camera: Camera
  follow: string | null
  film: FilmView | null
  burn: BurnView | null
  tv?: boolean // GM only: the TV is connected
  cues?: CueView[] // GM only
  films?: string[] // the TV only: every film, fetched ahead
  flood?: FloodView // the TV only
  join?: JoinView
}

/** Someone in a fight (M8). An NPC's health is sent only here, while it's in a fight. */
export interface Fighter {
  token: string
  kind: 'crew' | 'npc'
  ref: string
  name: string
  portrait: string
  color: string
  hp: number
  health: number
  ini?: number // the Reflex total, shown only while the dice land
  joined?: number // server time (s) this fighter's dice were rolled
}

/**
 * A fight on one map, fighters in turn order. The GM gets every fight, a player the one on their map, the TV every
 * fight.
 */
export interface FightView {
  map: string
  name: string
  fighters: Fighter[]
  round?: number
  now?: string | null // whose turn: a token id (null when that token is hidden from this viewer)
  rolled?: string[] // the order the GM picked them in, which the strip shows while the dice land
  started?: number // server time (s)
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
  codex: CodexView | null
  station: StationView | null
  fights: FightView[]
  roster?: RosterNpc[] // GM only
  presets?: { id: string; name: string }[] // GM only
  items?: Item[] // GM only: the catalogue, for giving
  overview: OverviewView | null // the overview open on this player's screen; never anyone else's
  slots: SlotView | null // the slot machine this player is sitting at
  overviews?: { games: { id: string; name: string }[]; open: Record<string, { kind: string; id: string }> } // GM only
}

/** A survey answer, or the device's page. Scores in bad points; more than `limit` gets you sent in. */
export interface SurveyOption {
  id: string
  label: string
  points: number
  sends: boolean // this answer alone sends you in
}

export interface SurveyQuestion {
  id: string
  kind: 'stars' | 'one' | 'many' | 'text'
  text: string
  header: string
  hint: string
  options: SurveyOption[]
  stars_points: number[] // one star .. five stars
  flag: string[] // text: words that cost `points`; "wait*" matches any ending
  points: number
}

export interface SurveyEnding {
  title: string[]
  line: string
  text: string
  status: string
  button: string
  toast: string
}

export interface Survey {
  intro: { header: string; title: string[]; stat: string; value: string; text: string; begin: string; decline: string }
  questions: SurveyQuestion[]
  limit: number
  busy: string
  busy_text: string
  fine: SurveyEnding
  sent: SurveyEnding
  later: SurveyEnding | null
}

/** Mini-golf's switches. The game plays out on the player's screen. */
export interface GolfGreen {
  header: string
  well: 'off' | 'gentle' | 'strong' // how hard the green pulls toward the cup
  sweeper: boolean
  turnstile: boolean
  curve: boolean
}

interface OverviewBase {
  id: string // this sending
  kind: string
  name: string
  mask: string | null
  tint: 'amber' | 'violet' | 'paper'
  burns: boolean
}

/** A survey on a device over the map, with a live screen in its face. */
export interface SurveyOverview extends OverviewBase {
  device: string
  screen: [number, number, number, number] // left, top, width, height in the device's 900 x 900 box
  survey: Survey
  golf: null
}

export interface GolfOverview extends OverviewBase {
  device: null
  screen: null
  survey: null
  golf: GolfGreen
}

/** An overview the GM sent to this player. */
export type OverviewView = SurveyOverview | GolfOverview

export type CodexSec = 'chars' | 'items' | 'world' | 'lore' | 'rules'

/** How a picture sits on its card and page, as the Codex boards place it. */
export interface CodexArt {
  src: string
  kind: 'bust' | 'icon' | 'crop'
  px: number // the source's width
  cx: number // the x to centre on
  y0: number // the source y at the card's top
  my: number // See also's top
  k: number // the card's zoom
  km: number // See also's zoom
  pos: string // the page's object-position
  z: number // the page's zoom
}

export interface CodexTile {
  src: string
  l: number
  t: number
  w: number
}

export interface CodexSectionView {
  id: CodexSec
  name: string
  short: string
  tiles: CodexTile[]
  strip: CodexTile[]
  count: number
  new: number
}

export interface CodexEntryView {
  id: string
  sec: CodexSec
  name: string
  role: string
  label: string
  sub: string
  art: CodexArt
  lead: string
  quote: string
  blocks: { id: string; h: string; text: string; new?: boolean; locked?: boolean; unlocked?: boolean }[]
  rows_label: string
  rows: { icon: string | null; n: string; d: string }[]
  facts: [string, string][]
  shots_label: string
  shots: { src: string; cap: string; pos: string }[]
  see: { id: string; name: string; art: CodexArt }[]
  crew: {
    id: string
    stats: Record<StatKey, number>
    health: number
    color: string
    skills: { icon: string | null; name: string; text: string; downside: string | null }[]
    burn: { name: string; when: string; text: string; icon: string } | null
  } | null
  npc: { mood: string } | null
  new?: boolean // players: not read yet
  unlocked?: boolean // GM only
}

/** The Codex as this viewer may read it: players get only unlocked entries and blocks. The TV gets none. */
export interface CodexView {
  sections: CodexSectionView[]
  entries: CodexEntryView[]
}

/** One place on the Station's cross-section. A dark one (`lit` false) has no overlay or preview for players. */
export interface StationPlaceView {
  id: string // its map
  name: string
  where: string
  blurb: string
  tags: { x: number; y: number; text: string }[]
  chip: [number, number]
  hots: [number, number, number, number][]
  lit: boolean
  overlay: string | null
  preview: string | null
}

export interface StationView {
  art: string
  hole: string
  labels: { x: number; y: number; text: string }[]
  places: StationPlaceView[]
  crew: { char: string; map: string; hidden?: boolean }[]
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
