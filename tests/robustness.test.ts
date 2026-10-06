// Dead ends that careful bots never walk into: careless players, empty stores, a drained world.
// Whatever a player has done, the game must still be finishable to the end of the last act.
import { describe, expect, it } from 'vitest';
import { content } from '../content/index.js';
import type { Content } from '../shared/src/content.js';
import { validateContent } from '../server/src/validate.js';
import { autoplay, describe as dump, type World } from './harness.js';

const finished = (w: World) => !!w.state.flags['a3_done'] && !w.state.scene;
const doneScenes = (w: World) => Object.keys(w.state.flags).filter((f) => f.startsWith('done:')).length;
const calm = (w: World) => !w.state.scene && !w.state.proposal;

/** Empty everything the players hold; optionally also the world's own finite stores. */
function emptyStores(w: World, drainWorld: boolean): string[] {
  const emptied: string[] = [];
  for (const r of content.resources) {
    const kind = r.kind ?? 'res';
    if (kind === 'tool' || kind === 'people') continue;
    if (r.hidden && !drainWorld) continue;
    if ((w.state.res[r.id] ?? 0) > 0) emptied.push(r.id);
    w.state.res[r.id] = 0;
  }
  return emptied;
}

describe('careless players never get stuck', () => {
  const careless = [
    { name: 'both waste resources', a: { waste: 0.3 }, b: { waste: 0.3 } },
    { name: 'both waste and wander', a: { waste: 0.25, wander: 0.03 }, b: { waste: 0.25, wander: 0.03 } },
    { name: 'one careful, one spendthrift', a: {}, b: { waste: 0.5 } },
    { name: 'spendthrifts who decline', a: { waste: 0.4, declineRate: 0.3 }, b: { waste: 0.4, impatient: true } },
  ];
  careless.forEach((c, i) => {
    it(c.name, () => {
      const r = autoplay(
        { choice: 'random', combat: 'smart', seed: 300 + i, ...c.a },
        { choice: 'random', combat: 'smart', seed: 400 + i, ...c.b },
        { seed: 50 + i, maxSteps: 60000 },
      );
      if (!r.done) throw new Error(`Stuck (${r.reason}) after ${r.steps} steps:\n${dump(r.world)}`);
      expect(finished(r.world)).toBe(true);
    });
  });
});

describe('the game recovers from empty stores at any point', () => {
  // Checkpoints spread over the whole story: a share of the scenes a full playthrough finishes.
  const ref = autoplay({ choice: 'random', combat: 'smart', seed: 1 }, { choice: 'random', combat: 'smart', seed: 2 }, { seed: 3 });
  const total = doneScenes(ref.world);
  const checkpoints = [...new Set([0.06, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((f) => Math.max(1, Math.floor(total * f))))];

  for (const drainWorld of [false, true]) {
    for (const k of checkpoints) {
      const what = drainWorld ? 'stores and the world drained' : 'stores emptied';
      it(`${what} after ${k} scenes`, () => {
        const before = autoplay(
          { choice: 'random', combat: 'smart', seed: 500 + k },
          { choice: 'random', combat: 'smart', seed: 600 + k },
          { seed: 70 + k, until: (w) => (doneScenes(w) >= k && calm(w)) || finished(w) },
        );
        expect(before.done).toBe(true);
        // the checkpoint was really reached mid-story, and there really was something to lose
        expect(finished(before.world)).toBe(false);
        const w = before.world;
        const emptied = emptyStores(w, drainWorld);
        expect(emptied.length).toBeGreaterThan(0);
        const after = autoplay(
          { choice: 'random', combat: 'smart', seed: 700 + k },
          { choice: 'random', combat: 'weak', seed: 800 + k },
          { from: w, maxSteps: 60000 },
        );
        if (!after.done)
          throw new Error(`Stuck after emptying ${emptied.join(', ')} at ${k} scenes (${after.reason}):\n${dump(after.world)}`);
        expect(finished(after.world)).toBe(true);
      });
    }
  }
});

describe('validator: nothing needed can run out for good', () => {
  it('the real content passes', () => {
    expect(validateContent(content).errors.filter((e) => e.includes('renewable'))).toEqual([]);
  });

  it('flags a resource whose only source is a one-time action', () => {
    const c: Content = JSON.parse(JSON.stringify(content));
    // Salt now only comes once; something still asks for it.
    for (const a of c.actions) {
      const gives = Object.keys(a.yield ?? {}).includes('res_20') || (a.chance ?? []).some((ch) => ch.add && 'res_20' in ch.add);
      if (gives) a.once = true;
    }
    const errs = validateContent(c).errors.filter((e) => e.includes('renewable'));
    expect(errs.some((e) => e.includes('res_20'))).toBe(true);
  });
});
