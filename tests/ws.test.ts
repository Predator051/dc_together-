import { afterEach, describe, expect, it } from 'vitest';
import { content } from '../content/index.js';
import type { PlayerId } from '../shared/src/content.js';
import { startServer, type Running } from '../server/src/main.js';
import { Bot } from './bot.js';
import { TestClient } from './wsclient.js';

const CODE = 'ABCD-EFGH';

let running: Running | null = null;
let clock = 1_700_000_000_000;
const clients: TestClient[] = [];

async function boot(): Promise<Running> {
  clock = 1_700_000_000_000;
  running = await startServer({
    content,
    dbPath: ':memory:',
    port: 0,
    host: '127.0.0.1',
    clientDir: '/nonexistent',
    inviteCode: CODE,
    clock: () => clock,
    seed: 12345,
    autoTick: false,
  });
  return running;
}

async function client(): Promise<TestClient> {
  const c = new TestClient(`ws://127.0.0.1:${running!.port}/ws`);
  await c.open();
  clients.push(c);
  return c;
}

async function pair(): Promise<[TestClient, TestClient]> {
  const a = await client();
  await a.join(CODE, 'Марко', 'm', 'hunter');
  const b = await client();
  await b.join('abcdefgh', 'Оксана', 'f', 'maker');
  await a.waitRev(running!.game.rev);
  return [a, b];
}

async function settle(...cs: TestClient[]): Promise<void> {
  const rev = running!.game.rev;
  await Promise.all(cs.map((c) => c.waitRev(rev)));
}

function advance(ms: number): void {
  clock += ms;
  running!.game.tick();
}

afterEach(async () => {
  for (const c of clients.splice(0)) await c.close().catch(() => {});
  if (running) await running.stop();
  running = null;
});

/** Drive both prologues and the hatch over the wire. */
async function throughHatch(a: TestClient, b: TestClient): Promise<void> {
  for (const c of [a, b]) {
    expect((await c.cmd({ c: 'act', id: 'act_p1' })).ok).toBe(true);
    advance(3000);
    expect((await c.cmd({ c: 'act', id: 'act_p2' })).ok).toBe(true);
    advance(3000);
  }
  expect((await a.cmd({ c: 'act', id: 'act_p3' })).ok).toBe(true);
  advance(3000);
  expect((await a.cmd({ c: 'act', id: 'act_p4' })).ok).toBe(true);
  advance(3000);
  await settle(a, b);
}

describe('connection and access', () => {
  it('rejects wrong invite codes and a third player', async () => {
    await boot();
    const x = await client();
    const err = x.wait('err');
    x.send({ t: 'lobby', code: 'WRONG' });
    expect((await err).code).toBe('bad_code');
    await pair();
    const z = await client();
    const e2 = z.wait('err');
    z.send({ t: 'join', code: CODE, name: 'Третій', gender: 'm', role: 'hunter' });
    expect((await e2).code).toBe('slots_full');
  });

  it('rejects a taken role and bad names', async () => {
    await boot();
    const a = await client();
    await a.join(CODE, 'Марко', 'm', 'hunter');
    const b = await client();
    const e1 = b.wait('err');
    b.send({ t: 'join', code: CODE, name: 'Оксана', gender: 'f', role: 'hunter' });
    expect((await e1).code).toBe('role_taken');
    const e2 = b.wait('err');
    b.send({ t: 'join', code: CODE, name: '   ', gender: 'f', role: 'maker' });
    expect((await e2).code).toBe('bad_input');
  });

  it('rate-limits guessing', async () => {
    await boot();
    const x = await client();
    for (let i = 0; i < 20; i++) {
      const e = x.wait('err');
      x.send({ t: 'lobby', code: `NOPE${i}` });
      await e;
    }
    const e = x.wait('err');
    x.send({ t: 'lobby', code: CODE });
    expect((await e).code).toBe('rate_limited');
  });

  it('commands require authentication', async () => {
    await boot();
    const x = await client();
    const e = x.wait('err');
    x.send({ t: 'cmd', cmd: { c: 'act', id: 'act_p1' } });
    expect((await e).code).toBe('not_authed');
  });

  it('reconnects with a token, from another device by code, and keeps state', async () => {
    await boot();
    const [a, b] = await pair();
    await a.cmd({ c: 'act', id: 'act_p1' });
    const token = a.token!;
    await a.close();
    await b.until((v) => !v.partner.online);

    const a2 = await client();
    const m = await a2.hello(token);
    expect(m.t).toBe('welcome');
    await settle(a2, b);
    expect(a2.view!.me.name).toBe('Марко');
    expect(a2.view!.log.some((l) => l.text.includes('Темрява') || l.text.includes('Світло'))).toBe(true);
    await b.until((v) => v.partner.online);

    const phone = await client();
    const lob = phone.wait('lobby');
    phone.send({ t: 'lobby', code: CODE });
    const l = await lob;
    expect(l.slots.every((s) => s.joined)).toBe(true);
    const w = phone.wait('welcome');
    phone.send({ t: 'claim', code: CODE, pid: 'p1' });
    await w;
    await settle(phone);
    expect(phone.view!.me.pid).toBe('p1');

    const bad = await client();
    const r = await bad.hello('not-a-token');
    expect(r.t).toBe('err');
  });
});

