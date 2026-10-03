import { describe, expect, it } from 'vitest';
import { T } from '../client/src/strings.js';
import { content } from '../content/index.js';
import { checkUkrainian, collectStrings } from '../server/src/textscan.js';
import { readFileSync } from 'node:fs';

describe('player-visible text is Ukrainian', () => {
  it('content strings', () => {
    const found = collectStrings(content);
    expect(found.length).toBeGreaterThan(300);
    const bad = found
      .map((f) => ({ ...f, problems: checkUkrainian(f.text) }))
      .filter((f) => f.problems.length)
      .map((f) => `${f.where}: ${f.problems.join(', ')} :: ${f.text.slice(0, 80)}`);
    expect(bad).toEqual([]);
  });

  it('client interface strings', () => {
    const bad = Object.entries(T)
      .map(([k, v]) => ({ k, problems: checkUkrainian(v, [/XXXX-XXXX/]) }))
      .filter((x) => x.problems.length)
      .map((x) => `${x.k}: ${x.problems.join(', ')}`);
    expect(bad).toEqual([]);
  });

  it('server error messages', () => {
    const src = readFileSync(new URL('../server/src/game-server.ts', import.meta.url), 'utf8');
    const block = src.slice(src.indexOf('const ERR_TEXT'), src.indexOf('};', src.indexOf('const ERR_TEXT')));
    const texts = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
    expect(texts.length).toBeGreaterThan(5);
    for (const t of texts) expect(checkUkrainian(t), t).toEqual([]);
  });

  it('the checker catches typical problems', () => {
    expect(checkUkrainian('')).toContain('empty');
    expect(checkUkrainian('Это текст')).toContain('Russian letters');
    expect(checkUkrainian('Ти вибачаюсь')).not.toEqual([]);
    expect(checkUkrainian('Він відкрив двері')).not.toEqual([]);
    expect(checkUkrainian('Hello світ')).toContain('Latin letters');
    expect(checkUkrainian('{name} {пішов|пішла} додому.')).toEqual([]);
    expect(checkUkrainian('Зламаний {шаблон')).toContain('broken placeholder');
  });
});
