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

describe('two-bot autoplay through acts 1–2', () => {
  const visitedScenes = new Set<string>();
  const finalFlags = new Set<string>();

  for (const [name, a, b] of combos) {
    it(`reaches the end of act 2: ${name}`, () => {
      const r = autoplay(a, b, { seed: a.seed * 31 + 7 });
      if (!r.done) throw new Error(`Stuck (${r.reason}) after ${r.steps} steps:\n${dump(r.world)}`);
      expect(r.world.state.meta.actDone).toBe(2);
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

  it('after act 2 ends the world stays playable: routine, travel and suppers keep working', () => {
    let endDay = 0;
    let trips = 0;
    let lastAt = '';
    const r = autoplay({ choice: 'random', combat: 'smart', seed: 41 }, { choice: 'random', combat: 'smart', seed: 42 }, {
      seed: 41,
      maxSteps: 30000,
      until: (x) => {
        if (!endDay && x.state.flags['done:scn_49']) endDay = x.state.meta.day;
        const at = x.state.players.p1.at;
        if (endDay && at !== lastAt) trips++;
        lastAt = at;
        return endDay > 0 && x.state.meta.day >= endDay + 4 && trips >= 2 && !x.state.scene;
      },
    });
    if (!r.done) throw new Error(`Stuck after act end (${r.reason}):\n${dump(r.world)}`);
    r.scenes.forEach((s) => visitedScenes.add(s));
    expect(r.world.state.meta.actDone).toBe(2);
  });

  it('distrust path: without the ferry they cross on a raft', () => {
    const r = autoplay({ choice: 'random', combat: 'smart', seed: 51 }, { choice: 'random', combat: 'smart', seed: 52 }, {
      seed: 51,
      maxSteps: 30000,
      until: (x) => {
        // Myroslava never warms up in this run.
        if (x.state.npcs['npc_04']) x.state.npcs['npc_04'].rel = Math.min(x.state.npcs['npc_04'].rel, -20);
        return !!x.state.flags['a2_done'] && !x.state.scene;
      },
    });
    if (!r.done) throw new Error(`Stuck (${r.reason}):\n${dump(r.world)}`);
    expect(r.world.state.flags['a2_crossing_raft']).toBe(1);
    expect(r.world.state.flags['a2_ferry_ok']).toBeUndefined();
    r.scenes.forEach((s) => visitedScenes.add(s));
  });

  it('across runs every scene and both sides of key decisions were exercised', () => {
    const story = content.scenes.filter((s) => s.id !== 'scn_29').map((s) => s.id);
    const missing = story.filter((id) => !visitedScenes.has(id));
    expect(missing).toEqual([]);
    for (const f of [
      'a1_panas_stays', 'a1_panas_goes', 'a1_called', 'a1_bell_rung', 'a1_door_broken', 'a1_seal_burned', 'a1_panas_with_us', 'a1_flute',
      'a2_crossing_ferry', 'a2_talk_listen', 'a2_talk_threat', 'a2_talk_deal', 'a2_watched_close', 'a2_wolves_done',
    ]) {
      expect(finalFlags.has(f), f).toBe(true);
    }
  });
});
