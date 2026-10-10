import type { Gender, PlayerId, Role, LogKind } from './content.js';

export const STATE_VERSION = 3;

export interface PlayerState {
  id: PlayerId;
  joined: boolean;
  name: string;
  gender: Gender;
  role: Role | null;
  /** Area id where the player is (added in state version 2). */
  at: string;
  hp: number;
  hpMax: number;
  flags: Record<string, number>;
  cooldowns: Record<string, number>;
  busy: { action: string; until: number } | null;
  /** Runtime only; reset to false on load. */
  online: boolean;
  lastSeen: number;
  /** What the world looked like when this player left (v3). */
  away: Snapshot | null;
  /** Shown once on return after a real absence: "while you were away" (v3). */
  welcome: Snapshot | null;
  /** The last act whose summary this player has closed (v3). */
  seenSummary: number;
}

export interface Snapshot {
  at: number;
  day: number;
  res: Record<string, number>;
  /** First log id written after the snapshot. */
  log: number;
}

/** Counters for the end-of-act summary (v3; worlds older than that start counting at the update). */
export interface Stats {
  gathered: Record<string, number>;
  actions: Record<PlayerId, number>;
  crafted: number;
  trips: number;
  suppers: number;
}

export interface CombatState {
  enc: string;
  hp: number;
  fear: number;
  round: number;
  picks: Partial<Record<PlayerId, string>>;
  /** Narrative of the last resolved round, pre-rendered per player. */
  lastRound: Record<PlayerId, string[]>;
}

export interface SceneState {
  id: string;
  node: string;
  paused: boolean;
  ready: Partial<Record<PlayerId, boolean>>;
  picks: Partial<Record<PlayerId, string>>;
  /** Options already used in `any` hubs (by node). */
  used: Record<string, string[]>;
  /** Visited nodes with what was picked, to render the transcript. */
  trail: Array<{ node: string; picks?: Partial<Record<PlayerId, string>>; combat?: Record<PlayerId, string[]> }>;
  combat: CombatState | null;
  startedAt: number;
  /** A descent in progress (kept while the scene steps out for a story beat and comes back). */
  delve?: DelveState | null;
  stealth?: StealthState | null;
  /** The last hand sign each player showed (in earplugs nobody hears anybody). */
  signs?: Partial<Record<PlayerId, { id: string; at: number; turn: number }>>;
}

export interface DelveState {
  map: string;
  node: string;
  room: string;
  light: number;
  lightMax: number;
  /** Way each player wants to go: `go:<room>`. */
  picks: Partial<Record<PlayerId, string>>;
  /** What happened last, per player. */
  lines: Record<PlayerId, string[]>;
}

export interface StealthState {
  pos: number;
  turn: number;
  time: number;
  alarm: number;
  picks: Partial<Record<PlayerId, string>>;
  lines: Record<PlayerId, string[]>;
}

export interface Proposal {
  scene: string;
  /** Button (scene or pool action) that created the proposal. */
  via: string;
  by: PlayerId;
  at: number;
}

export interface LogEntry {
  id: number;
  t: number;
  kind: LogKind;
  actor?: PlayerId;
  /** Pre-rendered per player; players absent from the map do not see the entry. */
  text: Partial<Record<PlayerId, string>>;
}

export interface WorldState {
  version: number;
  meta: {
    seed: number;
    rng: number;
    createdAt: number;
    lastTick: number;
    day: number;
    act: number;
    nextLogId: number;
    actDone: number;
    /** Real time when the current day began (v3): evening falls as it gets long. */
    dayAt: number;
  };
  players: Record<PlayerId, PlayerState>;
  res: Record<string, number>;
  /** Resources ever seen (so they stay in the list at 0). */
  seenRes: Record<string, number>;
  flags: Record<string, number>;
  stove: { fuel: number; lit: boolean };
  scene: SceneState | null;
  proposal: Proposal | null;
  log: LogEntry[];
  clues: Record<string, { who: PlayerId[]; at: number }>;
  mysteries: Record<string, number>;
  npcs: Record<string, { met: boolean; rel: number }>;
  goal: string | null;
  stats: Stats;
}
