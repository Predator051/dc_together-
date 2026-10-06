import { describe, expect, it } from 'vitest';
import { content } from '../content/index.js';
import { validateContent } from '../server/src/validate.js';
import { World } from './harness.js';

describe('visual ambience', () => {
  it('follows the place, the light and the running action', () => {
    const w = new World(4);
    w.join('Марко', 'm', 'hunter');
    w.join('Оксана', 'f', 'maker');
    w.online('p1');
    w.online('p2');
    expect(w.view('p1').ambient).toEqual({ kind: 'cellar', fire: 'none', fx: null, partnerFx: null, fxUntil: 0, partnerFxUntil: 0 });

    // The candle in the cellar.
    for (const pid of ['p1', 'p2'] as const) {
      w.cmd(pid, { c: 'act', id: 'act_p1' });
      w.advance(5000);
      w.cmd(pid, { c: 'act', id: 'act_p2' });
      w.advance(5000);
    }
    w.cmd('p1', { c: 'act', id: 'act_p3' });
    w.advance(5000);
    expect(w.cmd('p1', { c: 'act', id: 'act_p4' }).ok).toBe(true);
    // Lighting the candle shows its accent to the one doing it and, nearby, to the partner.
    expect(w.view('p1').ambient.fx).toBe('flint');
    expect(w.view('p2').ambient.partnerFx).toBe('flint');
    // the end time lets the client stop the accent on time
    expect(w.view('p1').ambient.fxUntil).toBe(w.view('p1').busyUntil);
    expect(w.view('p2').ambient.partnerFxUntil).toBe(w.view('p1').busyUntil);
    w.advance(5000);
    expect(w.view('p1').ambient).toMatchObject({ kind: 'candle', fx: null });
  });

  it('a partner who is offline shows no accent', () => {
    const w = new World(5);
    w.join('Марко', 'm', 'hunter');
    w.join('Оксана', 'f', 'maker');
    w.online('p1');
    w.online('p2');
    w.cmd('p1', { c: 'act', id: 'act_p1' });
    expect(w.view('p2').ambient.partnerFx).toBe('breath');
    w.online('p1', false);
    expect(w.view('p2').ambient.partnerFx).toBeNull();
  });

  it('every action has its own sound', () => {
    const missing = content.actions.filter((a) => !content.ambient!.actions[a.id]).map((a) => a.id);
    expect(missing).toEqual([]);
  });

  it('the validator catches unknown actions and areas in the ambience', () => {
    const broken = {
      ...content,
      ambient: { ...content.ambient!, areas: { ...content.ambient!.areas, nowhere: 'snow' as const }, actions: { act_zz: 'chop' as const } },
    };
    const r = validateContent(broken);
    expect(r.errors.some((e) => e.includes('unknown area nowhere'))).toBe(true);
    expect(r.errors.some((e) => e.includes('unknown action act_zz'))).toBe(true);
  });
});
