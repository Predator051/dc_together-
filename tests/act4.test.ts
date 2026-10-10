import { describe, expect, it } from 'vitest';
import { World } from './harness.js';

function ready(seed = 1): World {
  const w = new World(seed);
  w.join('Марко', 'm', 'hunter');
  w.join('Оксана', 'f', 'maker');
  w.online('p1');
  w.online('p2');
  for (const pid of ['p1', 'p2'] as const) w.state.players[pid].at = 'kruchi';
  return w;
}

const both = (w: World, id: string) => {
  w.cmd('p1', { c: 'choose', id });
  return w.cmd('p2', { c: 'choose', id });
};

describe('descent: a map, a light, two people', () => {
  it('moves only when both pick the same way; each role notices its own things', () => {
    const w = ready();
    w.g().startScene('scn_91');
    w.cmd('p1', { c: 'next' });
    w.cmd('p2', { c: 'next' });
    let v1 = w.view('p1').scene!;
    expect(v1.kind).toBe('delve');
    expect(v1.delve!.room).toBe('Пролом');
    expect(v1.delve!.light).toBe(8);
    w.cmd('p1', { c: 'choose', id: 'go:r1' });
    expect(w.state.scene!.delve!.room).toBe('r0'); // the partner has not agreed yet
    expect(w.view('p2').scene!.delve!.exits.find((e) => e.id === 'go:r1')!.partner).toBe(true);
    w.cmd('p2', { c: 'choose', id: 'go:r1' });
    expect(w.state.scene!.delve!.room).toBe('r1');
    expect(w.state.scene!.delve!.light).toBe(7);
    // the hunter feels the draft, the maker sees the stone
    v1 = w.view('p1').scene!;
    const v2 = w.view('p2').scene!;
    const up1 = v1.delve!.exits.find((e) => e.to === 'r3')!;
    const up2 = v2.delve!.exits.find((e) => e.to === 'r3')!;
    expect(up1.tone).toBe('lead');
    expect(up1.note).toContain('морозним');
    expect(up2.note).toContain('склепіння');
    expect(up2.tone).toBeUndefined();
  });

  it('the maker sees bad stone coming; bad luck costs light', () => {
    const w = ready(3);
    w.g().startScene('scn_91');
    w.cmd('p1', { c: 'next' });
    w.cmd('p2', { c: 'next' });
    both(w, 'go:r1');
    both(w, 'go:r2');
    const risky = w.view('p2').scene!.delve!.exits.find((e) => e.to === 'r5')!;
    expect(risky.tone).toBe('warn');
    expect(w.view('p1').scene!.delve!.exits.find((e) => e.to === 'r5')!.tone).toBeUndefined();
    const before = w.state.scene!.delve!.light;
    both(w, 'go:r5');
    const after = w.state.scene!.delve!.light;
    expect([before - 1, before - 3]).toContain(after);
    // the room's first finds happen once, for good
    expect(w.state.clues['clue_84']).toBeTruthy();
    expect(w.state.flags['known:map_1:r5']).toBe(1);
  });

  it('when the light runs out the descent fails, but the map stays known', () => {
    const w = ready();
    w.g().startScene('scn_91');
    w.cmd('p1', { c: 'next' });
    w.cmd('p2', { c: 'next' });
    w.state.scene!.delve!.light = 1;
    both(w, 'go:r1');
    expect(w.state.scene!.node).toBe('dark');
    w.cmd('p1', { c: 'next' });
    w.cmd('p2', { c: 'next' });
    expect(w.state.scene).toBeNull();
    expect(w.state.flags['done:scn_91']).toBeUndefined(); // can be tried again
    expect(w.state.flags['known:map_1:r1']).toBe(1);
  });

  it('a torch gives light; one-time finds stay found', () => {
    const w = ready();
    w.state.res['res_08'] = 1;
    w.g().startScene('scn_91');
    w.cmd('p1', { c: 'next' });
    w.cmd('p2', { c: 'next' });
    expect(w.cmd('p1', { c: 'choose', id: 'act:torch' }).ok).toBe(true);
    expect(w.state.scene!.delve!.light).toBe(11);
    expect(w.state.res['res_08']).toBe(0);
    expect(w.view('p1').scene!.delve!.lines[0]).toContain('смолоскип');
  });

  it('a room can step out for a story beat and the map carries on where it was', () => {
    const w = ready();
    w.g().startScene('scn_93');
    w.cmd('p1', { c: 'next' });
    w.cmd('p2', { c: 'next' });
    both(w, 'go:d1');
    both(w, 'go:d3');
    both(w, 'go:d5');
    expect(w.state.scene!.node).toBe('records');
    expect(w.state.flags['a4_savka_known']).toBe(1);
    const light = w.state.scene!.delve!.light;
    for (let i = 0; i < 2; i++) {
      w.cmd('p1', { c: 'next' });
      w.cmd('p2', { c: 'next' });
    }
    expect(w.state.scene!.node).toBe('map');
    expect(w.state.scene!.delve!.room).toBe('d5');
    expect(w.state.scene!.delve!.light).toBe(light);
  });

  it('leaving is only possible from where the descent began', () => {
    const w = ready();
    w.g().startScene('scn_91');
    w.cmd('p1', { c: 'next' });
    w.cmd('p2', { c: 'next' });
    expect(w.view('p1').scene!.delve!.canLeave).toBe(true);
    both(w, 'go:r1');
    expect(w.view('p1').scene!.delve!.canLeave).toBe(false);
    expect(w.cmd('p1', { c: 'choose', id: 'leave' }).ok).toBe(false);
  });
});

