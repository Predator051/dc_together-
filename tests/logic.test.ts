import { describe, expect, it } from 'vitest';
import { content } from '../content/index.js';
import { Rng, rngNext, seedFrom } from '../shared/src/rng.js';
import { Game, newWorld } from '../server/src/engine/index.js';
import { fill } from '../server/src/engine/text.js';
import { ix, World } from './harness.js';

function ready(seed = 1): World {
  const w = new World(seed);
  w.join('Марко', 'm', 'hunter');
  w.join('Оксана', 'f', 'maker');
  w.online('p1');
  w.online('p2');
  return w;
}

/** Finish the cellar prologue and the hatch scene. */
function outOfCellar(w: World): void {
  for (const pid of ['p1', 'p2'] as const) {
    expect(w.cmd(pid, { c: 'act', id: 'act_p1' }).ok).toBe(true);
    w.advance(5000);
    expect(w.cmd(pid, { c: 'act', id: 'act_p2' }).ok).toBe(true);
    w.advance(5000);
  }
  expect(w.cmd('p1', { c: 'act', id: 'act_p3' }).ok).toBe(true);
  w.advance(5000);
  expect(w.cmd('p1', { c: 'act', id: 'act_p4' }).ok).toBe(true);
  w.advance(5000);
  expect(w.cmd('p1', { c: 'act', id: 'scn_01' }).ok).toBe(true);
  expect(w.cmd('p2', { c: 'accept' }).ok).toBe(true);
  for (let i = 0; i < 20 && w.state.scene; i++) {
    const v = w.view('p1');
    if (v.scene?.kind === 'choice') {
      w.cmd('p1', { c: 'choose', id: 'quiet' });
      w.cmd('p2', { c: 'choose', id: 'quiet' });
    } else {
      w.cmd('p1', { c: 'next' });
      w.cmd('p2', { c: 'next' });
    }
  }
  expect(w.state.flags['done:scn_01']).toBe(1);
}

describe('deterministic RNG', () => {
  it('same seed gives same sequence', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const xs = Array.from({ length: 20 }, () => a.int(1, 100));
    const ys = Array.from({ length: 20 }, () => b.int(1, 100));
    expect(xs).toEqual(ys);
    expect(rngNext(1)[0]).toBeGreaterThanOrEqual(0);
    expect(seedFrom('abc')).toBe(seedFrom('abc'));
  });

  it('two worlds with the same seed and inputs end identical', () => {
    const run = () => {
      const w = ready(99);
      outOfCellar(w);
      for (let i = 0; i < 30; i++) {
        w.cmd('p2', { c: 'act', id: 'act_10' });
        w.cmd('p1', { c: 'act', id: 'act_16' });
        w.advance(7000);
      }
      return JSON.stringify({ res: w.state.res, rng: w.state.meta.rng, log: w.state.log.length });
    };
    expect(run()).toEqual(run());
  });
});

describe('resources, costs, caps, busy time', () => {
  it('pays costs, respects caps and the busy lock', () => {
    const w = ready();
    outOfCellar(w);
    expect(w.state.res['item_01']).toBe(1);
    // chopping with a dull axe: +1 wood, then busy
    expect(w.cmd('p2', { c: 'act', id: 'act_10' }).ok).toBe(true);
    expect(w.state.res['res_01']).toBe(1);
    const busy = w.cmd('p2', { c: 'act', id: 'act_13' });
    expect(busy.ok).toBe(false);
    expect(busy.err).toBe(content.ui.err_busy);
    w.advance(6000);
    for (let i = 0; i < 40; i++) {
      w.cmd('p2', { c: 'act', id: 'act_10' });
      w.advance(6000);
    }
    expect(w.state.res['res_01']).toBe(20); // cap
    const full = w.cmd('p2', { c: 'act', id: 'act_10' });
    expect(full.ok).toBe(false);
    // stove costs 3 wood and can be built once
    expect(w.cmd('p1', { c: 'act', id: 'act_01' }).ok).toBe(true);
    expect(w.state.res['res_01']).toBe(17);
    w.advance(5000);
    expect(w.cmd('p1', { c: 'act', id: 'act_01' }).ok).toBe(false);
  });

  it('role restrictions hold', () => {
    const w = ready();
    outOfCellar(w);
    expect(w.cmd('p1', { c: 'act', id: 'act_10' }).ok).toBe(false); // hunter cannot chop
    expect(w.cmd('p2', { c: 'act', id: 'act_16' }).ok).toBe(false); // maker cannot read tracks
    expect(w.cmd('p1', { c: 'act', id: 'act_16' }).ok).toBe(true);
    expect(w.state.clues['clue_01']?.who).toEqual(['p1']);
  });

  it('vignettes are shown once each, in order', () => {
    const w = ready();
    outOfCellar(w);
    w.cmd('p1', { c: 'act', id: 'act_16' });
    w.advance(4000);
    const first = () => w.view('p1').log.filter((l) => l.mine && l.kind === 'story').length;
    const before = first();
    for (let i = 0; i < 10; i++) {
      w.cmd('p1', { c: 'act', id: 'act_17' });
      w.advance(13000);
    }
    const beats = content.actions.find((a) => a.id === 'act_17')!.beats!.length;
    expect(first() - before).toBe(beats);
    expect(w.state.clues['clue_37']?.who).toEqual(['p1']);
  });
});

