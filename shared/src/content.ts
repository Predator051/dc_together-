// Content model: everything the engine executes is described by these types.
// Content modules (content/actN) export plain data that satisfies them.

export type Role = 'hunter' | 'maker';
export type Gender = 'm' | 'f';
export type PlayerId = 'p1' | 'p2';
export const PLAYER_IDS: readonly PlayerId[] = ['p1', 'p2'];

/** Condition evaluated against the world (and, where relevant, a viewing/acting player). */
export type Cond =
  | { flag: string; gte?: number; lt?: number }
  | { noFlag: string }
  | { pflag: string }
  | { noPflag: string }
  | { partnerPflag: string }
  | { res: string; gte?: number; lt?: number }
  | { day: number }
  | { role: Role }
  | { clue: string }
  | { anyClue: string }
  | { partnerJoined: boolean }
  | { partnerOnline: boolean }
  | { stove: 'warm' | 'cold' | 'never' }
  | { rel: string; gte?: number; lt?: number }
  /** Viewer / partner is in this area. */
  | { at: string }
  | { partnerAt: string }
  | { all: Cond[] }
  | { any: Cond[] }
  | { not: Cond };

/** A text, optionally with conditional variants (first matching variant wins). */
export type TextVariant = { if?: Cond; text: string };
export type Text = string | TextVariant[];
/**
 * Paragraphs. A string is one paragraph. An array of only variant objects is ONE paragraph with
 * variants (first match). Any other array is a list of paragraphs, where a string is a plain
 * paragraph, a variant object is a conditional paragraph and a nested array is a variant group.
 */
export type Para = string | TextVariant | TextVariant[];
export type Paras = string | Para[];

/**
 * Log text field: a Text, or a random pool — an array with plain strings (and optionally
 * conditional variants) from which one eligible line is picked at random.
 */
export type LogLine = Text | Array<string | TextVariant>;

/**
 * Log line. `self` is shown to the actor (2nd person), `other` to the partner (3rd person,
 * `{name}` and `{a|b}` refer to the actor). `all` is shown to everyone with the viewer as subject.
 */
export interface LogText {
  self?: LogLine;
  other?: LogLine;
  all?: LogLine;
  kind?: LogKind;
}
export type LogKind = 'story' | 'act' | 'find' | 'warn' | 'system';

export type EffectTarget = 'actor' | 'both' | Role;

export type Effect =
  | { set: string; value?: number }
  | { unset: string }
  | { inc: string; by?: number }
  | { pset: string; who?: EffectTarget; value?: number }
  | { add: Record<string, number> }
  | { take: Record<string, number> }
  | { clue: string }
  | { log: LogText }
  | { mystery: string; level: number }
  | { rel: string; by: number }
  | { meet: string }
  | { scene: string }
  | { advanceDay: true }
  | { heal: number | 'full' }
  | { stove: number }
  | { actDone: number }
  | { startAct: number }
  /** Move players to another area (travel). */
  | { moveTo: string; who?: EffectTarget }
  | { if: Cond; then: Effect[]; else?: Effect[] };

export interface ResourceDef {
  id: string;
  name: string;
  /** Base storage cap; undefined = unlimited. */
  cap?: number;
  capBonus?: Array<{ if: Cond; add: number }>;
  /** Hidden counters are never shown to players (reservoirs, internal stock). */
  hidden?: boolean;
  kind?: 'res' | 'tool' | 'people';
  desc?: Text;
  order: number;
}

export interface ChanceDef {
  p: number;
  add?: Record<string, number>;
  effects?: Effect[];
  log?: LogText;
  if?: Cond;
}

/** One-time vignette shown instead of the usual log the next time the action is done. */
export interface BeatDef {
  log: LogText;
  effects?: Effect[];
  if?: Cond;
}

