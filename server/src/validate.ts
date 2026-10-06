// Static content validator: IDs, references, scene graphs, flags, costs and reachability.

import type {
  ActionDef,
  Cond,
  Content,
  Effect,
  LogText,
  Para,
  Paras,
  SceneDef,
  SceneNode,
  Text,
  TextVariant,
} from '../../shared/src/content.js';

export interface Report {
  errors: string[];
  warnings: string[];
  reachable: { scenes: Set<string>; actions: Set<string>; locations: Set<string>; clues: Set<string>; flags: Set<string> };
}

// ---------- traversal helpers ----------

export function condsOf(c: Cond | undefined, out: Cond[] = []): Cond[] {
  if (!c) return out;
  out.push(c);
  if ('all' in c) c.all.forEach((x) => condsOf(x, out));
  if ('any' in c) c.any.forEach((x) => condsOf(x, out));
  if ('not' in c) condsOf(c.not, out);
  return out;
}

export function effectsOf(list: Effect[] | undefined, out: Effect[] = []): Effect[] {
  for (const e of list ?? []) {
    out.push(e);
    if ('if' in e) {
      effectsOf(e.then, out);
      effectsOf(e.else, out);
    }
  }
  return out;
}

function textConds(t: Text | Paras | Para | undefined, out: Cond[]): void {
  if (!t || typeof t === 'string') return;
  for (const x of t as Array<Para>) {
    if (typeof x === 'string') continue;
    if (Array.isArray(x)) textConds(x, out);
    else if ((x as TextVariant).if) condsOf((x as TextVariant).if, out);
  }
}

function logConds(l: LogText | undefined, out: Cond[]): void {
  if (!l) return;
  for (const f of [l.self, l.other, l.all]) {
    if (!f || typeof f === 'string') continue;
    for (const x of f) if (typeof x !== 'string' && x.if) condsOf(x.if, out);
  }
}

function nodeTargets(n: SceneNode): Array<string | null | undefined> {
  if (n.type === 'choice') return [...n.options.map((o) => o.next), n.mismatch, n.next];
  if (n.type === 'combat') return [n.win, n.lose];
  return [n.next, ...(n.goto ?? []).map((g) => g.next)];
}

function nodeEffects(n: SceneNode): Effect[] {
  const list = [...(n.effects ?? [])];
  if (n.type === 'choice') for (const o of n.options) list.push(...(o.effects ?? []));
  return effectsOf(list);
}

function sceneEffects(s: SceneDef): Effect[] {
  const out: Effect[] = [];
  for (const n of Object.values(s.nodes)) out.push(...nodeEffects(n));
  out.push(...effectsOf(s.onEnd));
  return out;
}

function actionEffects(a: ActionDef): Effect[] {
  const list = [...(a.effects ?? [])];
  for (const ch of a.chance ?? []) list.push(...(ch.effects ?? []));
  for (const b of a.beats ?? []) list.push(...(b.effects ?? []));
  return effectsOf(list);
}

// ---------- validation ----------

