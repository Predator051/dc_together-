import { describe, expect, it } from 'vitest';
import { content } from '../content/index.js';
import type { PlayerId } from '../shared/src/content.js';
import { Bot } from './bot.js';
import { autoplay, World } from './harness.js';

function storySnapshot(w: World): string[] {
  return Object.keys(w.state.flags)
    .filter((f) => content.storyFlags.some((p) => (p.endsWith(':') || p.endsWith('_') ? f.startsWith(p) : f === p)))
    .sort();
}

/** Let one bot play alone for a while. */
function soloRun(w: World, pid: PlayerId, steps: number, seed: number) {
  const bot = new Bot('solo', content, { choice: 'random', combat: 'smart', seed });
  let acted = 0;
  for (let i = 0; i < steps; i++) {
    const cmd = bot.decide(w.view(pid));
    if (cmd) {
      const r = w.cmd(pid, cmd);
      if (r.ok) acted++;
    }
    const next = w.nextReady([pid]);
    w.advance(next ? Math.max(300, next - w.now) : 1000);
  }
  return acted;
}

describe('solo play: one player offline', () => {
  it('a lone player in the cellar cannot leave it', () => {
    const w = new World(3);
    w.join('Марко', 'm', 'hunter');
    w.online('p1');
    soloRun(w, 'p1', 200, 1);
    expect(w.state.flags['candle_lit']).toBe(1);
    expect(w.state.flags['done:scn_01']).toBeUndefined();
    const v = w.view('p1');
    const hatch = v.groups.flatMap((g) => g.entries).find((e) => e.id === 'scn_01');
    expect(hatch?.enabled).toBe(false);
  });

  for (const [pid, stage] of [['p1', 'done:scn_10'], ['p2', 'done:scn_10'], ['p1', 'done:scn_44'], ['p2', 'done:scn_44'], ['p1', 'done:scn_64'], ['p2', 'done:scn_64']] as const) {
    it(`routine by ${pid} alone never advances the story (after ${stage})`, () => {
      // Play together until the middle of the act, then one player leaves.
      const r = autoplay(
        { choice: 'random', combat: 'smart', seed: 21 },
        { choice: 'random', combat: 'smart', seed: 22 },
        { seed: 5, until: (x) => !!x.state.flags[stage] && !x.state.scene },
      );
      expect(r.done).toBe(true);
      const w = r.world;
      const other: PlayerId = pid === 'p1' ? 'p2' : 'p1';
      w.online(other, false);
      const before = storySnapshot(w);
      const scenesBefore = w.state.scene;
      const day = w.state.meta.day;
      const acted = soloRun(w, pid, 1500, 77);
      expect(acted).toBeGreaterThan(50);
      expect(storySnapshot(w)).toEqual(before);
      expect(w.state.meta.day).toBe(day);
      expect(w.state.proposal).toBeNull();
      if (!scenesBefore) expect(w.state.scene).toBeNull();
      // Together entries are visible but disabled with an honest reason.
      const v = w.view(pid);
      const together = v.groups.flatMap((g) => g.entries).filter((e) => e.together);
      expect(together.length).toBeGreaterThan(0);
      for (const e of together) {
        expect(e.enabled).toBe(false);
        expect(e.reason).toBe(content.ui.err_need_both);
      }
      // Resources stay within caps.
      for (const res of content.resources) {
        if (res.cap === undefined) continue;
        const cap = res.cap + (res.capBonus ?? []).reduce((s, b) => s + b.add, 0);
        expect(w.state.res[res.id] ?? 0).toBeLessThanOrEqual(cap);
      }
    });
  }

  it('the partner who returns finds the shared results', () => {
    const r = autoplay({ choice: 'first', combat: 'smart', seed: 1 }, { choice: 'first', combat: 'smart', seed: 2 }, {
      seed: 9,
      until: (x) => !!x.state.flags['seen:loc_05'] && !!x.state.flags['built:act_01'],
    });
    const w = r.world;
    w.online('p1', false);
    const woodBefore = w.state.res['res_01'] ?? 0;
    w.state.res['res_01'] = 0;
    for (let i = 0; i < 10; i++) {
      w.cmd('p2', { c: 'act', id: w.state.flags['axe_sharp'] ? 'act_11' : 'act_10' });
      w.advance(7000);
    }
    w.online('p1', true);
    const v = w.view('p1');
    expect(v.res.find((x) => x.id === 'res_01')!.n).toBeGreaterThan(0);
    expect(v.log.some((l) => l.partner)).toBe(true);
    expect(woodBefore).toBeGreaterThanOrEqual(0);
  });
});