export interface ActionDef {
  id: string;
  label: Text;
  /** Location / group id where the button lives. */
  group: string;
  role?: Role;
  /** Can be done only once in the whole world. */
  once?: boolean;
  /** Can be done once by each player. */
  oncePerPlayer?: boolean;
  visible?: Cond;
  enabled?: Cond;
  disabledHint?: Text;
  cost?: Record<string, number>;
  yield?: Record<string, number | [number, number]>;
  /** Repeat yield/chance rolls once per unit of this resource (e.g. placed snares). */
  rollsPer?: string;
  chance?: ChanceDef[];
  effects?: Effect[];
  /** How long the player is busy (all routine actions locked), ms. */
  cooldown: number;
  /** Extra per-action recharge before this action can be repeated, ms. */
  recharge?: number;
  /** Partner-visible status while busy: 3rd person, `{a|b}` = actor gender. */
  busy?: Text;
  log?: LogText | LogText[];
  /** Vignettes, each shown once (in order, skipping ones whose condition fails). */
  beats?: BeatDef[];
  /** Extra "what you get" line for results the engine cannot describe (unlocks, upgrades). */
  gives?: Text;
  hint?: Text;
  kind?: 'gather' | 'craft' | 'build' | 'home';
}

/** A together action that starts a scene picked from a pool (e.g. supper). */
export interface PoolActionDef {
  id: string;
  label: Text;
  group: string;
  pool: string;
  visible?: Cond;
  enabled?: Cond;
  disabledHint?: Text;
  cost?: Record<string, number>;
  gives?: Text;
  hint?: Text;
}

export interface LocationDef {
  id: string;
  name: string;
  desc: Text;
  visible: Cond;
  order: number;
  base?: boolean;
  /** Area the location belongs to (default: the first area). Players see only their area. */
  area?: string;
  /** A shared piece of work shown as a bar: the flag counts up to max. */
  progress?: { flag: string; max: number; label: string };
}

/** A place players can be in. `where` is the locative form for texts ("у Ясенці"). */
export interface AreaDef {
  id: string;
  name: string;
  where: string;
}

export interface OptionDef {
  id: string;
  label: Text;
  visible?: Cond;
  /** Shown but not selectable while this fails. */
  enabled?: Cond;
  disabledHint?: Text;
  /** Only this role may pick it (others see it greyed out). */
  role?: Role;
  next?: string | null;
  effects?: Effect[];
  /** For `any` hubs: option disappears once picked. */
  once?: boolean;
}

interface NodeBase {
  /** Shared narrative. */
  text?: Paras;
  /** Personal narrative, only the player with this role receives it. */
  hunter?: Paras;
  maker?: Paras;
  effects?: Effect[];
}

export interface TextNode extends NodeBase {
  type?: 'text';
  /** null/undefined = scene ends after this node. */
  next?: string | null;
  goto?: Array<{ if: Cond; next: string | null }>;
  button?: Text;
  /** Ending here does not mark the scene as done (it can be replayed). */
  incomplete?: boolean;
}

export interface ChoiceNode extends NodeBase {
  type: 'choice';
  /**
   * joint: both pick, equal picks follow the option, different picks go to `mismatch`.
   * each: both pick for themselves; afterwards go to `next`.
   * any: the first pick decides (question hubs).
   */
  mode: 'joint' | 'each' | 'any';
  options: OptionDef[];
  mismatch?: string;
  next?: string | null;
}

export interface CombatNode extends NodeBase {
  type: 'combat';
  enc: string;
  win: string;
  lose: string;
}

/**
 * Exploring a map underground, both players together, with a limited light. Each step costs light;
 * the party moves when both pick the same way. Each role notices different things about the ways
 * (the hunter feels the air, the maker reads the stone). Rooms remember being found, and one-time
 * finds stay found, so a failed descent still teaches the map.
 */
export interface DelveNode extends NodeBase {
  type: 'delve';
  map: string;
  light: number;
  /** Extra light while a condition holds (a better lamp…). */
  bonus?: Array<{ if: Cond; light: number }>;
  /** Start somewhere else once something has been reached (first match). */
  starts?: Array<{ if: Cond; room: string }>;
  /** Walking out of the start room. */
  out: string | null;
  /** The light gives out. */
  dark: string | null;
}

