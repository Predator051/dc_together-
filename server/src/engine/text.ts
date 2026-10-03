import type { Cond, Gender, Para, Paras, Role, Text, TextVariant } from '../../../shared/src/content.js';

export interface Persona {
  name: string;
  gender: Gender;
  role: Role | null;
  joined: boolean;
}

const GENDER_RE = /\{(p:)?([^{}|]*)\|([^{}|]*)\}/g;

/** Pick the first variant whose condition passes. */
export function resolveText(text: Text | undefined, test: (c: Cond) => boolean): string {
  if (text === undefined) return '';
  if (typeof text === 'string') return text;
  for (const v of text) {
    if (!v.if || test(v.if)) return v.text;
  }
  return '';
}

export function resolveParas(paras: Paras | undefined, test: (c: Cond) => boolean): string[] {
  if (paras === undefined) return [];
  if (typeof paras === 'string') return [paras];
  const isVariant = (x: Para): x is TextVariant => typeof x === 'object' && !Array.isArray(x);
  if (paras.length > 0 && paras.every(isVariant)) {
    const one = resolveText(paras as TextVariant[], test);
    return one ? [one] : [];
  }
  const out: string[] = [];
  for (const p of paras) {
    if (typeof p === 'string') out.push(p);
    else if (Array.isArray(p)) {
      const one = resolveText(p, test);
      if (one) out.push(one);
    } else if (!p.if || test(p.if)) out.push(p.text);
  }
  return out;
}

/**
 * Fill placeholders:
 *  {name} / {partner}       — subject / partner names
 *  {m|f}  / {p:m|f}         — word form by subject / partner grammatical gender
 *  {role} / {p:role}        — role titles
 */
export function fill(
  template: string,
  subject: Persona,
  partner: Persona | null,
  roleTitles: Record<Role, { m: string; f: string }>,
  fallbackName: string,
): string {
  const partnerName = partner && partner.joined ? partner.name : fallbackName;
  const partnerGender: Gender = partner && partner.joined ? partner.gender : 'm';
  let out = template.replace(GENDER_RE, (_m, p: string | undefined, a: string, b: string) => {
    const g = p ? partnerGender : subject.gender;
    return g === 'f' ? b : a;
  });
  out = out
    .replaceAll('{name}', subject.name)
    .replaceAll('{partner}', partnerName)
    .replaceAll('{role}', subject.role ? roleTitles[subject.role][subject.gender] : '')
    .replaceAll('{p:role}', partner?.role ? roleTitles[partner.role][partner.gender] : '');
  return out;
}

/** Capitalise the first letter (useful when a template starts with a placeholder). */
export function cap(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}
