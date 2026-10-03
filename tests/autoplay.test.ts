import { describe, expect, it } from 'vitest';
import { content } from '../content/index.js';
import type { BotOptions } from './bot.js';
import { autoplay, describe as dump } from './harness.js';

const combos: Array<[string, BotOptions, BotOptions]> = [
  ['first/first', { choice: 'first', combat: 'smart', seed: 1 }, { choice: 'first', combat: 'smart', seed: 2 }],
  ['last/last', { choice: 'last', combat: 'smart', seed: 3 }, { choice: 'last', combat: 'smart', seed: 4 }],
  ['first/last (always disagree)', { choice: 'first', combat: 'smart', seed: 5 }, { choice: 'last', combat: 'smart', seed: 6 }],
  ['random', { choice: 'random', combat: 'smart', seed: 7 }, { choice: 'random', combat: 'smart', seed: 8 }],
  ['random weak fighters', { choice: 'random', combat: 'weak', seed: 9 }, { choice: 'random', combat: 'weak', seed: 10 }],
  ['impatient + declines', { choice: 'random', combat: 'smart', seed: 11, impatient: true, declineRate: 0.3 }, { choice: 'random', combat: 'smart', seed: 12, declineRate: 0.3 }],
];

describe('two-bot autoplay through act 1', () => {
  const visitedScenes = new Set<string>();
  const finalFlags = new Set<string>();

  for (const [name, a, b] of combos) {
    it(`reaches the end of act 1: ${name}`, () => {
      const r = autoplay(a, b, { seed: a.seed * 31 + 7 });
      if (!r.done) throw new Error(`Stuck (${r.reason}) after ${r.steps} steps:\n${dump(r.world)}`);
      expect(r.world.state.meta.actDone).toBe(1);
      expect(r.world.state.scene).toBeNull();
      r.scenes.forEach((s) => visitedScenes.add(s));
      Object.keys(r.world.state.flags).forEach((f) => finalFlags.add(f));
    });
  }

  for (let seed = 100; seed < 112; seed++) {
    it(`random seed ${seed}`, () => {
      const r = autoplay({ choice: 'random', combat: 'smart', seed }, { choice: 'random', combat: seed % 2 ? 'weak' : 'smart', seed: seed + 1000 }, { seed });
      if (!r.done) throw new Error(`Stuck (${r.reason}):\n${dump(r.world)}`);
      r.scenes.forEach((s) => visitedScenes.add(s));
      Object.keys(r.world.state.flags).forEach((f) => finalFlags.add(f));
    });
  }

  it('after act 1 ends the world stays playable: routine and suppers keep working', () => {
    let endDay = 0;
    const r = autoplay({ choice: 'random', combat: 'smart', seed: 41 }, { choice: 'random', combat: 'smart', seed: 42 }, {
      seed: 41,
      maxSteps: 30000,
      until: (x) => {
        if (!endDay && x.state.flags['done:scn_14']) endDay = x.state.meta.day;
        return endDay > 0 && x.state.meta.day >= endDay + 4 && !x.state.scene;
      },
    });
    if (!r.done) throw new Error(`Stuck after act end (${r.reason}):\n${dump(r.world)}`);
    r.scenes.forEach((s) => visitedScenes.add(s));
    expect(r.world.state.meta.actDone).toBe(1);
  });

  it('across runs every scene and both sides of key decisions were exercised', () => {
    const story = content.scenes.filter((s) => s.id !== 'scn_29').map((s) => s.id);
    const missing = story.filter((id) => !visitedScenes.has(id));
    expect(missing).toEqual([]);
    for (const f of ['a1_panas_stays', 'a1_panas_goes', 'a1_called', 'a1_bell_rung', 'a1_door_broken', 'a1_seal_burned', 'a1_panas_with_us', 'a1_flute']) {
      expect(finalFlags.has(f), f).toBe(true);
    }
  });
});