/**
 * Slipping past watchers: a path of tiles, a rhythm of looks. Only the hunter sees when the
 * watchers look; only the maker sees which stones are loose. Each turn both pick: step, creep
 * (silent but slow) or freeze. Moving while watched, or stepping on loose stones, raises the alarm.
 */
export interface StealthNode extends NodeBase {
  type: 'stealth';
  /** Tiles to cross; true = loose stones. */
  path: boolean[];
  /** The watchers' heads, turn after turn (repeats); true = looking this way. */
  watch: boolean[];
  /** Caught when the alarm reaches this. */
  alarm: number;
  /** Extra slack while a condition holds. */
  bonus?: Array<{ if: Cond; alarm?: number; time?: number }>;
  /** Time before the earplugs give out (a creep takes two). */
  time: number;
  /** What each role perceives: the watchers' heads, the stones underfoot. */
  sees: { watching: Text; away: Text; loose: Text; firm: Text };
  win: string;
  lose: string;
}

export type SceneNode = TextNode | ChoiceNode | CombatNode | DelveNode | StealthNode;

export interface DelveExitDef {
  to: string;
  label: Text;
  visible?: Cond;
  enabled?: Cond;
  disabledHint?: Text;
  /** Light it takes (default 1). */
  light?: number;
  /** What each role notices about this way. */
  hunter?: Text;
  maker?: Text;
  /** The hunter feels air moving this way. */
  draft?: boolean;
  /** Bad stone: on a roll, it costs extra light or strength. The maker sees it coming. */
  risk?: { p: number; light?: number; hp?: number; log: LogText };
}

export interface DelveActDef {
  id: string;
  label: Text;
  role?: Role;
  visible?: Cond;
  enabled?: Cond;
  disabledHint?: Text;
  /** Once in the whole world (default true). */
  once?: boolean;
  /** Light it takes; negative gives light. */
  light?: number;
  cost?: Record<string, number>;
  effects?: Effect[];
  log: LogText;
  /** What it gives, for the label (else derived from effects). */
  gives?: Text;
}

export interface DelveRoomDef {
  name: string;
  /** Grid position for the map drawing. */
  pos: [number, number];
  text: Paras;
  hunter?: Paras;
  maker?: Paras;
  /** Effects the first time anyone enters. */
  first?: Effect[];
  exits: DelveExitDef[];
  acts?: DelveActDef[];
  /** Entering leaves the map for a scene node (first match); the map resumes when it comes back. */
  enter?: Array<{ if?: Cond; next: string }>;
}

export interface DelveMapDef {
  id: string;
  name: string;
  start: string;
  rooms: Record<string, DelveRoomDef>;
}

export interface SceneDef {
  id: string;
  title: string;
  /** Where the proposal button is shown (absent = can only be started by effects/pools). */
  group?: string;
  label?: Text;
  visible?: Cond;
  enabled?: Cond;
  disabledHint?: Text;
  cost?: Record<string, number>;
  /** What the scene gives; without it the button shows "+?". */
  gives?: Text;
  /** Default true: once completed it disappears. */
  once?: boolean;
  /** Completing this scene marks the location as explored. */
  explores?: string;
  pool?: string;
  priority?: number;
  start: string;
  nodes: Record<string, SceneNode>;
  onEnd?: Effect[];
  summary?: LogText;
}

export interface CombatOptionDef {
  id: string;
  label: Text;
  role?: Role;
  visible?: Cond;
  cost?: Record<string, number>;
  dmg?: [number, number];
  fear?: number;
  hit?: number;
  defend?: boolean;
  taunt?: boolean;
  heal?: number;
  /** Narrative of the move: self/other perspectives. */
  log: LogText;
  miss?: LogText;
}