describe('synchronisation', () => {
  it('closing a one-time panel (summary, return) goes through the socket', async () => {
    await boot();
    const [a, b] = await pair();
    running!.game.state.meta.actDone = 1;
    running!.game.state.players.p1.welcome = { at: 0, day: 0, res: {}, log: 0 };
    const r1 = await a.cmd({ c: 'ack', what: 'summary' });
    expect(r1.ok).toBe(true);
    expect(running!.game.state.players.p1.seenSummary).toBe(1);
    expect(running!.game.state.players.p2.seenSummary).toBe(0);
    const r2 = await a.cmd({ c: 'ack', what: 'welcome' });
    expect(r2.ok).toBe(true);
    expect(running!.game.state.players.p1.welcome).toBeNull();
    await settle(b);
  });

  it('simultaneous actions both apply and both players see them', async () => {
    await boot();
    const [a, b] = await pair();
    await throughHatch(a, b);
    // Hatch scene
    const pr = await a.cmd({ c: 'act', id: 'scn_01' });
    expect(pr.ok).toBe(true);
    await settle(b);
    expect(b.view!.proposal?.mine).toBe(false);
    await b.cmd({ c: 'accept' });
    for (let i = 0; i < 12; i++) {
      await settle(a, b);
      const sc = a.view!.scene;
      if (!sc) break;
      if (sc.kind === 'choice') await Promise.all([a.cmd({ c: 'choose', id: 'quiet' }), b.cmd({ c: 'choose', id: 'call' })]);
      else await Promise.all([a.cmd({ c: 'next' }), b.cmd({ c: 'next' })]);
    }
    await settle(a, b);
    expect(a.view!.scene).toBeNull();
    // Mismatch branch was taken and both saw the same transcript summary in the log.
    expect(running!.game.state.flags['a1_called']).toBeUndefined();

    // Both act at the same moment.
    const before = running!.game.state.res['res_03'] ?? 0;
    const [r1, r2] = await Promise.all([a.cmd({ c: 'act', id: 'act_13' }), b.cmd({ c: 'act', id: 'act_13' })]);
    expect(r1.ok && r2.ok).toBe(true);
    await settle(a, b);
    expect(running!.game.state.res['res_03']).toBe(before + 2);
    expect(a.view!.res.find((r) => r.id === 'res_03')!.n).toBe(before + 2);
    expect(b.view!.res.find((r) => r.id === 'res_03')!.n).toBe(before + 2);
    expect(a.view!.partner.busy?.text).toContain('погребі');
  });

  it('conflicting proposals: only one wins, the other is told why', async () => {
    await boot();
    const [a, b] = await pair();
    await throughHatch(a, b);
    const [r1, r2] = await Promise.all([a.cmd({ c: 'act', id: 'scn_01' }), b.cmd({ c: 'act', id: 'scn_01' })]);
    expect([r1.ok, r2.ok].filter(Boolean).length).toBe(1);
    const loser = r1.ok ? r2 : r1;
    expect(loser.text).toBe(content.ui.err_proposal_pending);
  });

  it('a disconnect mid-scene pauses it; it resumes at the same place', async () => {
    await boot();
    const [a, b] = await pair();
    await throughHatch(a, b);
    await a.cmd({ c: 'act', id: 'scn_01' });
    await b.cmd({ c: 'accept' });
    await Promise.all([a.cmd({ c: 'next' }), b.cmd({ c: 'next' })]);
    await settle(a, b);
    const node = running!.game.state.scene!.node;
    const token = b.token!;
    await b.close();
    await a.until((v) => !!v.scene?.paused);
    expect(a.view!.scene!.pausedText).toContain('Оксана');
    // Routine is allowed while paused, scene commands are not.
    expect((await a.cmd({ c: 'next' })).ok).toBe(false);
    expect((await a.cmd({ c: 'act', id: 'act_p5' })).ok).toBe(true);

    running!.game.flush();
    const b2 = await client();
    await b2.hello(token);
    await a.until((v) => v.scene?.paused === false);
    expect(running!.game.state.scene!.node).toBe(node);
    expect(b2.view!.scene!.blocks.length).toBeGreaterThan(0);
  });

  it('two sockets of one player: presence stays online until the last one closes', async () => {
    await boot();
    const [a, b] = await pair();
    const a2 = await client();
    await a2.hello(a.token!);
    await a.close();
    await new Promise((r) => setTimeout(r, 50));
    expect(running!.game.state.players.p1.online).toBe(true);
    expect(b.view!.partner.online).toBe(true);
    await a2.close();
    await b.until((v) => !v.partner.online);
  });

  it('views never leak the partner\'s private clues', async () => {
    await boot();
    const [a, b] = await pair();
    await throughHatch(a, b);
    await settle(a, b);
    const hunterRaw = JSON.stringify(a.view);
    const makerRaw = JSON.stringify(b.view);
    expect(hunterRaw).toContain('Уривок пам');
    expect(hunterRaw).not.toContain('Мед і дим');
    expect(makerRaw).not.toContain('тягнув');
  });
});

