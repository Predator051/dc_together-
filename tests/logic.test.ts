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

describe('buttons say what they give and cost', () => {
  it('exact gains, ranges, luck-based "+?", storage upgrades and leftover stock', () => {
    const w = ready();
    outOfCellar(w);
    w.state.flags['seen:loc_07'] = 1;
    w.state.flags['built:act_01'] = 1;
    w.state.res['item_02'] = 1;
    w.state.res['res_07'] = 3;
    const entries = (pid: 'p1' | 'p2') => w.view(pid).groups.flatMap((g) => g.entries);
    const find = (pid: 'p1' | 'p2', id: string) => entries(pid).find((e) => e.id === id)!;
    const gains = (pid: 'p1' | 'p2', id: string) => find(pid, id).gain!.map((x) => `${x.text}${x.unsure ? '?' : ''}`);

    expect(gains('p2', 'act_10')).toEqual(['+1 Дрова']);
    expect(gains('p1', 'act_27')).toEqual(['+2–3 Харчі', '+? Шкури?', '+? Жир?', '+? Стріли?']);
    expect(gains('p1', 'act_03')).toEqual(['+??']);
    expect(gains('p2', 'act_18')).toEqual(['Дрова: місце +20']);
    expect(gains('p1', 'act_02')).toEqual(['+4 хв вогню']);
    const cellar = find('p1', 'act_13').cost!;
    expect(cellar[0]).toMatchObject({ stock: true, have: 12 });
    const supper = find('p1', 'pool_01');
    expect(supper.gain![0]!.text).toContain('Новий день');
    expect(supper.cost!.map((c) => c.name)).toEqual(['Харчі', 'Вода']);
    const scene = find('p1', 'scn_02');
    expect(scene.gain).toEqual([{ text: '+?', unsure: true }]);
  });

  it('partner progress is visible while they work', () => {
    const w = ready();
    outOfCellar(w);
    w.cmd('p2', { c: 'act', id: 'act_10' });
    const busy = w.view('p1').partner.busy!;
    expect(busy.text).toBe('рубає дрова');
    expect(busy.until - busy.from).toBe(6000);
    expect(w.view('p2').busyUntil - w.view('p2').busyFrom).toBe(6000);
  });
});

describe('act 2 branches', () => {
  it('if the wolves were killed in act 1, the den holds mute cubs that can be fed', () => {
    const w = ready();
    w.state.flags['enc_01:killed'] = 1;
    w.state.players.p1.at = 'tower';
    w.state.players.p2.at = 'tower';
    w.state.res['res_03'] = 5;
    w.g().startScene('scn_48');
    w.cmd('p1', { c: 'next' });
    w.cmd('p2', { c: 'next' });
    expect(w.state.scene?.node).toBe('k1');
    w.cmd('p1', { c: 'choose', id: 'feed' });
    w.cmd('p2', { c: 'choose', id: 'feed' });
    expect(w.state.flags['a2_cubs_fed']).toBe(1);
    expect(w.state.res['res_03']).toBe(2);
  });

  it('players in different places cannot start a together scene; travel moves only the traveller', () => {
    const w = ready();
    w.state.flags['a1_done'] = 1;
    w.state.flags['done:scn_40'] = 1;
    w.state.flags['done:scn_41'] = 1;
    w.state.players.p1.at = 'tower';
    w.state.players.p2.at = 'tower';
    expect(w.cmd('p2', { c: 'act', id: 'act_41' }).ok).toBe(true);
    expect(w.state.players.p2.at).toBe('yas');
    expect(w.state.players.p1.at).toBe('tower');
    const scene = w.view('p1').groups.flatMap((g) => g.entries).find((e) => e.id === 'scn_55')!;
    expect(scene.enabled).toBe(false);
    expect(scene.reason).toBe('Оксана зараз у Ясенці.');
    expect(w.view('p1').partner.where).toBe('у Ясенці');
    // Groups of the other place are not shown.
    expect(w.view('p2').groups.some((g) => g.id === 'loc_20')).toBe(false);
    expect(w.view('p1').groups.some((g) => g.id === 'loc_02')).toBe(false);
  });

  it('the stove only burns and slows work while someone is home', () => {
    const w = ready();
    w.state.stove = { lit: true, fuel: 5000 };
    w.state.players.p1.at = 'tower';
    w.state.players.p2.at = 'tower';
    w.advance(60_000);
    expect(w.state.stove.fuel).toBe(5000);
    w.state.stove.fuel = 0;
    expect(w.g().cooldownMult('tower')).toBe(1);
    expect(w.g().cooldownMult('yas')).toBe(1.5);
  });
});

describe('end-of-act banner', () => {
  it('is hidden once the next act exists, even before it starts', () => {
    const w = ready();
    w.state.meta.actDone = 1;
    w.state.flags['a1_done'] = 1;
    expect(w.view('p1').actDone).toBeNull();
    expect(w.view('p1').goal).toContain('вирушити на схід');
    w.state.meta.actDone = 2;
    expect(w.view('p1').actDone?.act).toBe(2);
  });
});