describe('stove', () => {
  it('burns only while someone is online and slows work when cold', () => {
    const w = ready();
    outOfCellar(w);
    w.state.res['res_01'] = 10;
    expect(w.cmd('p1', { c: 'act', id: 'act_01' }).ok).toBe(true);
    expect(w.g().stoveState()).toBe('warm');
    w.online('p1', false);
    w.online('p2', false);
    w.advance(60 * 60 * 1000);
    expect(w.g().stoveState()).toBe('warm');
    w.online('p2', true);
    w.advance(13 * 60 * 1000);
    expect(w.g().stoveState()).toBe('cold');
    expect(w.g().cooldownMult()).toBe(1.5);
    w.cmd('p2', { c: 'act', id: 'act_10' });
    const busy = w.state.players.p2.busy!;
    expect(busy.until - w.now).toBe(9000);
    w.advance(10000);
    expect(w.cmd('p2', { c: 'act', id: 'act_02' }).ok).toBe(true);
    expect(w.g().stoveState()).toBe('warm');
  });
});

describe('combat is deterministic and can be lost without dead ends', () => {
  function toFight(seed: number): World {
    const w = ready(seed);
    w.state.flags['bell_fixed'] = 1;
    w.g().startScene('scn_13');
    w.cmd('p1', { c: 'next' });
    w.cmd('p2', { c: 'next' });
    w.cmd('p1', { c: 'next' });
    w.cmd('p2', { c: 'next' });
    expect(w.state.scene?.node).toBe('fight');
    return w;
  }

  it('same seed and moves give the same fight', () => {
    const fight = () => {
      const w = toFight(5);
      const log: string[] = [];
      for (let i = 0; i < 6 && w.state.scene?.node === 'fight'; i++) {
        w.cmd('p1', { c: 'choose', id: 'knife' });
        w.cmd('p2', { c: 'choose', id: 'axe' });
        log.push(JSON.stringify(w.state.scene?.combat?.hp));
      }
      return log.join(',');
    };
    expect(fight()).toEqual(fight());
  });

  it('losing returns to routine with losses and the night repeats at the next supper', () => {
    const w = toFight(6);
    w.state.res['res_03'] = 10;
    for (let i = 0; i < 80 && w.state.scene?.node === 'fight'; i++) {
      const o1 = w.state.players.p1.hp > 0 ? 'guard' : 'up';
      const o2 = w.state.players.p2.hp > 0 ? 'guard' : 'up';
      w.cmd('p1', { c: 'choose', id: o1 });
      w.cmd('p2', { c: 'choose', id: o2 });
    }
    // Without the dog and with guard-only moves the wolves win (fear never grows).
    expect(w.state.scene?.node).toBe('lost');
    w.cmd('p1', { c: 'next' });
    w.cmd('p2', { c: 'next' });
    expect(w.state.scene).toBeNull();
    expect(w.state.flags['done:scn_13']).toBeUndefined();
    expect(w.state.flags['night_attempts']).toBe(1);
    expect(w.state.res['res_03']).toBe(4);
    expect(w.state.players.p1.hp).toBeGreaterThan(0);
    w.state.flags['night_warned'] = 1;
    w.state.flags['built:act_01'] = 1;
    w.state.stove = { lit: true, fuel: 10 * 60 * 1000 };
    w.state.res['res_02'] = 5;
    const pick = new Game(ix, w.state, w.now).pickFromPool('supper');
    expect(pick?.id).toBe('scn_29');
  });

  it('wolves flee from noise', () => {
    const w = toFight(7);
    for (let i = 0; i < 5 && w.state.scene?.node === 'fight'; i++) {
      w.cmd('p1', { c: 'choose', id: 'shout' });
      w.cmd('p2', { c: 'choose', id: 'bell' });
    }
    expect(w.state.flags['enc_01:fled']).toBe(1);
    expect(w.state.scene?.node).toBe('n3');
  });
});

describe('text templates', () => {
  it('fills names and gendered forms for both players', () => {
    const m = { name: 'Марко', gender: 'm' as const, role: 'hunter' as const, joined: true };
    const f = { name: 'Оксана', gender: 'f' as const, role: 'maker' as const, joined: true };
    expect(fill('{name} {пішов|пішла}, а {partner} {p:лишився|лишилася}.', m, f, content.roleTitles, 'хтось')).toBe('Марко пішов, а Оксана лишилася.');
    expect(fill('Ти — {role}.', f, m, content.roleTitles, 'хтось')).toBe('Ти — майстриня.');
    expect(fill('{partner} спить.', m, null, content.roleTitles, 'хтось')).toBe('хтось спить.');
  });

  it('each player sees only own personal scene text and own clues', () => {
    const w = ready();
    outOfCellar(w);
    const hunter = JSON.stringify(w.view('p1'));
    const maker = JSON.stringify(w.view('p2'));
    expect(hunter).not.toContain('Засув на ляді');
    expect(maker).toContain('Засув на ляді');
    expect(maker).not.toContain('Борозни на подвір');
    expect(hunter).toContain('Борозни на подвір');
  });

  it('new world has sane defaults', () => {
    const s = newWorld(content, 3, 0);
    expect(s.players.p1.joined).toBe(false);
    expect(s.res['res_11']).toBe(12);
  });
});