export function validateContent(c: Content): Report {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (m: string) => errors.push(m);

  // IDs
  const all = new Map<string, string>();
  const reg = (kind: string, id: string) => {
    if (all.has(id)) err(`Duplicate id ${id} (${kind} and ${all.get(id)})`);
    all.set(id, kind);
  };
  c.resources.forEach((r) => reg('resource', r.id));
  c.actions.forEach((a) => reg('action', a.id));
  c.pools.forEach((p) => reg('pool', p.id));
  c.locations.forEach((l) => reg('location', l.id));
  c.scenes.forEach((s) => reg('scene', s.id));
  c.encounters.forEach((e) => reg('encounter', e.id));
  c.clues.forEach((x) => reg('clue', x.id));
  c.mysteries.forEach((x) => reg('mystery', x.id));
  c.goals.forEach((x) => reg('goal', x.id));
  c.npcs.forEach((x) => reg('npc', x.id));

  const res = new Set(c.resources.map((r) => r.id));
  const locs = new Set(c.locations.map((l) => l.id));
  const scenes = new Map(c.scenes.map((s) => [s.id, s]));
  const clues = new Set(c.clues.map((x) => x.id));
  const mysteries = new Set(c.mysteries.map((x) => x.id));
  const npcs = new Set(c.npcs.map((x) => x.id));
  const encs = new Map(c.encounters.map((e) => [e.id, e]));
  const pools = new Set(c.pools.map((p) => p.pool));
  const areas = new Set(c.areas.map((a) => a.id));
  if (areas.size === 0) err('content: at least one area is required');
  for (const l of c.locations) if (l.area && !areas.has(l.area)) err(`location ${l.id}: unknown area ${l.area}`);

  const maxCap = (id: string): number => {
    const r = c.resources.find((x) => x.id === id);
    if (!r || r.cap === undefined) return Infinity;
    return r.cap + (r.capBonus ?? []).reduce((s, b) => s + b.add, 0);
  };
  const checkRes = (where: string, m: Record<string, unknown> | undefined) => {
    for (const k of Object.keys(m ?? {})) if (!res.has(k)) err(`${where}: unknown resource ${k}`);
  };
  const checkCost = (where: string, cost: Record<string, number> | undefined) => {
    checkRes(where, cost);
    for (const [k, n] of Object.entries(cost ?? {})) {
      if (!Number.isInteger(n) || n <= 0) err(`${where}: bad cost ${k}=${n}`);
      if (n > maxCap(k)) err(`${where}: cost ${k}=${n} exceeds storage cap ${maxCap(k)}`);
    }
  };

  // Flags written anywhere.
  const written = new Set<string>();
  const pwritten = new Set<string>();
  const collectWrites = (effs: Effect[]) => {
    for (const e of effs) {
      if ('set' in e) written.add(e.set);
      if ('inc' in e) written.add(e.inc);
      if ('pset' in e) pwritten.add(e.pset);
    }
  };
  for (const a of c.actions) {
    collectWrites(actionEffects(a));
    if (a.once) written.add(`built:${a.id}`);
    if (a.oncePerPlayer) pwritten.add(`built:${a.id}`);
  }
  for (const s of c.scenes) {
    collectWrites(sceneEffects(s));
    written.add(`done:${s.id}`);
    written.add(`count:${s.id}`);
    if (s.explores) written.add(`seen:${s.explores}`);
  }
  for (const e of c.encounters) {
    written.add(`${e.id}:killed`);
    written.add(`${e.id}:fled`);
  }

  const checkCond = (where: string, cond: Cond | undefined) => {
    for (const x of condsOf(cond)) {
      if ('flag' in x && !written.has(x.flag)) err(`${where}: reads flag "${x.flag}" that is never set`);
      if ('noFlag' in x && !written.has(x.noFlag)) err(`${where}: reads flag "${x.noFlag}" that is never set`);
      if ('pflag' in x && !pwritten.has(x.pflag)) err(`${where}: reads personal flag "${x.pflag}" that is never set`);
      if ('noPflag' in x && !pwritten.has(x.noPflag)) err(`${where}: reads personal flag "${x.noPflag}" that is never set`);
      if ('partnerPflag' in x && !pwritten.has(x.partnerPflag)) err(`${where}: reads personal flag "${x.partnerPflag}" that is never set`);
      if ('res' in x && !res.has(x.res)) err(`${where}: unknown resource ${x.res}`);
      if (('clue' in x && !clues.has(x.clue)) || ('anyClue' in x && !clues.has(x.anyClue))) err(`${where}: unknown clue`);
      if ('rel' in x && !npcs.has(x.rel)) err(`${where}: unknown npc ${x.rel}`);
      if (('at' in x && !areas.has(x.at)) || ('partnerAt' in x && !areas.has(x.partnerAt))) err(`${where}: unknown area`);
    }
  };
  const checkEffects = (where: string, effs: Effect[], inScene: boolean) => {
    for (const e of effs) {
      if ('if' in e) checkCond(where, e.if);
      if ('add' in e) checkRes(where, e.add);
      if ('take' in e) checkRes(where, e.take);
      if ('clue' in e && !clues.has(e.clue)) err(`${where}: unknown clue ${e.clue}`);
      if ('mystery' in e && !mysteries.has(e.mystery)) err(`${where}: unknown mystery ${e.mystery}`);
      if ('moveTo' in e && !areas.has(e.moveTo)) err(`${where}: unknown area ${e.moveTo}`);
      if (('rel' in e && !npcs.has(e.rel)) || ('meet' in e && !npcs.has(e.meet))) err(`${where}: unknown npc`);
      if ('scene' in e) {
        if (!scenes.has(e.scene)) err(`${where}: unknown scene ${e.scene}`);
        if (!inScene) err(`${where}: scenes may only be chained from scenes (solo actions must not start together-scenes)`);
      }
      if ('log' in e) {
        const cs: Cond[] = [];
        logConds(e.log, cs);
        cs.forEach((x) => checkCond(where, x));
      }
    }
  };

  // Daily rules
  for (const d of c.daily ?? []) {
    if (d.res && !res.has(d.res)) err(`daily: unknown resource ${d.res}`);
    if (d.per && !res.has(d.per)) err(`daily: unknown resource ${d.per}`);
    if (!d.res && !d.flag) err('daily: needs res or flag');
    checkCond('daily', d.if);
  }

  // Resources
  for (const r of c.resources) for (const b of r.capBonus ?? []) checkCond(`resource ${r.id}`, b.if);
  for (const [k] of Object.entries(c.start.resources)) if (!res.has(k)) err(`start: unknown resource ${k}`);

  // Locations
  for (const l of c.locations) {
    checkCond(`location ${l.id}`, l.visible);
    const cs: Cond[] = [];
    textConds(l.desc, cs);
    cs.forEach((x) => checkCond(`location ${l.id} desc`, x));
  }

  // Actions
  for (const a of c.actions) {
    const w = `action ${a.id}`;
    if (!locs.has(a.group)) err(`${w}: unknown group ${a.group}`);
    if (!(a.cooldown > 0)) err(`${w}: cooldown must be positive`);
    checkCost(w, a.cost);
    checkRes(w, a.yield);
    if (a.rollsPer && !res.has(a.rollsPer)) err(`${w}: unknown rollsPer ${a.rollsPer}`);
    for (const ch of a.chance ?? []) {
      checkRes(w, ch.add);
      checkCond(w, ch.if);
      if (ch.p <= 0 || ch.p > 1) err(`${w}: bad chance ${ch.p}`);
    }
    for (const b of a.beats ?? []) checkCond(w, b.if);
    checkCond(w, a.visible);
    checkCond(w, a.enabled);
    checkEffects(w, actionEffects(a), false);
    const logs = Array.isArray(a.log) ? a.log : a.log ? [a.log] : [];
    const cs: Cond[] = [];
    logs.forEach((l) => logConds(l, cs));
    (a.beats ?? []).forEach((b) => logConds(b.log, cs));
    cs.forEach((x) => checkCond(w, x));
    if (!a.log && !(a.beats && a.beats.length)) warnings.push(`${w}: no log text`);
  }

  // Pools
  for (const p of c.pools) {
    const w = `pool ${p.id}`;
    if (!locs.has(p.group)) err(`${w}: unknown group ${p.group}`);
    checkCost(w, p.cost);
    checkCond(w, p.visible);
    checkCond(w, p.enabled);
    if (!c.scenes.some((s) => s.pool === p.pool)) err(`${w}: no scenes in pool ${p.pool}`);
    if (!c.scenes.some((s) => s.pool === p.pool && s.once === false && !s.visible)) err(`${w}: pool ${p.pool} needs an always-available repeatable scene`);
  }

  // Scenes
  for (const s of c.scenes) {
    const w = `scene ${s.id}`;
    if (s.group && !locs.has(s.group)) err(`${w}: unknown group ${s.group}`);
    if (s.group && s.label === undefined) err(`${w}: has group but no label`);
    if (s.pool && !pools.has(s.pool)) err(`${w}: unknown pool ${s.pool}`);
    if (s.explores && !locs.has(s.explores)) err(`${w}: explores unknown location`);
    checkCost(w, s.cost);
    checkCond(w, s.visible);
    checkCond(w, s.enabled);
    if (!s.nodes[s.start]) err(`${w}: missing start node ${s.start}`);
    // graph
    const seenNodes = new Set<string>();
    const stack = [s.start];
    let canEnd = false;
    while (stack.length) {
      const id = stack.pop()!;
      if (seenNodes.has(id)) continue;
      seenNodes.add(id);
      const n = s.nodes[id];
      if (!n) {
        err(`${w}: link to missing node ${id}`);
        continue;
      }
      for (const t of nodeTargets(n)) {
        if (t === null || t === undefined) {
          if (n.type !== 'combat') canEnd = true;
          continue;
        }
        if (!s.nodes[t]) err(`${w}.${id}: link to missing node ${t}`);
        else stack.push(t);
      }
    }
    if (!canEnd) err(`${w}: no path ends the scene`);
    for (const id of Object.keys(s.nodes)) if (!seenNodes.has(id)) err(`${w}: node ${id} is unreachable`);
    for (const [id, n] of Object.entries(s.nodes)) {
      const nw = `${w}.${id}`;
      const cs: Cond[] = [];
      textConds(n.text, cs);
      textConds(n.hunter, cs);
      textConds(n.maker, cs);
      cs.forEach((x) => checkCond(nw, x));
      checkEffects(nw, nodeEffects(n), true);
      if (n.type === 'choice') {
        if (n.options.length === 0) err(`${nw}: choice without options`);
        const ids = new Set<string>();
        for (const o of n.options) {
          if (ids.has(o.id)) err(`${nw}: duplicate option ${o.id}`);
          ids.add(o.id);
          checkCond(nw, o.visible);
          checkCond(nw, o.enabled);
          if (n.mode === 'joint' && o.role) err(`${nw}: joint choice option ${o.id} limited to a role can never be agreed on`);
          if (n.mode === 'each' && o.next !== undefined) warnings.push(`${nw}: option next ignored in 'each' mode`);
        }
        if (n.mode === 'joint' && !n.mismatch) err(`${nw}: joint choice needs a mismatch node`);
        if (n.mode === 'each' && n.next === undefined) warnings.push(`${nw}: 'each' choice ends the scene`);
        if (n.mode === 'joint' && n.options.every((o) => o.visible || o.enabled)) warnings.push(`${nw}: every option is conditional`);
      }
      if (n.type === 'combat' && !encs.has(n.enc)) err(`${nw}: unknown encounter ${n.enc}`);
    }
    checkEffects(`${w}.onEnd`, effectsOf(s.onEnd), true);
  }

  // Encounters
  for (const e of c.encounters) {
    const w = `encounter ${e.id}`;
    const ids = new Set<string>();
    for (const o of [...e.options, e.downOption]) {
      if (ids.has(o.id)) err(`${w}: duplicate option ${o.id}`);
      ids.add(o.id);
      checkCost(`${w}.${o.id}`, o.cost);
      checkCond(`${w}.${o.id}`, o.visible);
    }
    if (e.ally) checkCond(w, e.ally.if);
    if (e.armor) checkCond(w, e.armor.if);
    if (!e.options.some((o) => !o.visible && !o.cost && (o.dmg || o.fear))) err(`${w}: needs an always-available attacking option`);
  }

  // Goals, NPCs, clues
  for (const g of c.goals) checkCond(`goal ${g.id}`, g.when);
  if (c.goals.length && c.goals[c.goals.length - 1]!.when) err('goals: the last goal must be an unconditional fallback');
  for (const x of c.clues) if (x.mystery && !mysteries.has(x.mystery)) err(`clue ${x.id}: unknown mystery`);
  for (const n of c.npcs) {
    const cs: Cond[] = [];
    textConds(n.desc, cs);
    cs.forEach((x) => checkCond(`npc ${n.id}`, x));
  }

  // Ambience (visual only)
  if (c.ambient) {
    const actionIds = new Set(c.actions.map((a) => a.id));
    for (const k of Object.keys(c.ambient.areas)) if (!areas.has(k)) err(`ambient: unknown area ${k}`);
    for (const k of Object.keys(c.ambient.fires ?? {})) if (!areas.has(k)) err(`ambient fires: unknown area ${k}`);
    for (const [k, cond] of Object.entries(c.ambient.fires ?? {})) checkCond(`ambient fire ${k}`, cond);
    (c.ambient.overrides ?? []).forEach((o, i) => checkCond(`ambient override ${i}`, o.when));
    for (const k of Object.keys(c.ambient.actions)) if (!actionIds.has(k)) err(`ambient: unknown action ${k}`);
  }

  const reachable = simulate(c);
  for (const s of c.scenes) if (!reachable.scenes.has(s.id)) err(`scene ${s.id} is unreachable`);
  for (const a of c.actions) if (!reachable.actions.has(a.id)) err(`action ${a.id} is unreachable`);
  for (const l of c.locations) if (!reachable.locations.has(l.id)) err(`location ${l.id} is never visible`);
  for (const x of c.clues) if (!reachable.clues.has(x.id)) err(`clue ${x.id} is never granted`);
  for (const act of Object.keys(c.actEnd)) if (!reachable.flags.has(`act:${act}`)) err(`act ${act} cannot be finished`);

  return { errors, warnings, reachable };
}

