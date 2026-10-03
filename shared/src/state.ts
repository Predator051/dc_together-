import type { Gender, PlayerId, Role, LogKind } from './content.js';

export const STATE_VERSION = 1;

export interface PlayerState {
  id: PlayerId;
  joined: boolean;
  name: string;
  gender: Gender;
  role: Role | null;
  hp: number;
  hpMax: number;
  flags: Record<string, number>;
  cooldowns: Record<string, number>;
  busy: { action: string; until: number } | null;
  /** Runtime only; reset to false on load. */
  online: boolean;
  lastSeen: number;
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
}
