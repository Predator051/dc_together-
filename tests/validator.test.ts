import { describe, expect, it } from 'vitest';
import type { Content } from '../shared/src/content.js';
import { content } from '../content/index.js';
import { validateContent } from '../server/src/validate.js';

const clone = (): Content => structuredClone(content);

describe('content validator', () => {
  it('real content has no errors', () => {
    const r = validateContent(content);
    expect(r.errors).toEqual([]);
  });

  it('detects duplicate ids', () => {
    const c = clone();
    c.actions.push({ ...c.actions[0]! });
    expect(validateContent(c).errors.some((e) => e.includes('Duplicate id'))).toBe(true);
  });

  it('detects broken scene links and unreachable nodes', () => {
    const c = clone();
    const s = c.scenes.find((x) => x.id === 'scn_02')!;
    (s.nodes.n1 as { next?: string }).next = 'nope';
    s.nodes.orphan = { text: 'Сирота', next: null };
    const errs = validateContent(c).errors;
    expect(errs.some((e) => e.includes('missing node nope'))).toBe(true);
    expect(errs.some((e) => e.includes('node orphan is unreachable'))).toBe(true);
  });

  it('detects flags that are read but never set (impossible conditions)', () => {
    const c = clone();
    c.scenes.find((x) => x.id === 'scn_02')!.visible = { flag: 'never_set_anywhere' };
    const errs = validateContent(c).errors;
    expect(errs.some((e) => e.includes('never_set_anywhere'))).toBe(true);
    expect(errs.some((e) => e.includes('scene scn_02 is unreachable'))).toBe(true);
  });

  it('detects circular requirements', () => {
    const c = clone();
    const a = c.actions.find((x) => x.id === 'act_14')!;
    a.visible = { flag: 'loop_flag' };
    a.effects = [...(a.effects ?? []), { set: 'loop_flag' }];
    expect(validateContent(c).errors).toContain('action act_14 is unreachable');
  });

  it('detects costs above storage caps and unknown references', () => {
    const c = clone();
    c.actions.find((x) => x.id === 'act_05')!.cost = { res_01: 999, res_99: 1 };
    const errs = validateContent(c).errors;
    expect(errs.some((e) => e.includes('exceeds storage cap'))).toBe(true);
    expect(errs.some((e) => e.includes('unknown resource res_99'))).toBe(true);
  });

  it('detects joint choices without mismatch and role-locked joint options', () => {
    const c = clone();
    const s = c.scenes.find((x) => x.id === 'scn_01')!;
    const n = s.nodes.n3 as { mismatch?: string; options: Array<{ role?: string }> };
    delete n.mismatch;
    n.options[0]!.role = 'hunter';
    const errs = validateContent(c).errors;
    expect(errs.some((e) => e.includes('needs a mismatch node'))).toBe(true);
    expect(errs.some((e) => e.includes('can never be agreed on'))).toBe(true);
  });

  it('forbids starting together-scenes from solo actions', () => {
    const c = clone();
    c.actions.find((x) => x.id === 'act_10')!.effects = [{ scene: 'scn_02' }];
    expect(validateContent(c).errors.some((e) => e.includes('solo actions must not start'))).toBe(true);
  });

  it('every act end is reachable', () => {
    const r = validateContent(content);
    expect(r.reachable.flags.has('act:1')).toBe(true);
  });
});
