import type { AmbientKind, FxKind, Gender, PlayerId, Role, LogKind } from './content.js';

// ---------- Client -> server ----------

export type Command =
  | { c: 'act'; id: string }
  | { c: 'accept' }
  | { c: 'decline' }
  | { c: 'cancel' }
  | { c: 'next' }
  | { c: 'choose'; id: string }
  /** Close a one-time panel: the return summary or the end-of-act summary. */
  | { c: 'ack'; what: 'welcome' | 'summary' }
  /** A hand sign to the partner during a scene. */
  | { c: 'sign'; id: string };

export type ClientMsg =
  | { t: 'hello'; token: string }
  | { t: 'lobby'; code: string }
  | { t: 'join'; code: string; name: string; gender: Gender; role: Role }
  | { t: 'claim'; code: string; pid: PlayerId }
  | { t: 'cmd'; cmd: Command; seq?: number }
  | { t: 'sync' }
  | { t: 'ping' };

// ---------- Server -> client ----------

export interface LobbySlot {
  pid: PlayerId;
  joined: boolean;
  name?: string;
  role?: Role;
  roleTitle?: string;
}

export type ServerMsg =
  | { t: 'lobby'; slots: LobbySlot[]; freeRoles: Role[] }
  | { t: 'welcome'; token: string; pid: PlayerId }
  | { t: 'view'; v: PlayerView; rev: number }
  | { t: 'err'; code: ErrCode; text: string }
  | { t: 'ack'; seq?: number; ok: boolean; text?: string; rev: number }
  | { t: 'pong' }
  /** What changed in the shared stock after someone's command (shown as a popup to both). */
  | { t: 'delta'; by: PlayerId; together: boolean; items: DeltaItem[] };

export interface DeltaItem {
  id: string;
  name: string;
  n: number;
}

export type ErrCode = 'bad_code' | 'bad_token' | 'slots_full' | 'role_taken' | 'bad_input' | 'rate_limited' | 'not_authed';

export interface CostView {
  name: string;
  n: number;
  have: number;
  ok: boolean;
  id: string;
  /** Internal stock (cellar, scrap pile): show how much is left, not a price. */
  stock?: boolean;
}

/** What a button gives. `unsure` = depends on luck or is unknown ("+?"). */
export interface GainView {
  text: string;
  unsure?: boolean;
}

export interface EntryView {
  id: string;
  kind: 'act' | 'scene' | 'pool';
  label: string;
  enabled: boolean;
  hint?: string;
  reason?: string;
  cost?: CostView[];
  gain?: GainView[];
  /** Server time (ms) when this player's cooldown ends. */
  readyAt?: number;
  cooldown?: number;
  together?: boolean;
  fresh?: boolean;
}

export interface GroupView {
  id: string;
  name: string;
  desc: string;
  base: boolean;
  entries: EntryView[];
  /** A shared piece of work in progress. */
  progress?: { label: string; n: number; max: number };
  /** What only the partner's role can do here (read-only, so the two can plan together). */
  partner?: MateEntryView[];
}

export interface MateEntryView {
  id: string;
  label: string;
  /** The partner could do it right now. */
  ready: boolean;
  reason?: string;
  cost?: CostView[];
  gain?: GainView[];
}

export interface PartnerView {
  pid: PlayerId;
  joined: boolean;
  name: string;
  gender: Gender;
  role: Role | null;
  roleTitle: string;
  online: boolean;
  area: string;
  where: string;
  busy: { text: string; from: number; until: number } | null;
  hp: number;
  hpMax: number;
}

export interface MeView {
  pid: PlayerId;
  area: string;
  where: string;
  name: string;
  gender: Gender;
  role: Role;
  roleTitle: string;
  hp: number;
  hpMax: number;
}

export interface OptionView {
  id: string;
  label: string;
  enabled: boolean;
  reason?: string;
}

export interface SceneBlock {
  /** Shared paragraphs. */
  text: string[];
  /** Personal paragraphs, seen by this player only. */
  own: string[];
  /** What was decided at this step, if anything. */
  picks?: string;
  combat?: string[];
}

export interface SceneView {
  id: string;
  title: string;
  /** Sound and light of the scene: by the fire, a fight, or the story itself. */
  mood: 'hearth' | 'fight' | 'story' | 'deep';
  paused: boolean;
  pausedText?: string;
  blocks: SceneBlock[];
  kind: 'text' | 'choice' | 'combat' | 'delve' | 'stealth';
  mode?: 'joint' | 'each' | 'any';
  button?: string;
  options?: OptionView[];
  myPick?: string;
  partnerPicked: boolean;
  waiting: boolean;
  waitingText?: string;
  combat?: {
    enemy: string;
    hp: number;
    hpMax: number;
    fear: number;
    fearMax: number;
    round: number;
    lastRound: string[];
    /** Bar names when they mean something else than strength and fear. */
    hpLabel?: string;
    fearLabel?: string;
  };
  delve?: DelveView;
  stealth?: StealthView;
  /** Hand signs: mine and the partner's latest. */
  signs?: { mine?: string; partner?: string; fresh: boolean };
}