/** Optimistic fixpoint: what can ever become available. */
function simulate(c: Content) {
  const flags = new Set<string>(['built:none']);
  const pflags = new Set<string>();
  const have = new Set<string>(Object.entries(c.start.resources).filter(([, n]) => n > 0).map(([k]) => k));
  const gotClues = new Set<string>();
  const scenes = new Set<string>();
  const actions = new Set<string>();
  const locations = new Set<string>();

  const ok = (cond: Cond | undefined): boolean => {
    if (!cond) return true;
    if ('all' in cond) return cond.all.every(ok);
    if ('any' in cond) return cond.any.some(ok);
    if ('not' in cond) return true;
    if ('flag' in cond) return (cond.lt !== undefined && cond.gte === undefined) || flags.has(cond.flag);
    if ('pflag' in cond) return pflags.has(cond.pflag);
    if ('partnerPflag' in cond) return pflags.has(cond.partnerPflag);
    if ('res' in cond) return cond.gte === undefined || cond.gte <= 0 || have.has(cond.res);
    if ('clue' in cond) return gotClues.has(cond.clue);
    if ('anyClue' in cond) return gotClues.has(cond.anyClue);
    if ('stove' in cond) return cond.stove === 'never' || flags.has('stove');
    return true;
  };
  const canPay = (cost: Record<string, number> | undefined) => Object.keys(cost ?? {}).every((k) => have.has(k));
  const absorb = (effs: Effect[]) => {
    let changed = false;
    const add = (set: Set<string>, v: string) => {
      if (!set.has(v)) {
        set.add(v);
        changed = true;
      }
    };
    for (const e of effs) {
      if ('set' in e) add(flags, e.set);
      if ('inc' in e) add(flags, e.inc);
      if ('pset' in e) add(pflags, e.pset);
      if ('add' in e) for (const [k, n] of Object.entries(e.add)) if (n > 0) add(have, k);
      if ('clue' in e) add(gotClues, e.clue);
      if ('stove' in e) add(flags, 'stove');
      if ('actDone' in e) add(flags, `act:${e.actDone}`);
    }
    return changed;
  };

  let changed = true;
  while (changed) {
    changed = false;
    const mark = (set: Set<string>, v: string) => {
      if (!set.has(v)) {
        set.add(v);
        changed = true;
      }
    };
    for (const l of c.locations) if (ok(l.visible)) mark(locations, l.id);
    for (const a of c.actions) {
      if (!locations.has(a.group) || !ok(a.visible) || !ok(a.enabled) || !canPay(a.cost)) continue;
      mark(actions, a.id);
      for (const [k] of Object.entries(a.yield ?? {})) mark(have, k);
      for (const ch of a.chance ?? []) for (const [k, n] of Object.entries(ch.add ?? {})) if (n > 0) mark(have, k);
      if (a.once) mark(flags, `built:${a.id}`);
      if (a.oncePerPlayer) mark(pflags, `built:${a.id}`);
      if (absorb(actionEffects(a))) changed = true;
    }
    const poolOpen = new Set<string>();
    for (const p of c.pools) if (locations.has(p.group) && ok(p.visible) && ok(p.enabled) && canPay(p.cost)) poolOpen.add(p.pool);
    for (const s of c.scenes) {
      const startable =
        scenes.has(s.id) ||
        (s.pool
          ? poolOpen.has(s.pool) && ok(s.visible)
          : s.group
            ? locations.has(s.group) && ok(s.visible) && ok(s.enabled) && canPay(s.cost)
            : false);
      if (!startable) continue;
      mark(scenes, s.id);
      if (absorb(sceneEffects(s))) changed = true;
      mark(flags, `done:${s.id}`);
      mark(flags, `count:${s.id}`);
      if (s.explores) mark(flags, `seen:${s.explores}`);
      for (const n of Object.values(s.nodes)) if (n.type === 'combat') {
        mark(flags, `${n.enc}:killed`);
        mark(flags, `${n.enc}:fled`);
      }
      // Scenes chained by effects become reachable too.
      for (const e of sceneEffects(s)) if ('scene' in e && scenes.has(e.scene) === false && c.scenes.some((x) => x.id === e.scene)) mark(scenes, e.scene);
    }
  }
  return { scenes, actions, locations, clues: gotClues, flags };
}
