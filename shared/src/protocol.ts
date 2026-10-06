import type { Gender, PlayerId, Role, LogKind } from './content.js';

// ---------- Client -> server ----------

export type Command =
  | { c: 'act'; id: string }
  | { c: 'accept' }
  | { c: 'decline' }
  | { c: 'cancel' }
  | { c: 'next' }
  | { c: 'choose'; id: string };

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
  paused: boolean;
  pausedText?: string;
  blocks: SceneBlock[];
  kind: 'text' | 'choice' | 'combat';
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
  };
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

export interface PlayerView {
  now: number;
  me: MeView;
  partner: PartnerView;
  day: number;
  act: number;
  goal: string | null;
  stove: { state: 'never' | 'warm' | 'low' | 'cold'; text: string } ;
  status: string[];
  res: ResView[];
  groups: GroupView[];
  proposal: ProposalView | null;
  scene: SceneView | null;
  log: LogView[];
  journal: { clues: ClueView[]; questions: QuestionView[]; people: PersonView[] };
  actDone: { act: number; text: string } | null;
  /** Busy state of this player: all routine actions wait until then. */
  busyUntil: number;
  busyFrom: number;
  busyAction: string | null;
}
