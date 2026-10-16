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

/** Start the night and step straight into the operation. */
function atOperation(setup?: (w: World) => void): World {
  const w = ready();
  w.state.res['res_50'] = 9;
  w.state.res['res_51'] = 4;
  w.state.res['item_22'] = 1;
  setup?.(w);
  w.g().startScene('scn_105');
  w.state.scene!.node = 'hall';
  w.cmd('p1', { c: 'next' });
  w.cmd('p2', { c: 'next' });
  expect(w.state.scene!.node).toBe('op');
  return w;
}
const turn = (w: World, a: string, b: string) => {
  expect(w.cmd('p1', { c: 'choose', id: a }).ok).toBe(true);
  expect(w.cmd('p2', { c: 'choose', id: b }).ok).toBe(true);
};

describe('the longest night: two fronts at once', () => {
  it('each role has its own moves; a turn plays when both have chosen', () => {
    const w = atOperation((x) => (x.state.flags['rescued'] = 20));
    const h = w.view('p1').scene!.operation!;
    const m = w.view('p2').scene!.operation!;
    expect(h.moves.map((x) => x.id)).toEqual(['horn', 'call', 'lead', 'hold']);
    expect(m.moves.map((x) => x.id)).toEqual(['wedge', 'fire', 'help', 'hold']);
    expect(h.tracks.find((t) => t.id === 'out')!.value).toBe(20); // the rescued so far
    w.cmd('p1', { c: 'choose', id: 'horn' });
    expect(w.state.scene!.operation!.turn).toBe(0);
    w.cmd('p2', { c: 'choose', id: 'wedge' });
    const op = w.state.scene!.operation!;
    expect(op.turn).toBe(1);
    expect(op.tracks).toMatchObject({ awake: 6, pillars: 1, greys: 1 });
    expect(w.state.res['res_50']).toBe(8);
  });

  it('awake people are led out, and every one counts as rescued at once', () => {
    const w = atOperation((x) => {
      x.state.flags['rescued'] = 20;
      x.state.flags['a5_route_ready'] = 1;
    });
    turn(w, 'horn', 'wedge');
    turn(w, 'lead', 'help');
    expect(w.state.scene!.operation!.tracks['awake']).toBe(0);
    expect(w.state.flags['rescued']).toBe(26);
  });

  it('the greys closing in drive you back; pillars and the rescued stay', () => {
    const w = atOperation();
    for (let i = 0; i < 6 && w.state.scene?.node === 'op'; i++) turn(w, 'horn', 'fire');
    expect(w.state.scene!.node).toBe('overrun');
    expect(w.state.flags['a5_wedges']).toBeGreaterThan(0);
    w.cmd('p1', { c: 'next' });
    w.cmd('p2', { c: 'next' });
    expect(w.state.flags['done:scn_105']).toBeUndefined(); // the night can be tried again
  });

  it('when the night runs out short of the pillars, it is not over yet', () => {
    const w = atOperation((x) => (x.state.res['res_50'] = 0));
    for (let i = 0; i < 12 && w.state.scene?.node === 'op'; i++) turn(w, 'hold', 'hold');
    expect(w.state.scene!.node).toBe('short');
  });

  it('the hammer drives two wedges at a time', () => {
    const w = atOperation((x) => (x.state.res['item_42'] = 1));
    turn(w, 'call', 'wedge');
    expect(w.state.scene!.operation!.tracks['pillars']).toBe(2);
  });
});

describe('endings follow from what was done', () => {
  function toEnd(flags: Record<string, number>, makerPick: 'now' | 'wait'): World {
    const w = ready();
    Object.assign(w.state.flags, flags);
    w.g().startScene('scn_105');
    w.state.scene!.node = 'master';
    for (let i = 0; i < 6 && w.state.scene && w.state.scene.node !== 'final'; i++) {
      w.cmd('p1', { c: 'next' });
      w.cmd('p2', { c: 'next' });
      if (w.state.scene?.node === 'fight') w.state.scene.node = 'stopped';
    }
    expect(w.state.scene!.node).toBe('final');
    w.cmd('p1', { c: 'choose', id: 'wait' });
    w.cmd('p2', { c: 'choose', id: makerPick });
    for (let i = 0; i < 8 && w.state.scene; i++) {
      w.cmd('p1', { c: 'next' });
      w.cmd('p2', { c: 'next' });
    }
    expect(w.state.scene).toBeNull();
    expect(w.state.flags['a5_done']).toBe(1);
    return w;
  }
  const ending = (w: World) => Object.keys(w.state.flags).find((f) => f.startsWith('ending_'));

  it('"Гомін": the mother calls him by name, many are saved', () => {
    const w = toEnd({ a5_myroslava_present: 1, rescued: 50, a5_route_ready: 1 }, 'now');
    expect(ending(w)).toBe('ending_1');
    expect(w.state.flags['a5_savka_woke']).toBe(1);
  });

  it('waiting for the last ones with the shaft ready brings out six more, never above all of them', () => {
    const w = toEnd({ a5_myroslava_present: 1, rescued: 58, a5_route_ready: 1 }, 'wait');
    expect(w.state.flags['rescued']).toBe(61);
    expect(ending(w)).toBe('ending_1');
  });

  it('"Зарубка": no mother at the water, the master is stopped by force', () => {
    const w = toEnd({ rescued: 40, a5_route_ready: 1 }, 'now');
    expect(ending(w)).toBe('ending_2');
  });

  it('"Тимкові двері": waiting without a cleared shaft', () => {
    const w = toEnd({ a5_myroslava_present: 1, rescued: 50 }, 'wait');
    expect(ending(w)).toBe('ending_3');
  });

  it('"Глуха пора": too few saved', () => {
    const w = toEnd({ rescued: 12 }, 'now');
    expect(ending(w)).toBe('ending_4');
  });

  it('the maker holds the wedge: their choice decides, the hunter\'s is remembered', () => {
    const w = toEnd({ rescued: 40, a5_route_ready: 1 }, 'now');
    expect(w.state.flags['a5_final_now']).toBe(1);
    expect(w.state.flags['a5_hunter_wait']).toBe(1);
    expect(w.state.flags['a5_final_wait']).toBeUndefined();
  });
});
