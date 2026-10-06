import type { Content } from '../../shared/src/content.js';
import type { WorldState } from '../../shared/src/state.js';
import { STATE_VERSION } from '../../shared/src/state.js';
import { normalizeWorld } from './engine/index.js';

/**
 * World-state migrations. Key N upgrades a state of version N to N+1.
 * Rules (see content/secret/STATUS.md):
 *  - never delete player-visible history (log, clues) unless it is broken;
 *  - content IDs are stable; if a scene node is renamed, map the old id here;
 *  - an active scene that no longer exists is dropped (the world stays playable).
 */
export type Migration = (s: any) => any;

export const migrations: Record<number, Migration> = {
  // v1 -> v2 (act 2): players get a location; everyone was in Ясенець.
  1: (s) => {
    for (const pid of ['p1', 'p2']) if (s.players?.[pid] && !s.players[pid].at) s.players[pid].at = 'yas';
    s.version = 2;
    return s;
  },
  // v2 -> v3: return summaries, end-of-act summaries, evenings. Counting starts now;
  // the summary of an act that is already over is still shown once.
  2: (s) => {
    for (const pid of ['p1', 'p2']) {
      const p = s.players?.[pid];
      if (!p) continue;
      p.away ??= null;
      p.welcome ??= null;
      p.seenSummary ??= 0;
    }
    s.stats ??= { gathered: {}, actions: { p1: 0, p2: 0 }, crafted: 0, trips: 0, suppers: 0 };
    s.meta.dayAt ??= s.meta.lastTick ?? s.meta.createdAt ?? 0;
    s.version = 3;
    return s;
  },
};

export class MigrationError extends Error {}

export function migrateState(
  raw: unknown,
  content: Content,
  now: number,
  registry: Record<number, Migration> = migrations,
  target: number = STATE_VERSION,
): { state: WorldState; from: number; migrated: boolean } {
  if (!raw || typeof raw !== 'object') throw new MigrationError('World state is not an object');
  let s = raw as any;
  const from = Number(s.version ?? 0);
  if (from > target) throw new MigrationError(`World version ${from} is newer than this server (${target})`);
  while (Number(s.version ?? 0) < target) {
    const v = Number(s.version ?? 0);
    const step = registry[v];
    if (!step) throw new MigrationError(`No migration from version ${v}`);
    s = step(s);
    if (Number(s.version) !== v + 1) throw new MigrationError(`Migration ${v} did not bump version`);
  }
  const state = sanitize(s as WorldState, content);
  return { state: normalizeWorld(content, state, now), from, migrated: from !== target };
}

/** Drop references to content that no longer exists so an update can never brick a world. */
function sanitize(s: WorldState, content: Content): WorldState {
  if (s.scene) {
    const def = content.scenes.find((x) => x.id === s.scene!.id);
    if (!def || !def.nodes[s.scene.node]) s.scene = null;
    else s.scene.trail = s.scene.trail.filter((t) => def.nodes[t.node]);
  }
  if (s.proposal && !content.scenes.find((x) => x.id === s.proposal!.scene)) s.proposal = null;
  return s;
}