describe('past the watchers', () => {
  function atWatchers(seed = 1, setup?: (w: World) => void): World {
    const w = ready(seed);
    setup?.(w);
    w.g().startScene('scn_93');
    w.state.scene!.node = 'guards';
    w.cmd('p1', { c: 'next' });
    w.cmd('p2', { c: 'next' });
    expect(w.state.scene!.node).toBe('sneak');
    return w;
  }
  const turn = (w: World, a: string, b: string) => {
    w.cmd('p1', { c: 'choose', id: a });
    w.cmd('p2', { c: 'choose', id: b });
  };

  it('only the hunter sees the watchers, only the maker sees the stones', () => {
    const w = atWatchers();
    const h = w.view('p1').scene!.stealth!;
    const m = w.view('p2').scene!.stealth!;
    expect(h.look).toEqual({ now: false, next: true });
    expect(h.loose).toBeUndefined();
    expect(m.loose).toEqual([false, true, false, false, true, false]);
    expect(m.look).toBeUndefined();
  });

  it('perfect play gets through; moving while watched is seen; stepping on loose stones is heard', () => {
    const w = atWatchers();
    // the sequence each one can only work out by sharing what they see
    const plan: Array<[string, string]> = [
      ['step', 'step'],
      ['freeze', 'freeze'],
      ['sneak', 'sneak'],
      ['step', 'step'],
      ['freeze', 'freeze'],
      ['freeze', 'freeze'],
      ['step', 'step'],
      ['sneak', 'sneak'],
      ['freeze', 'freeze'],
      ['step', 'step'],
    ];
    for (const [a, b] of plan) turn(w, a, b);
    expect(w.state.flags['a4_guards_passed']).toBe(1);
    expect(w.state.scene!.node).toBe('passed');

    const x = atWatchers(2);
    turn(x, 'step', 'step'); // fine
    turn(x, 'step', 'freeze'); // watched and one moved: seen (+2); a plain step on loose stones: heard (+1)
    expect(x.state.scene!.stealth!.alarm).toBe(3);
    expect(x.state.scene!.stealth!.pos).toBe(1); // nobody advances alone
    turn(x, 'step', 'step'); // loose stones again: caught
    expect(x.state.scene!.node).toBe('caught');
  });

  it('dawdling runs out the earplugs; a promise kept below buys a slip', () => {
    const w = atWatchers();
    for (let i = 0; i < 13 && w.state.scene?.node === 'sneak'; i++) turn(w, 'freeze', 'freeze');
    expect(w.state.scene!.node).toBe('caught');

    const y = atWatchers(1, (x) => (x.state.flags['a3_onysym_atone'] = 1));
    expect(y.view('p1').scene!.stealth!.alarmMax).toBe(5);
  });

  it('hand signs reach the partner during the turn they are shown', () => {
    const w = atWatchers();
    expect(w.cmd('p1', { c: 'sign', id: 'stop' }).ok).toBe(true);
    expect(w.cmd('p1', { c: 'sign', id: 'shout' }).ok).toBe(false);
    expect(w.view('p2').scene!.signs).toEqual({ mine: undefined, partner: 'stop', fresh: true });
    turn(w, 'step', 'step');
    expect(w.view('p2').scene!.signs!.fresh).toBe(false);
  });
});

describe('the shared work in the cave', () => {
  it('one loosens, the other carries; the bar fills up', () => {
    const w = ready();
    w.state.flags['done:scn_90'] = 1;
    w.state.flags['a3_done'] = 1;
    w.state.res['item_41'] = 1;
    const bar = () => w.view('p1').groups.find((g) => g.id === 'loc_40')!.progress!;
    expect(bar()).toEqual({ label: 'Розчищено завалу', n: 0, max: 6 });
    expect(w.cmd('p1', { c: 'act', id: 'act_85' }).ok).toBe(false); // nothing loosened yet
    expect(w.cmd('p2', { c: 'act', id: 'act_84' }).ok).toBe(true);
    w.advance(11000);
    expect(w.cmd('p2', { c: 'act', id: 'act_84' }).ok).toBe(true);
    w.advance(11000);
    expect(w.cmd('p2', { c: 'act', id: 'act_84' }).ok).toBe(false); // two loose heaps wait to be carried
    expect(w.cmd('p1', { c: 'act', id: 'act_85' }).ok).toBe(true);
    expect(bar().n).toBe(1);
  });

  it('at the altar the bars mean the guards and the burning book', () => {
    const w = ready();
    w.g().startScene('scn_93');
    w.state.scene!.node = 'lake2';
    w.cmd('p1', { c: 'next' });
    w.cmd('p2', { c: 'next' });
    const cb = w.view('p2').scene!.combat!;
    expect(cb.hpLabel).toBe('Сторожа');
    expect(cb.fearLabel).toBe('Книга горить');
  });
});
