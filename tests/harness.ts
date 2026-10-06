// Engine-level two-bot harness: the bots see only their PlayerView and send Commands.

import { content } from '../content/index.js';
import type { PlayerId } from '../shared/src/content.js';
import type { PlayerView } from '../shared/src/protocol.js';
import type { WorldState } from '../shared/src/state.js';
import { ContentIndex, Game, newWorld } from '../server/src/engine/index.js';
import { buildView } from '../server/src/engine/view.js';
import { Bot, type BotOptions } from './bot.js';

export const ix = new ContentIndex(content);

export class World {
  now = 1_700_000_000_000;
  state: WorldState;

  constructor(seed = 1) {
    this.state = newWorld(content, seed, this.now);
  }

  g(): Game {
    return new Game(ix, this.state, this.now);
  }

  join(name: string, gender: 'm' | 'f', role: 'hunter' | 'maker'): PlayerId {
    const r = this.g().join(name, gender, role);
    if ('err' in r) throw new Error(r.err);
    return r.pid;
  }

  online(pid: PlayerId, on = true): void {
    this.g().setOnline(pid, on);
  }

  view(pid: PlayerId): PlayerView {
    return buildView(this.g(), pid);
  }

  cmd(pid: PlayerId, c: Parameters<Game['command']>[1]) {
    return this.g().command(pid, c);
  }

  advance(ms: number): void {
    this.now += ms;
    this.g().tick();
  }

  /** Earliest moment when any visible action of these players becomes ready. */
  nextReady(pids: PlayerId[]): number | null {
    let best: number | null = null;
    for (const pid of pids) {
      const v = this.view(pid);
      const times = v.groups.flatMap((g) => g.entries.map((e) => e.readyAt ?? 0));
      times.push(v.busyUntil);
      for (const t of times) if (t > this.now) best = best === null ? t : Math.min(best, t);
    }
    return best;
  }

  progress(): number {
    return Object.keys(this.state.flags).length * 10 + Object.keys(this.state.clues).length + this.state.meta.day * 3;
  }
}

export interface AutoplayResult {
  done: boolean;
  steps: number;
  world: World;
  rejected: number;
  scenes: string[];
  gameTimeMs: number;
  reason?: string;
}

export function autoplay(
  a: BotOptions,
  b: BotOptions,
  opts: { seed?: number; maxSteps?: number; until?: (w: World) => boolean; stallLimit?: number; from?: World } = {},
): AutoplayResult {
  // Either a fresh world, or carry on in one that was played (and perhaps tampered with) before.
  const w = opts.from ?? new World(opts.seed ?? 7);
  if (!opts.from) {
    w.join('Марко', 'm', 'hunter');
    w.join('Оксана', 'f', 'maker');
  }
  w.online('p1');
  w.online('p2');
  const bots: Record<PlayerId, Bot> = {
    p1: new Bot('A', content, a),
    p2: new Bot('B', content, b),
  };
  const until = opts.until ?? ((x: World) => !!x.state.flags['a3_done'] && !x.state.scene);
  const maxSteps = opts.maxSteps ?? 40000;
  const stallLimit = opts.stallLimit ?? 4000;
  const start = w.now;
  let rejected = 0;
  const scenes: string[] = [];
  let lastProgress = w.progress();
  let lastProgressStep = 0;

  for (let step = 0; step < maxSteps; step++) {
    if (until(w)) return { done: true, steps: step, world: w, rejected, scenes, gameTimeMs: w.now - start };
    let acted = false;
    const order: PlayerId[] = step % 2 === 0 ? ['p1', 'p2'] : ['p2', 'p1'];
    for (const pid of order) {
      const cmd = bots[pid].decide(w.view(pid));
      if (!cmd) continue;
      const before = w.state.scene?.id;
      const r = w.cmd(pid, cmd);
      if (!r.ok) rejected++;
      else acted = true;
      const after = w.state.scene?.id;
      if (after && after !== before) scenes.push(after);
    }
    if (!acted) {
      const next = w.nextReady(['p1', 'p2']);
      w.advance(next ? Math.max(1, next - w.now) : 1000);
    } else {
      w.advance(300);
    }
    const p = w.progress();
    if (p !== lastProgress) {
      lastProgress = p;
      lastProgressStep = step;
    } else if (step - lastProgressStep > stallLimit) {
      return { done: false, steps: step, world: w, rejected, scenes, gameTimeMs: w.now - start, reason: 'stalled' };
    }
  }
  return { done: until(w), steps: maxSteps, world: w, rejected, scenes, gameTimeMs: w.now - start, reason: 'max steps' };
}

export function describe(w: World): string {
  const s = w.state;
  return JSON.stringify(
    {
      day: s.meta.day,
      goal: s.goal,
      flags: Object.keys(s.flags).sort(),
      res: Object.fromEntries(Object.entries(s.res).filter(([, v]) => v)),
      scene: s.scene ? { id: s.scene.id, node: s.scene.node } : null,
      proposal: s.proposal,
    },
    null,
    1,
  );
}