describe('two bot clients over WebSocket', () => {
  it('play acts 1–4 to the end', async () => {
    await boot();
    const [a, b] = await pair();
    const cs: Record<PlayerId, TestClient> = { p1: a, p2: b };
    const bots: Record<PlayerId, Bot> = {
      p1: new Bot('A', content, { choice: 'first', combat: 'smart', seed: 1 }),
      p2: new Bot('B', content, { choice: 'first', combat: 'smart', seed: 2 }),
    };
    let steps = 0;
    const finished = () => !!running!.game.state.flags['a4_done'] && !running!.game.state.scene;
    while (!finished() && steps < 90000) {
      steps++;
      let acted = false;
      for (const pid of (steps % 2 ? ['p1', 'p2'] : ['p2', 'p1']) as PlayerId[]) {
        await settle(cs.p1, cs.p2);
        const cmd = bots[pid].decide(cs[pid].view!, clock);
        if (!cmd) continue;
        const r = await cs[pid].cmd(cmd);
        if (r.ok) acted = true;
      }
      if (!acted) {
        const views = [cs.p1.view!, cs.p2.view!];
        let next = Infinity;
        for (const v of views) {
          if (v.busyUntil > clock) next = Math.min(next, v.busyUntil);
          for (const g of v.groups) for (const e of g.entries) if (e.readyAt && e.readyAt > clock) next = Math.min(next, e.readyAt);
        }
        advance(Number.isFinite(next) ? next - clock + 1 : 1000);
        await settle(cs.p1, cs.p2);
      } else advance(200);
    }
    if (!finished()) console.log('WS autoplay stopped', steps, JSON.stringify(running!.game.state.flags), JSON.stringify(a.view?.groups.map((g) => g.entries.map((e) => `${e.id}:${e.enabled}:${e.reason ?? ''}`))));
    expect(finished()).toBe(true);
    await settle(a, b);
    expect(a.view!.actDone?.act).toBe(4);
    expect(b.view!.actDone?.act).toBe(4);
  });
});

describe('fresh state on request', () => {
  it('sync returns the current view so a returning tab never shows stale buttons', async () => {
    await boot();
    const [a] = await pair();
    const before = a.rev;
    const v = a.wait('view');
    a.send({ t: 'sync' });
    const m = await v;
    expect(m.rev).toBeGreaterThanOrEqual(before);
    expect(m.v.me.name).toBe('Марко');
  });
});

describe('stock change popups', () => {
  it('both players get a delta with what the actor gained and spent', async () => {
    await boot();
    const [a, b] = await pair();
    await throughHatch(a, b);
    await a.cmd({ c: 'act', id: 'scn_01' });
    await b.cmd({ c: 'accept' });
    for (let i = 0; i < 12; i++) {
      await settle(a, b);
      const sc = a.view!.scene;
      if (!sc) break;
      if (sc.kind === 'choice') await Promise.all([a.cmd({ c: 'choose', id: 'quiet' }), b.cmd({ c: 'choose', id: 'quiet' })]);
      else await Promise.all([a.cmd({ c: 'next' }), b.cmd({ c: 'next' })]);
    }
    const da = a.wait('delta');
    const db = b.wait('delta');
    expect((await b.cmd({ c: 'act', id: 'act_10' })).ok).toBe(true);
    const [ma, mb] = await Promise.all([da, db]);
    expect(ma.by).toBe('p2');
    expect(mb.items).toEqual([{ id: 'res_01', name: 'Дрова', n: 1 }]);
    expect(ma.together).toBe(false);
  });
});
