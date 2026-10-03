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
  | { if: Cond; then: Effect[]; else?: Effect[] };

export interface ResourceDef {
  id: string;
  name: string;
  /** Base storage cap; undefined = unlimited. */
  cap?: number;
  capBonus?: Array<{ if: Cond; add: number }>;
  /** Hidden counters are never shown to players (reservoirs, internal stock). */
  hidden?: boolean;
  kind?: 'res' | 'tool';
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

export type SceneNode = TextNode | ChoiceNode | CombatNode;

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

export interface StoveDef {
  /** Burn time of one log, ms. */
  perWood: number;
  maxWood: number;
  coldPenalty: number;
  low: number;
}

export interface Content {
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
