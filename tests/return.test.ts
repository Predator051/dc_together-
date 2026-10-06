import { describe, expect, it } from 'vitest';
import { WELCOME_AFTER } from '../server/src/engine/index.js';
import { autoplay } from './harness.js';

function midAct1() {
  const r = autoplay({ choice: 'first', combat: 'smart', seed: 1 }, { choice: 'first', combat: 'smart', seed: 2 }, {
    seed: 9,
    until: (x) => !!x.state.flags['seen:loc_05'] && !!x.state.flags['built:act_01'] && !x.state.scene,
  });
  expect(r.done).toBe(true);
  return r.world;
}

describe('coming back after a while', () => {
  it('shows what the partner did, how the stores changed, and closes on request', () => {
    const w = midAct1();
    w.online('p1', false);
    w.state.res['res_01'] = 0;
    for (let i = 0; i < 6; i++) {
      w.cmd('p2', { c: 'act', id: w.state.flags['axe_sharp'] ? 'act_11' : 'act_10' });
      w.advance(60_000);
    }
    w.online('p1', true);
    const v = w.view('p1');
    expect(v.welcome).not.toBeNull();
    expect(v.welcome!.lines.length).toBeGreaterThan(0);
    expect(v.welcome!.res.find((r) => r.id === 'res_01')!.n).toBeGreaterThan(0);
    // the partner gets nothing: they never left
    expect(w.view('p2').welcome).toBeNull();
    w.cmd('p1', { c: 'ack', what: 'welcome' });
    expect(w.view('p1').welcome).toBeNull();
  });

  it('a dropped connection is not an absence', () => {
    const w = midAct1();
    w.online('p1', false);
    w.cmd('p2', { c: 'act', id: 'act_10' });
    w.advance(WELCOME_AFTER / 3);
    w.online('p1', true);
    expect(w.view('p1').welcome).toBeNull();
  });

  it('the end of an act brings a summary for each player, once', () => {
    const r = autoplay({ choice: 'random', combat: 'smart', seed: 3 }, { choice: 'random', combat: 'smart', seed: 4 }, {
      seed: 5,
      until: (x) => x.state.meta.actDone >= 1 && !x.state.scene,
    });
    expect(r.done).toBe(true);
    const w = r.world;
    const s = w.view('p1').summary!;
    expect(s.act).toBe(1);
    expect(s.days).toBeGreaterThan(1);
    expect(s.actions.me + s.actions.partner).toBeGreaterThan(10);
    expect(s.gathered.length).toBeGreaterThan(0);
    w.cmd('p1', { c: 'ack', what: 'summary' });
    expect(w.view('p1').summary).toBeNull();
    expect(w.view('p2').summary?.act).toBe(1);
  });

  it('a supper starts a new day: the evening clock resets', () => {
    const r = autoplay({ choice: 'first', combat: 'smart', seed: 1 }, { choice: 'first', combat: 'smart', seed: 2 }, {
      seed: 9,
      until: (x) => x.state.meta.day >= 3 && !x.state.scene,
    });
    expect(r.done).toBe(true);
    const w = r.world;
    const started = w.state.meta.createdAt;
    // the current day began after the world did, and no later than now
    expect(w.view('p1').dayAt).toBeGreaterThan(started);
    expect(w.view('p1').dayAt).toBeLessThanOrEqual(w.now);
    // the day began at the last "new day" line in the log
    const lastDay = [...w.state.log].reverse().find((e) => e.kind === 'system' && Object.values(e.text).some((t) => t?.includes(`${w.state.meta.day}.`)));
    expect(lastDay?.t).toBe(w.view('p1').dayAt);
  });
});