export interface EncounterDef {
  id: string;
  name: string;
  enemy: { name: string; hp: number; fear: number; dmg: [number, number] };
  options: CombatOptionDef[];
  /** Option available to a downed player. */
  downOption: CombatOptionDef;
  ally?: { if: Cond; fear?: number; dmg?: [number, number]; log: LogText };
  armor?: { if: Cond; value: number };
  enemyLog: LogText;
  enemyMissLog?: LogText;
  /** The fight is lost if it drags on this long (default 15 rounds). */
  maxRounds?: number;
  /** Names of the two bars when they mean something else (e.g. a book catching fire). */
  bars?: { hp?: string; fear?: string };
}

export interface ClueDef {
  id: string;
  title: string;
  text: Text;
  to: 'both' | Role;
  mystery?: string;
}

export interface MysteryDef {
  id: string;
  question: string;
  order: number;
}

export interface GoalDef {
  id: string;
  text: Text;
  /** The current goal is the first one in the list whose condition holds. */
  when?: Cond;
}

export interface NpcDef {
  id: string;
  name: Text;
  desc: Text;
}

/**
 * Daily change: add `add` (× the amount of resource `per`, if given) to a resource or a flag.
 * Flags never go below `min` (default 0).
 */
export interface DailyDef {
  res?: string;
  flag?: string;
  add: number;
  per?: string;
  min?: number;
  if?: Cond;
}

export interface StoveDef {
  /** Burn time of one log, ms. */
  perWood: number;
  maxWood: number;
  coldPenalty: number;
  low: number;
}

/** Backdrop of the place a player is in. */
export type AmbientKind = 'cellar' | 'candle' | 'snow' | 'river' | 'cave';
/** What an action looks and sounds like while it runs (each kind has its own sound). */
export type FxKind =
  | 'fire' // stoking a fire
  | 'flint' // striking a light
  | 'forge' // hammer on hot iron
  | 'whet' // whetstone on a blade
  | 'chop' // axe into wood
  | 'water' // bucket, water drawn
  | 'fish' // line cast, fish trap
  | 'row' // oars, crossing water
  | 'steam' // pot on the fire
  | 'walk' // steps
  | 'twigs' // steps and snapping dry wood
  | 'snare' // steps and a creaking noose
  | 'send' // several people walking off
  | 'arrow' // bowstring and arrow
  | 'string' // fitting a bowstring
  | 'carve' // knife whittling
  | 'rope' // twisting fibre
  | 'build' // hammering wood
  | 'rubble' // stones and earth
  | 'scrap' // scrap iron
  | 'sift' // flour
  | 'rummage' // searching chests and sacks
  | 'bowl' // feeding an animal
  | 'salt' // knife, board and salt
  | 'wax' // kneading wax
  | 'hive' // a hive in winter
  | 'trade' // sacks changing hands
  | 'care' // pouring a drink, a spoon
  | 'breath' // slow breathing
  | 'heart'; // a heartbeat

/** Purely visual ambience: never affects rules. */
export interface AmbientDef {
  /** Backdrop per area id. */
  areas: Record<string, AmbientKind>;
  /** Checked in order before `areas` (e.g. the prologue cellar). */
  overrides?: Array<{ when: Cond; kind: AmbientKind }>;
  /** A fire burns in this area (besides the home stove) while the condition holds. */
  fires?: Record<string, Cond>;
  /** Action id → accent shown while it runs. */
  actions: Record<string, FxKind>;
}

export interface Content {
  areas: AreaDef[];
  resources: ResourceDef[];
  actions: ActionDef[];
  pools: PoolActionDef[];
  locations: LocationDef[];
  scenes: SceneDef[];
  encounters: EncounterDef[];
  clues: ClueDef[];
  mysteries: MysteryDef[];
  goals: GoalDef[];
  npcs: NpcDef[];
  stove: StoveDef;
  ambient?: AmbientDef;
  maps?: DelveMapDef[];
  /** Applied every time a new day starts (after a supper). */
  daily?: DailyDef[];
  start: {
    resources: Record<string, number>;
    hp: number;
  };
  /** Flag prefixes / names that mark story progress (solo play must never change them). */
  storyFlags: string[];
  actEnd: Record<number, string>;
  roleTitles: Record<Role, { m: string; f: string }>;
  ui: Record<string, string>;
}
