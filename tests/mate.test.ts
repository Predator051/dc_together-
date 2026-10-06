import { describe, expect, it } from 'vitest';
import { content } from '../content/index.js';
import { autoplay } from './harness.js';

describe("what the partner can do", () => {
  it('lists only the partner role actions, read-only, with honest availability', () => {
    const r = autoplay({ choice: 'first', combat: 'smart', seed: 1 }, { choice: 'first', combat: 'smart', seed: 2 }, {
      seed: 9,
      until: (x) => !!x.state.flags['done:scn_10'] && !x.state.scene,
    });
    expect(r.done).toBe(true);
    const w = r.world;
    const roleOf = new Map(content.actions.map((a) => [a.id, a.role]));
    const p2role = w.state.players.p2.role;
    const p1role = w.state.players.p1.role;

    const mates = w.view('p1').groups.flatMap((g) => g.partner ?? []);
    expect(mates.length).toBeGreaterThan(0);
    for (const m of mates) expect(roleOf.get(m.id)).toBe(p2role);
    // none of them shows up as my own button
    const mine = new Set(w.view('p1').groups.flatMap((g) => g.entries.map((e) => e.id)));
    for (const m of mates) expect(mine.has(m.id)).toBe(false);
    // and the other way round
    for (const m of w.view('p2').groups.flatMap((g) => g.partner ?? [])) expect(roleOf.get(m.id)).toBe(p1role);

    w.online('p2', false);
    const offline = w.view('p1').groups.flatMap((g) => g.partner ?? []);
    expect(offline.every((m) => !m.ready && !!m.reason)).toBe(true);
  });
});