export interface DelveRoomView {
  id: string;
  name: string;
  x: number;
  y: number;
  here: boolean;
  /** Not been there yet: only seen as a way leading somewhere. */
  unknown: boolean;
}

export interface DelveView {
  map: string;
  room: string;
  /** The room as everyone sees it, and what only this player notices. */
  text: string[];
  own: string[];
  light: number;
  lightMax: number;
  rooms: DelveRoomView[];
  links: Array<[string, string]>;
  exits: Array<{
    id: string;
    to: string;
    label: string;
    light: number;
    /** What this player notices about the way (their role only). */
    note?: string;
    tone?: 'warn' | 'lead';
    enabled: boolean;
    reason?: string;
    mine: boolean;
    partner: boolean;
    known: boolean;
  }>;
  acts: Array<{ id: string; label: string; light: number; enabled: boolean; reason?: string; gives?: string }>;
  canLeave: boolean;
  lines: string[];
}

export interface StealthView {
  pos: number;
  length: number;
  alarm: number;
  alarmMax: number;
  time: number;
  timeMax: number;
  /** What this player perceives now and on the next turn (their role only). */
  now?: string;
  next?: string;
  /** Which tiles this player knows to be loose (maker), or nothing. */
  loose?: boolean[];
  /** Whether the watchers look now / on the next turn (hunter), or nothing. */
  look?: { now: boolean; next: boolean };
  myPick?: string;
  partnerPicked: boolean;
  lines: string[];
}

export interface ProposalView {
  title: string;
  label: string;
  mine: boolean;
  text: string;
}

export interface ResView {
  id: string;
  name: string;
  n: number;
  cap?: number;
  kind: 'res' | 'tool' | 'people';
}

export interface LogView {
  id: number;
  t: number;
  kind: LogKind;
  mine: boolean;
  partner: boolean;
  text: string;
}

export interface ClueView {
  id: string;
  title: string;
  text: string;
  personal: boolean;
  at: number;
  /** The question this clue belongs to (notes are grouped by it). */
  mystery?: string;
}

export interface QuestionView {
  id: string;
  question: string;
  level: number;
  levelText: string;
}

export interface PersonView {
  id: string;
  name: string;
  desc: string;
}

export interface AmbientView {
  kind: AmbientKind;
  fire: 'none' | 'warm' | 'low' | 'cold';
  /** Accent of this player's running action. */
  fx: FxKind | null;
  /** Accent of the partner's running action, only when the partner is here and online. */
  partnerFx: FxKind | null;
  /** Server time when each accent ends (the view is not resent when an action just runs out). */
  fxUntil: number;
  partnerFxUntil: number;
}

/** "While you were away": what changed since this player left. */
export interface WelcomeView {
  days: number;
  res: DeltaItem[];
  /** The partner's own log lines from that time, oldest first. */
  lines: string[];
  clues: number;
}

/** End-of-act summary: numbers only, no story. */
export interface SummaryView {
  act: number;
  days: number;
  places: number;
  clues: number;
  cluesMine: number;
  solved: number;
  people: number;
  scenes: number;
  suppers: number;
  fights: number;
  crafted: number;
  trips: number;
  actions: { me: number; partner: number };
  gathered: DeltaItem[];
}

export interface PlayerView {
  now: number;
  me: MeView;
  partner: PartnerView;
  day: number;
  act: number;
  goal: string | null;
  stove: { state: 'never' | 'warm' | 'low' | 'cold'; text: string } ;
  /** Purely visual backdrop: weather of this place, its fire, running action accents. */
  ambient: AmbientView;
  status: string[];
  res: ResView[];
  groups: GroupView[];
  proposal: ProposalView | null;
  scene: SceneView | null;
  log: LogView[];
  journal: { clues: ClueView[]; questions: QuestionView[]; people: PersonView[] };
  actDone: { act: number; text: string } | null;
  welcome: WelcomeView | null;
  summary: SummaryView | null;
  /** Server time when the current day began: evening falls as it gets long. */
  dayAt: number;
  /** Busy state of this player: all routine actions wait until then. */
  busyUntil: number;
  busyFrom: number;
  busyAction: string | null;
}
