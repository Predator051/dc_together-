import type {
  ActionDef,
  ChoiceNode,
  CombatNode,
  CombatOptionDef,
  Cond,
  Content,
  DelveActDef,
  DelveExitDef,
  DelveMapDef,
  DelveNode,
  Effect,
  EncounterDef,
  Gender,
  LogLine,
  LogText,
  OptionDef,
  PlayerId,
  PoolActionDef,
  Role,
  SceneDef,
  SceneNode,
  StealthNode,
  Text,
  TextNode,
} from '../../../shared/src/content.js';
import { PLAYER_IDS } from '../../../shared/src/content.js';
import type { Command } from '../../../shared/src/protocol.js';
import { Rng } from '../../../shared/src/rng.js';
import type { LogEntry, PlayerState, WorldState } from '../../../shared/src/state.js';
import { STATE_VERSION } from '../../../shared/src/state.js';

/** How long a player must have been gone to get a summary on return. */
export const WELCOME_AFTER = 3 * 60 * 1000;
import { cap, fill, resolveText, type Persona } from './text.js';

export const LOG_LIMIT = 400;

/** Hand signs players can show each other (learned from the old beekeeper). */
export const SIGNS = ['stop', 'go', 'quiet', 'danger', 'here'];

// ---------------------------------------------------------------------------
// Content index
// ---------------------------------------------------------------------------

export type Entry =
  | { kind: 'act'; def: ActionDef }
  | { kind: 'scene'; def: SceneDef }
  | { kind: 'pool'; def: PoolActionDef };

export class ContentIndex {
  readonly res = new Map<string, Content['resources'][number]>();
  readonly actions = new Map<string, ActionDef>();
  readonly pools = new Map<string, PoolActionDef>();
  readonly locations = new Map<string, Content['locations'][number]>();
  readonly scenes = new Map<string, SceneDef>();
  readonly enc = new Map<string, EncounterDef>();
  readonly clues = new Map<string, Content['clues'][number]>();
  readonly mysteries = new Map<string, Content['mysteries'][number]>();
  readonly goals = new Map<string, Content['goals'][number]>();
  readonly npcs = new Map<string, Content['npcs'][number]>();
  readonly maps = new Map<string, DelveMapDef>();

  constructor(readonly c: Content) {
    for (const r of c.resources) this.res.set(r.id, r);
    for (const a of c.actions) this.actions.set(a.id, a);
    for (const p of c.pools) this.pools.set(p.id, p);
    for (const l of c.locations) this.locations.set(l.id, l);
    for (const s of c.scenes) this.scenes.set(s.id, s);
    for (const e of c.encounters) this.enc.set(e.id, e);
    for (const x of c.clues) this.clues.set(x.id, x);
    for (const m of c.mysteries) this.mysteries.set(m.id, m);
    for (const g of c.goals) this.goals.set(g.id, g);
    for (const n of c.npcs) this.npcs.set(n.id, n);
    for (const m of c.maps ?? []) this.maps.set(m.id, m);
  }

  entry(id: string): Entry | null {
    const a = this.actions.get(id);
    if (a) return { kind: 'act', def: a };
    const s = this.scenes.get(id);
    if (s && s.label !== undefined) return { kind: 'scene', def: s };
    const p = this.pools.get(id);
    if (p) return { kind: 'pool', def: p };
    return null;
  }

  ui(key: string): string {
    return this.c.ui[key] ?? key;
  }

  get homeArea(): string {
    return this.c.areas[0]?.id ?? 'home';
  }

  /** Area of a location / group id. */
  areaOf(group: string | undefined): string {
    if (!group) return this.homeArea;
    return this.locations.get(group)?.area ?? this.homeArea;
  }

  areaWhere(area: string): string {
    return this.c.areas.find((a) => a.id === area)?.where ?? area;
  }
}

// ---------------------------------------------------------------------------
// Game context for one operation
// ---------------------------------------------------------------------------

export interface Result {
  ok: boolean;
  err?: string;
}

const OK: Result = { ok: true };

export class Game {
  readonly rng: Rng;
  /** Scenes queued by effects; started when the current scene ends. */
  private chain: string[] = [];

  constructor(
    readonly ix: ContentIndex,
    readonly s: WorldState,
    readonly now: number,
  ) {
    this.rng = new Rng(s.meta.rng);
  }

  /** Persist RNG state and derived state back into the world. Call after every operation. */
  commit(): void {
    if (!this.s.scene && this.chain.length) this.startScene(this.chain.shift()!);
    this.updateGoal();
    this.s.meta.rng = this.rng.state;
  }

  currentGoal(): string | null {
    for (const g of this.ix.c.goals) if (!g.when || this.test(g.when)) return g.id;
    return null;
  }

  private updateGoal(): void {
    const id = this.currentGoal();
    if (id === this.s.goal) return;
    this.s.goal = id;
    const g = id ? this.ix.goals.get(id) : undefined;
    if (!g) return;
    const text: Partial<Record<PlayerId, string>> = {};
    for (const pid of this.joinedIds()) text[pid] = `${this.ix.ui('goal_prefix')} ${this.render(g.text, pid)}`;
    this.logRaw('system', text);
  }

  fail(key: string): Result {
    return { ok: false, err: this.ix.ui(key) };
  }

  // ----- players -------------------------------------------------------------

  p(pid: PlayerId): PlayerState {
    return this.s.players[pid];
  }

  other(pid: PlayerId): PlayerId {
    return pid === 'p1' ? 'p2' : 'p1';
  }

  persona(pid: PlayerId): Persona {
    const p = this.p(pid);
    return { name: p.name, gender: p.gender, role: p.role, joined: p.joined };
  }

  pidByRole(role: Role): PlayerId | null {
    for (const pid of PLAYER_IDS) if (this.p(pid).joined && this.p(pid).role === role) return pid;
    return null;
  }

  bothOnline(): boolean {
    return PLAYER_IDS.every((pid) => this.p(pid).joined && this.p(pid).online);
  }

  joinedIds(): PlayerId[] {
    return PLAYER_IDS.filter((pid) => this.p(pid).joined);
  }

  // ----- conditions ----------------------------------------------------------

  flag(name: string): number {
    return this.s.flags[name] ?? 0;
  }

  test(c: Cond, pid?: PlayerId): boolean {
    if ('all' in c) return c.all.every((x) => this.test(x, pid));
    if ('any' in c) return c.any.some((x) => this.test(x, pid));
    if ('not' in c) return !this.test(c.not, pid);
    if ('flag' in c) {
      const v = this.flag(c.flag);
      if (c.gte === undefined && c.lt === undefined) return v !== 0;
      if (c.gte !== undefined && v < c.gte) return false;
      if (c.lt !== undefined && v >= c.lt) return false;
      return true;
    }
    if ('noFlag' in c) return this.flag(c.noFlag) === 0;
    if ('pflag' in c) return pid ? (this.p(pid).flags[c.pflag] ?? 0) !== 0 : false;
    if ('noPflag' in c) return pid ? (this.p(pid).flags[c.noPflag] ?? 0) === 0 : true;
    if ('partnerPflag' in c) return pid ? (this.p(this.other(pid)).flags[c.partnerPflag] ?? 0) !== 0 : false;
    if ('res' in c) {
      const v = this.s.res[c.res] ?? 0;
      if (c.gte !== undefined && v < c.gte) return false;
      if (c.lt !== undefined && v >= c.lt) return false;
      return true;
    }
    if ('day' in c) return this.s.meta.day >= c.day;
    if ('role' in c) return pid ? this.p(pid).role === c.role : false;
    if ('clue' in c) return pid ? (this.s.clues[c.clue]?.who.includes(pid) ?? false) : false;
    if ('anyClue' in c) return (this.s.clues[c.anyClue]?.who.length ?? 0) > 0;
    if ('partnerJoined' in c) return pid ? this.p(this.other(pid)).joined === c.partnerJoined : false;
    if ('partnerOnline' in c) {
      if (!pid) return false;
      const o = this.p(this.other(pid));
      return (o.joined && o.online) === c.partnerOnline;
    }
    if ('stove' in c) return this.stoveState() === c.stove || (c.stove === 'warm' && this.stoveState() === 'low');
    if ('at' in c) return pid ? this.p(pid).at === c.at : false;
    if ('partnerAt' in c) return pid ? this.p(this.other(pid)).at === c.partnerAt : false;
    if ('rel' in c) {
      const v = this.s.npcs[c.rel]?.rel ?? 0;
      if (c.gte !== undefined && v < c.gte) return false;
      if (c.lt !== undefined && v >= c.lt) return false;
      return true;
    }
    return false;
  }

  // ----- text ----------------------------------------------------------------

  /** Render `text` for `viewer`, with `subject` as the grammatical subject. */
  render(text: Text | undefined, viewer: PlayerId, subject: PlayerId = viewer): string {
    const raw = resolveText(text, (c) => this.test(c, viewer));
    const partner = subject === viewer ? this.other(viewer) : viewer;
    return cap(fill(raw, this.persona(subject), this.persona(partner), this.ix.c.roleTitles, this.ix.ui('someone')));
  }

  roleTitle(pid: PlayerId): string {
    const p = this.p(pid);
    return p.role ? this.ix.c.roleTitles[p.role][p.gender] : '';
  }

  // ----- log -----------------------------------------------------------------

  /** Resolve a random pool to a single Text (picked once per call so all viewers agree). */
  private pool(line: LogLine | undefined, viewer: PlayerId): Text | undefined {
    if (line === undefined || typeof line === 'string') return line;
    if (line.every((x) => typeof x === 'object')) return line as Text;
    const eligible = line.filter((x) => typeof x === 'string' || !x.if || this.test(x.if, viewer));
    if (eligible.length === 0) return undefined;
    const pick = this.rng.pick(eligible);
    return typeof pick === 'string' ? pick : pick.text;
  }

  /** Render a LogText into per-player strings. */
  renderLog(lt: LogText, actor?: PlayerId): Partial<Record<PlayerId, string>> {
    const text: Partial<Record<PlayerId, string>> = {};
    const ids = this.joinedIds();
    const self = actor ? this.pool(lt.self, actor) : undefined;
    const other = actor ? this.pool(lt.other, this.other(actor)) : undefined;
    const all = this.pool(lt.all, ids[0] ?? 'p1');
    for (const pid of ids) {
      let t = '';
      if (actor && pid === actor && self !== undefined) t = this.render(self, pid, pid);
      else if (actor && pid !== actor && other !== undefined) t = this.render(other, pid, actor);
      else if (all !== undefined) t = this.render(all, pid, pid);
      if (t) text[pid] = t;
    }
    return text;
  }

  log(lt: LogText, actor?: PlayerId): void {
    const text = this.renderLog(lt, actor);
    if (Object.keys(text).length === 0) return;
    const kind = lt.kind ?? (lt.all !== undefined && !actor ? 'story' : 'act');
    this.pushLog({ id: this.s.meta.nextLogId++, t: this.now, kind, actor, text });
  }

  /** Log with explicit per-player strings. */
  logRaw(kind: LogEntry['kind'], text: Partial<Record<PlayerId, string>>, actor?: PlayerId): void {
    if (Object.keys(text).length === 0) return;
    this.pushLog({ id: this.s.meta.nextLogId++, t: this.now, kind, actor, text });
  }

  private pushLog(e: LogEntry): void {
    this.s.log.push(e);
    if (this.s.log.length > LOG_LIMIT) this.s.log.splice(0, this.s.log.length - LOG_LIMIT);
  }

  // ----- resources -----------------------------------------------------------

  cap(resId: string): number {
    const def = this.ix.res.get(resId);
    if (!def || def.cap === undefined) return Number.POSITIVE_INFINITY;
    let cap = def.cap;
    for (const b of def.capBonus ?? []) if (this.test(b.if)) cap += b.add;
    return cap;
  }

  addRes(resId: string, n: number): number {
    const before = this.s.res[resId] ?? 0;
    const after = Math.max(0, Math.min(this.cap(resId), before + n));
    this.s.res[resId] = after;
    if (after > 0) this.s.seenRes[resId] = 1;
    return after - before;
  }

  hasCost(cost: Record<string, number> | undefined): boolean {
    if (!cost) return true;
    return Object.entries(cost).every(([r, n]) => (this.s.res[r] ?? 0) >= n);
  }

  payCost(cost: Record<string, number> | undefined): void {
    if (!cost) return;
    for (const [r, n] of Object.entries(cost)) this.s.res[r] = (this.s.res[r] ?? 0) - n;
  }

  // ----- stove ---------------------------------------------------------------

  stoveState(): 'never' | 'warm' | 'low' | 'cold' {
    const st = this.s.stove;
    if (!st.lit) return 'never';
    if (st.fuel <= 0) return 'cold';
    if (st.fuel <= this.ix.c.stove.low) return 'low';
    return 'warm';
  }

  /** Cold stove slows work, but only at home where the stove is. */
  cooldownMult(area: string = this.ix.homeArea): number {
    return area === this.ix.homeArea && this.stoveState() === 'cold' ? this.ix.c.stove.coldPenalty : 1;
  }

  // ----- effects -------------------------------------------------------------

  apply(effects: Effect[] | undefined, actor?: PlayerId): void {
    if (!effects) return;
    for (const e of effects) this.applyOne(e, actor);
  }

  private targets(who: 'actor' | 'both' | Role | undefined, actor?: PlayerId): PlayerId[] {
    if (who === 'both') return this.joinedIds();
    if (who === 'hunter' || who === 'maker') {
      const pid = this.pidByRole(who);
      return pid ? [pid] : [];
    }
    if (actor) return [actor];
    return this.joinedIds();
  }

  private applyOne(e: Effect, actor?: PlayerId): void {
    if ('if' in e) {
      const pass = this.test(e.if, actor);
      this.apply(pass ? e.then : e.else, actor);
      return;
    }
    if ('set' in e) {
      this.s.flags[e.set] = e.value ?? 1;
      return;
    }
    if ('unset' in e) {
      delete this.s.flags[e.unset];
      return;
    }
    if ('inc' in e) {
      this.s.flags[e.inc] = this.flag(e.inc) + (e.by ?? 1);
      return;
    }
    if ('pset' in e) {
      for (const pid of this.targets(e.who, actor)) this.p(pid).flags[e.pset] = e.value ?? 1;
      return;
    }
    if ('add' in e) {
      for (const [r, n] of Object.entries(e.add)) this.addRes(r, n);
      return;
    }
    if ('take' in e) {
      for (const [r, n] of Object.entries(e.take)) this.addRes(r, -n);
      return;
    }
    if ('clue' in e) {
      this.grantClue(e.clue);
      return;
    }
    if ('log' in e) {
      this.log(e.log, actor);
      return;
    }
    if ('mystery' in e) {
      this.s.mysteries[e.mystery] = Math.max(this.s.mysteries[e.mystery] ?? 0, e.level);
      return;
    }
    if ('rel' in e) {
      const n = (this.s.npcs[e.rel] ??= { met: false, rel: 0 });
      n.rel += e.by;
      return;
    }
    if ('meet' in e) {
      const n = (this.s.npcs[e.meet] ??= { met: false, rel: 0 });
      n.met = true;
      return;
    }
    if ('scene' in e) {
      this.chain.push(e.scene);
      return;
    }
    if ('advanceDay' in e) {
      this.s.meta.day += 1;
      this.s.meta.dayAt = this.now;
      const text: Partial<Record<PlayerId, string>> = {};
      for (const pid of this.joinedIds()) text[pid] = `${this.ix.ui('new_day')} ${this.s.meta.day}.`;
      this.logRaw('system', text);
      this.applyDaily();
      return;
    }
    if ('heal' in e) {
      for (const pid of this.joinedIds()) {
        const p = this.p(pid);
        p.hp = e.heal === 'full' ? p.hpMax : Math.min(p.hpMax, p.hp + e.heal);
      }
      return;
    }
    if ('stove' in e) {
      const st = this.s.stove;
      const max = this.ix.c.stove.maxWood * this.ix.c.stove.perWood;
      st.lit = true;
      st.fuel = Math.min(max, Math.max(0, st.fuel) + e.stove * this.ix.c.stove.perWood);
      return;
    }
    if ('actDone' in e) {
      this.s.meta.actDone = Math.max(this.s.meta.actDone, e.actDone);
      return;
    }
    if ('startAct' in e) {
      this.s.meta.act = Math.max(this.s.meta.act, e.startAct);
      return;
    }
    if ('moveTo' in e) {
      for (const pid of this.targets(e.who ?? 'actor', actor)) this.p(pid).at = e.moveTo;
      this.s.proposal = null;
      return;
    }
  }

  /** Daily rules: work of the community, cooling of alarms, etc. */
  private applyDaily(): void {
    const gained: Record<string, number> = {};
    for (const d of this.ix.c.daily ?? []) {
      if (d.if && !this.test(d.if)) continue;
      const amount = d.add * (d.per ? (this.s.res[d.per] ?? 0) : 1);
      if (!amount) continue;
      if (d.res) {
        const got = this.addRes(d.res, amount);
        if (got > 0) gained[d.res] = (gained[d.res] ?? 0) + got;
      }
      if (d.flag) this.s.flags[d.flag] = Math.max(d.min ?? 0, this.flag(d.flag) + amount);
    }
    const parts = Object.entries(gained).map(([r, n]) => `${this.ix.res.get(r)?.name ?? r} +${n}`);
    if (parts.length) {
      const text: Partial<Record<PlayerId, string>> = {};
      for (const pid of this.joinedIds()) text[pid] = `${this.ix.ui('daily_work')} ${parts.join(', ')}.`;
      this.logRaw('system', text);
    }
  }

  grantClue(id: string): void {
    const def = this.ix.clues.get(id);
    if (!def) return;
    const who = def.to === 'both' ? this.joinedIds() : this.targets(def.to);
    if (def.mystery) this.s.mysteries[def.mystery] = Math.max(this.s.mysteries[def.mystery] ?? 0, 1);
    const rec = (this.s.clues[id] ??= { who: [], at: this.now });
    const fresh: PlayerId[] = [];
    for (const pid of who) {
      if (!rec.who.includes(pid)) {
        rec.who.push(pid);
        fresh.push(pid);
      }
    }
    if (fresh.length) {
      const text: Partial<Record<PlayerId, string>> = {};
      for (const pid of fresh) text[pid] = `${this.ix.ui('new_clue')} «${def.title}»`;
      this.logRaw('find', text);
    }
  }

  // ----- routine actions -----------------------------------------------------

  actionVisible(a: ActionDef, pid: PlayerId): boolean {
    if (this.ix.areaOf(a.group) !== this.p(pid).at) return false;
    if (a.role && this.p(pid).role !== a.role) return false;
    if (a.once && this.flag(`built:${a.id}`)) return false;
    if (a.oncePerPlayer && this.p(pid).flags[`built:${a.id}`]) return false;
    if (a.visible && !this.test(a.visible, pid)) return false;
    return true;
  }

  /** Why the action can't be done right now (null = can). Cooldown is reported separately. */
  actionBlock(a: ActionDef, pid: PlayerId): string | null {
    if (this.sceneBlocksRoutine()) return this.ix.ui('err_in_scene');
    if (a.enabled && !this.test(a.enabled, pid)) return a.disabledHint ? this.render(a.disabledHint, pid) : this.ix.ui('err_not_now');
    if (!this.hasCost(a.cost)) return this.ix.ui('err_cost');
    if (a.yield && !a.effects && !a.chance) {
      const allFull = Object.keys(a.yield).every((r) => (this.s.res[r] ?? 0) >= this.cap(r));
      if (allFull) return this.ix.ui('err_full');
    }
    return null;
  }

  sceneBlocksRoutine(): boolean {
    return !!this.s.scene && !this.s.scene.paused;
  }

  doAction(pid: PlayerId, a: ActionDef): Result {
    if (!this.actionVisible(a, pid)) return this.fail('err_not_now');
    const block = this.actionBlock(a, pid);
    if (block) return { ok: false, err: block };
    const p = this.p(pid);
    if (p.busy && p.busy.until > this.now) return this.fail('err_busy');
    const readyAt = p.cooldowns[a.id] ?? 0;
    if (readyAt > this.now) return this.fail('err_cooldown');

    this.payCost(a.cost);
    const rolls = a.rollsPer ? Math.max(1, this.s.res[a.rollsPer] ?? 0) : 1;
    const gained: Record<string, number> = {};
    for (let i = 0; i < rolls; i++) {
      for (const [r, y] of Object.entries(a.yield ?? {})) {
        const n = Array.isArray(y) ? this.rng.int(y[0], y[1]) : y;
        if (n) gained[r] = (gained[r] ?? 0) + this.addRes(r, n);
      }
    }
    // Main log (or a one-time vignette) first, chance logs after it.
    const mainId = this.s.meta.nextLogId;
    const beatIdx = (a.beats ?? []).findIndex((b, i) => !this.flag(`beat:${a.id}:${i}`) && (!b.if || this.test(b.if, pid)));
    if (beatIdx >= 0) {
      const beat = a.beats![beatIdx]!;
      this.s.flags[`beat:${a.id}:${beatIdx}`] = 1;
      this.log({ kind: 'story', ...beat.log }, pid);
      this.apply(beat.effects, pid);
    } else if (a.log) {
      const variants = Array.isArray(a.log) ? a.log : [a.log];
      this.log(this.rng.pick(variants), pid);
    }
    for (let i = 0; i < rolls; i++) {
      for (const ch of a.chance ?? []) {
        if (ch.if && !this.test(ch.if, pid)) continue;
        if (!this.rng.chance(ch.p)) continue;
        for (const [r, n] of Object.entries(ch.add ?? {})) gained[r] = (gained[r] ?? 0) + this.addRes(r, n);
        if (ch.log) this.log(ch.log, pid);
        this.apply(ch.effects, pid);
      }
    }
    this.apply(a.effects, pid);
    this.logGains(pid, gained, mainId);
    const st = this.s.stats;
    st.actions[pid] = (st.actions[pid] ?? 0) + 1;
    for (const [r, n] of Object.entries(gained)) if (n > 0) st.gathered[r] = (st.gathered[r] ?? 0) + n;
    if (a.kind === 'craft') st.crafted += 1;
    if ((a.effects ?? []).some((e) => 'moveTo' in e)) st.trips += 1;

    if (a.once) this.s.flags[`built:${a.id}`] = 1;
    if (a.oncePerPlayer) p.flags[`built:${a.id}`] = 1;
    const cd = Math.round(a.cooldown * this.cooldownMult(this.ix.areaOf(a.group)));
    if (a.recharge) p.cooldowns[a.id] = this.now + a.recharge;
    p.busy = { action: a.id, until: this.now + cd };
    return OK;
  }

  /** Append "Дрова +2" to the actor's line of this action (or log it separately). */
  private logGains(pid: PlayerId, gained: Record<string, number>, mainId: number): void {
    const parts: string[] = [];
    for (const [r, n] of Object.entries(gained)) {
      if (n <= 0) continue;
      const def = this.ix.res.get(r);
      if (!def || def.hidden) continue;
      parts.push(`${def.name} +${n}`);
    }
    if (!parts.length) return;
    // Find by id: the log is trimmed from the front, so indexes shift.
    const main = this.s.log.find((e) => e.id === mainId);
    if (main && main.actor === pid && main.text[pid]) main.text[pid] = `${main.text[pid]} (${parts.join(', ')})`;
    else this.logRaw('system', { [pid]: parts.join(' · ') }, pid);
  }

  // ----- proposals & scenes --------------------------------------------------

  sceneOrPoolVisible(def: SceneDef | PoolActionDef, pid: PlayerId): boolean {
    if (def.group && this.ix.areaOf(def.group) !== this.p(pid).at) return false;
    if ('start' in def) {
      if (def.once !== false && this.flag(`done:${def.id}`)) return false;
    } else if (!this.pickFromPool(def.pool, true)) {
      return false;
    }
    if (def.visible && !this.test(def.visible, pid)) return false;
    return true;
  }

  proposalBlock(def: SceneDef | PoolActionDef, pid: PlayerId): string | null {
    const o = this.p(this.other(pid));
    if (!o.joined || !o.online) return this.ix.ui('err_need_both');
    const area = this.ix.areaOf(def.group);
    if (o.at !== area) return `${this.render(this.ix.ui('partner_now'), pid)} ${this.ix.areaWhere(o.at)}.`;
    if (this.s.scene) return this.s.scene.paused ? this.ix.ui('err_scene_paused') : this.ix.ui('err_in_scene');
    if (this.s.proposal) return this.ix.ui('err_proposal_pending');
    if (def.enabled && !this.test(def.enabled, pid)) return def.disabledHint ? this.render(def.disabledHint, pid) : this.ix.ui('err_not_now');
    if (!this.hasCost(def.cost)) return this.ix.ui('err_cost');
    return null;
  }

  /** Choose the scene a pool action starts. `peek` avoids consuming randomness. */
  pickFromPool(pool: string, peek = false): SceneDef | null {
    let best: SceneDef[] = [];
    let bestPr = Number.NEGATIVE_INFINITY;
    for (const sc of this.ix.c.scenes) {
      if (sc.pool !== pool) continue;
      if (sc.once !== false && this.flag(`done:${sc.id}`)) continue;
      if (sc.visible && !this.test(sc.visible)) continue;
      const pr = sc.priority ?? 0;
      if (pr > bestPr) {
        best = [sc];
        bestPr = pr;
      } else if (pr === bestPr) best.push(sc);
    }
    if (best.length === 0) return null;
    if (peek || best.length === 1) return best[0]!;
    return this.rng.pick(best);
  }

  propose(pid: PlayerId, entryId: string): Result {
    const entry = this.ix.entry(entryId);
    if (!entry || entry.kind === 'act') return this.fail('err_not_now');
    const def = entry.def;
    if (!this.sceneOrPoolVisible(def, pid)) return this.fail('err_not_now');
    const block = this.proposalBlock(def, pid);
    if (block) return { ok: false, err: block };
    const scene = entry.kind === 'scene' ? entry.def : this.pickFromPool(entry.def.pool);
    if (!scene) return this.fail('err_not_now');
    this.s.proposal = { scene: scene.id, via: def.id, by: pid, at: this.now };
    return OK;
  }

  accept(pid: PlayerId): Result {
    const pr = this.s.proposal;
    if (!pr || pr.by === pid) return this.fail('err_not_now');
    if (!this.bothOnline()) return this.fail('err_need_both');
    const via = this.ix.entry(pr.via);
    const area = this.ix.areaOf(via && via.kind !== 'act' ? via.def.group : undefined);
    if (this.p(pid).at !== area || this.p(pr.by).at !== area) {
      this.s.proposal = null;
      return this.fail('err_not_now');
    }
    const cost = via && via.kind !== 'act' ? via.def.cost : undefined;
    if (!this.hasCost(cost)) {
      this.s.proposal = null;
      return this.fail('err_cost');
    }
    this.payCost(cost);
    this.s.proposal = null;
    this.startScene(pr.scene);
    return OK;
  }

  decline(pid: PlayerId): Result {
    const pr = this.s.proposal;
    if (!pr || pr.by === pid) return this.fail('err_not_now');
    this.s.proposal = null;
    this.logRaw('system', { [pr.by]: this.render(this.ix.ui('proposal_declined'), pr.by) });
    return OK;
  }

  cancel(pid: PlayerId): Result {
    const pr = this.s.proposal;
    if (!pr || pr.by !== pid) return this.fail('err_not_now');
    this.s.proposal = null;
    return OK;
  }

  startScene(id: string): void {
    const def = this.ix.scenes.get(id);
    if (!def) return;
    this.s.scene = {
      id,
      node: def.start,
      paused: !this.bothOnline(),
      ready: {},
      picks: {},
      used: {},
      trail: [],
      combat: null,
      startedAt: this.now,
    };
    if (def.pool) this.s.stats.suppers += 1;
    this.enterNode(def.start);
  }

  node(def: SceneDef, id: string): SceneNode {
    const n = def.nodes[id];
    if (!n) throw new Error(`Scene ${def.id}: missing node ${id}`);
    return n;
  }

  private enterNode(id: string): void {
    const sc = this.s.scene!;
    const def = this.ix.scenes.get(sc.id)!;
    sc.node = id;
    sc.ready = {};
    sc.picks = {};
    sc.trail.push({ node: id });
    const n = this.node(def, id);
    this.apply(n.effects);
    if (n.type === 'combat') {
      const enc = this.ix.enc.get(n.enc)!;
      sc.combat = { enc: enc.id, hp: enc.enemy.hp, fear: 0, round: 1, picks: {}, lastRound: { p1: [], p2: [] } };
    } else {
      sc.combat = null;
    }
    if (n.type === 'delve') this.enterDelve(id, n);
    sc.stealth = n.type === 'stealth' ? { pos: 0, turn: 0, time: 0, alarm: 0, picks: {}, lines: { p1: [], p2: [] } } : null;
  }

  // ----- descents ------------------------------------------------------------

  private enterDelve(nodeId: string, n: DelveNode): void {
    const sc = this.s.scene!;
    const map = this.ix.maps.get(n.map)!;
    // coming back from a story beat: carry on where the party stood
    if (sc.delve && sc.delve.map === n.map && sc.delve.node === nodeId) {
      sc.delve.picks = {};
      return;
    }
    const start = n.starts?.find((x) => this.test(x.if))?.room ?? map.start;
    const light = n.light + (n.bonus ?? []).reduce((sum, b) => sum + (this.test(b.if) ? b.light : 0), 0);
    sc.delve = { map: n.map, node: nodeId, room: start, light, lightMax: light, picks: {}, lines: { p1: [], p2: [] } };
    this.arrive(map, start);
  }

  /** The party stands in a room: it becomes known, its first finds happen. */
  private arrive(map: DelveMapDef, roomId: string): void {
    const room = map.rooms[roomId]!;
    this.s.flags[`known:${map.id}:${roomId}`] = 1;
    if (!this.flag(`found:${map.id}:${roomId}`)) {
      this.s.flags[`found:${map.id}:${roomId}`] = 1;
      this.apply(room.first);
    }
  }

  delveStart(map: DelveMapDef, n: DelveNode): string {
    return n.starts?.find((x) => this.test(x.if))?.room ?? map.start;
  }

  delveExitVisible(e: DelveExitDef): boolean {
    return !e.visible || this.test(e.visible);
  }

  delveActVisible(map: DelveMapDef, a: DelveActDef, pid: PlayerId): boolean {
    if (a.visible && !this.test(a.visible, pid)) return false;
    if (a.once !== false && this.flag(`dact:${map.id}:${a.id}`)) return false;
    return true;
  }

  delveActBlock(a: DelveActDef, pid: PlayerId): string | null {
    const d = this.s.scene?.delve;
    if (a.role && this.p(pid).role !== a.role) return this.ix.ui('err_wrong_role');
    if (a.enabled && !this.test(a.enabled, pid)) return a.disabledHint ? this.render(a.disabledHint, pid) : this.ix.ui('err_not_now');
    if (!this.hasCost(a.cost)) return this.ix.ui('err_cost');
    if (d && (a.light ?? 0) > 0 && d.light < (a.light ?? 0)) return this.ix.ui('delve_no_light');
    return null;
  }

  private delveSay(lt: LogText, actor?: PlayerId): void {
    const d = this.s.scene!.delve!;
    const text = this.renderLog(lt, actor);
    for (const pid of this.joinedIds()) if (text[pid]) d.lines[pid].push(text[pid]!);
  }

  private delveChoose(pid: PlayerId, n: DelveNode, optId: string): Result {
    const sc = this.s.scene!;
    const d = sc.delve;
    if (!d) return this.fail('err_not_now');
    const map = this.ix.maps.get(d.map)!;
    const room = map.rooms[d.room]!;

    if (optId === 'leave') {
      if (d.room !== this.delveStart(map, n)) return this.fail('err_not_now');
      sc.delve = null;
      this.goTo(n.out);
      return OK;
    }

    if (optId.startsWith('act:')) {
      const a = (room.acts ?? []).find((x) => `act:${x.id}` === optId);
      if (!a || !this.delveActVisible(map, a, pid)) return this.fail('err_not_now');
      const block = this.delveActBlock(a, pid);
      if (block) return { ok: false, err: block };
      d.lines = { p1: [], p2: [] };
      this.payCost(a.cost);
      const light = a.light ?? 0;
      d.light -= light;
      if (d.light > d.lightMax) d.lightMax = d.light;
      if (a.once !== false) this.s.flags[`dact:${map.id}:${a.id}`] = 1;
      this.delveSay(a.log, pid);
      this.apply(a.effects, pid);
      if (d.light <= 0) {
        sc.delve = null;
        this.goTo(n.dark);
      }
      return OK;
    }

    if (!optId.startsWith('go:')) return this.fail('err_not_now');
    const exit = room.exits.find((e) => `go:${e.to}` === optId);
    if (!exit || !this.delveExitVisible(exit)) return this.fail('err_not_now');
    if (exit.enabled && !this.test(exit.enabled, pid)) return this.fail('err_not_now');
    d.picks[pid] = optId;
    if (!this.joinedIds().every((x) => d.picks[x] === optId)) return OK;

    // both chose this way: go
    d.picks = {};
    d.lines = { p1: [], p2: [] };
    d.light -= exit.light ?? 1;
    if (exit.risk && this.rng.chance(exit.risk.p)) {
      d.light -= exit.risk.light ?? 0;
      if (exit.risk.hp) for (const x of this.joinedIds()) this.p(x).hp = Math.max(1, this.p(x).hp - exit.risk.hp);
      this.delveSay(exit.risk.log);
    }
    d.room = exit.to;
    this.arrive(map, exit.to);
    if (d.light <= 0) {
      sc.delve = null;
      this.goTo(n.dark);
      return OK;
    }
    const beat = (map.rooms[exit.to]!.enter ?? []).find((e) => !e.if || this.test(e.if));
    if (beat) this.goTo(beat.next);
    return OK;
  }

  // ----- slipping past watchers ------------------------------------------------

  stealthLimits(n: StealthNode): { alarm: number; time: number } {
    let alarm = n.alarm;
    let time = n.time;
    for (const b of n.bonus ?? []) {
      if (!this.test(b.if)) continue;
      alarm += b.alarm ?? 0;
      time += b.time ?? 0;
    }
    return { alarm, time };
  }

  private stealthChoose(pid: PlayerId, n: StealthNode, optId: string): Result {
    const sc = this.s.scene!;
    const st = sc.stealth;
    if (!st) return this.fail('err_not_now');
    if (optId !== 'step' && optId !== 'sneak' && optId !== 'freeze') return this.fail('err_not_now');
    if (st.picks[pid]) return this.fail('err_already_chosen');
    st.picks[pid] = optId;
    const ids = this.joinedIds();
    if (!ids.every((x) => st.picks[x])) return OK;

    const picks = ids.map((x) => st.picks[x]!);
    const moving = picks.filter((x) => x !== 'freeze').length;
    const watching = n.watch[st.turn % n.watch.length]!;
    const loose = n.path[st.pos]!;
    st.lines = { p1: [], p2: [] };
    const say = (key: string) => {
      for (const x of ids) st.lines[x].push(this.render(this.ix.ui(key), x));
    };
    if (watching && moving > 0) {
      st.alarm += 2;
      say('stealth_seen');
    }
    if (loose && moving > 0 && picks.includes('step')) {
      st.alarm += 1;
      say('stealth_noise');
    }
    if (moving === ids.length) {
      st.pos += 1;
      st.time += picks.includes('sneak') ? 2 : 1;
      if (!watching && !(loose && picks.includes('step'))) say(picks.includes('sneak') ? 'stealth_crept' : 'stealth_moved');
    } else {
      st.time += 1;
      say(moving > 0 ? 'stealth_split' : 'stealth_froze');
    }
    st.turn += 1;
    st.picks = {};
    const lim = this.stealthLimits(n);
    if (st.alarm >= lim.alarm) {
      sc.stealth = null;
      this.goTo(n.lose);
    } else if (st.pos >= n.path.length) {
      sc.stealth = null;
      this.goTo(n.win);
    } else if (st.time >= lim.time) {
      sc.stealth = null;
      this.goTo(n.lose);
    }
    return OK;
  }

  /** A hand sign: the only way to say anything with wax in the ears. */
  sign(pid: PlayerId, id: string): Result {
    const sc = this.s.scene;
    if (!sc || sc.paused || !SIGNS.includes(id)) return this.fail('err_not_now');
    (sc.signs ??= {})[pid] = { id, at: this.now, turn: sc.stealth?.turn ?? -1 };
    return OK;
  }

  private goTo(next: string | null | undefined, completed = true): void {
    if (next === null || next === undefined) this.endScene(completed);
    else this.enterNode(next);
  }

  endScene(completed = true): void {
    const sc = this.s.scene;
    if (!sc) return;
    const def = this.ix.scenes.get(sc.id)!;
    this.s.scene = null;
    if (completed) {
      if (def.once !== false) this.s.flags[`done:${def.id}`] = 1;
      this.s.flags[`count:${def.id}`] = this.flag(`count:${def.id}`) + 1;
      if (def.explores) this.s.flags[`seen:${def.explores}`] = 1;
      this.apply(def.onEnd);
      if (def.summary) this.log(def.summary);
    }
    const next = this.chain.shift();
    if (next) this.startScene(next);
  }

  next(pid: PlayerId): Result {
    const sc = this.s.scene;
    if (!sc || sc.paused) return this.fail('err_not_now');
    const def = this.ix.scenes.get(sc.id)!;
    const n = this.node(def, sc.node);
    if (n.type === 'choice' || n.type === 'combat' || n.type === 'delve' || n.type === 'stealth') return this.fail('err_not_now');
    sc.ready[pid] = true;
    if (!this.joinedIds().every((x) => sc.ready[x])) return OK;
    const tn = n as TextNode;
    let next: string | null | undefined = tn.next;
    for (const g of tn.goto ?? []) {
      if (this.test(g.if)) {
        next = g.next;
        break;
      }
    }
    this.goTo(next, !tn.incomplete);
    return OK;
  }

  optionVisible(o: OptionDef, pid: PlayerId, nodeId: string): boolean {
    if (o.visible && !this.test(o.visible, pid)) return false;
    if (o.once && this.s.scene?.used[nodeId]?.includes(o.id)) return false;
    return true;
  }

  choose(pid: PlayerId, optId: string): Result {
    const sc = this.s.scene;
    if (!sc || sc.paused) return this.fail('err_not_now');
    const def = this.ix.scenes.get(sc.id)!;
    const n = this.node(def, sc.node);
    if (n.type === 'combat') return this.combatChoose(pid, n, optId);
    if (n.type === 'delve') return this.delveChoose(pid, n, optId);
    if (n.type === 'stealth') return this.stealthChoose(pid, n, optId);
    if (n.type !== 'choice') return this.fail('err_not_now');
    const opt = n.options.find((o) => o.id === optId);
    if (!opt || !this.optionVisible(opt, pid, sc.node)) return this.fail('err_not_now');
    if (opt.role && this.p(pid).role !== opt.role) return this.fail('err_wrong_role');
    if (opt.enabled && !this.test(opt.enabled, pid)) return this.fail('err_not_now');
    if (sc.picks[pid]) return this.fail('err_already_chosen');

    if (n.mode === 'any') {
      const trailItem = sc.trail[sc.trail.length - 1]!;
      trailItem.picks = { [pid]: opt.id };
      if (opt.once) (sc.used[sc.node] ??= []).push(opt.id);
      this.apply(opt.effects, pid);
      this.goTo(opt.next === undefined ? n.next : opt.next);
      return OK;
    }

    sc.picks[pid] = opt.id;
    const ids = this.joinedIds();
    if (!ids.every((x) => sc.picks[x])) return OK;

    const trailItem = sc.trail[sc.trail.length - 1]!;
    trailItem.picks = { ...sc.picks };
    if (n.mode === 'each') {
      for (const x of ids) {
        const o = n.options.find((oo) => oo.id === sc.picks[x])!;
        this.apply(o.effects, x);
      }
      this.goTo(n.next);
      return OK;
    }
    // joint
    const [a, b] = ids.map((x) => sc.picks[x]!);
    if (a === b) {
      this.apply(opt.effects);
      const chosen = n.options.find((o) => o.id === a)!;
      this.goTo(chosen.next === undefined ? n.next : chosen.next);
    } else {
      this.goTo(n.mismatch ?? n.next);
    }
    return OK;
  }

  // ----- combat --------------------------------------------------------------

  combatOptions(enc: EncounterDef, pid: PlayerId): CombatOptionDef[] {
    if (this.p(pid).hp <= 0) return [enc.downOption];
    return enc.options.filter((o) => (!o.visible || this.test(o.visible, pid)));
  }

  private combatChoose(pid: PlayerId, n: CombatNode, optId: string): Result {
    const sc = this.s.scene!;
    const cb = sc.combat!;
    const enc = this.ix.enc.get(cb.enc)!;
    const opts = this.combatOptions(enc, pid);
    const opt = opts.find((o) => o.id === optId);
    if (!opt) return this.fail('err_not_now');
    if (opt.role && this.p(pid).role !== opt.role) return this.fail('err_wrong_role');
    if (!this.hasCost(opt.cost)) return this.fail('err_cost');
    if (cb.picks[pid]) return this.fail('err_already_chosen');
    cb.picks[pid] = opt.id;
    if (!this.joinedIds().every((x) => cb.picks[x])) return OK;
    this.resolveRound(n, enc);
    return OK;
  }

  private resolveRound(n: CombatNode, enc: EncounterDef): void {
    const sc = this.s.scene!;
    const cb = sc.combat!;
    const lines: Record<PlayerId, string[]> = { p1: [], p2: [] };
    const say = (lt: LogText, actor?: PlayerId): void => {
      const text = this.renderLog(lt, actor);
      for (const pid of this.joinedIds()) if (text[pid]) lines[pid].push(text[pid]!);
    };
    let defender: PlayerId | null = null;
    let taunter: PlayerId | null = null;

    for (const pid of this.joinedIds()) {
      const opt = this.combatOptions(enc, pid).find((o) => o.id === cb.picks[pid]) ?? enc.downOption;
      this.payCost(opt.cost);
      const me = this.p(pid);
      if (opt.heal) me.hp = Math.min(me.hpMax, me.hp + opt.heal);
      let hit = true;
      if (opt.dmg) {
        hit = this.rng.chance(opt.hit ?? 1);
        if (hit) cb.hp -= this.rng.int(opt.dmg[0], opt.dmg[1]);
      }
      if (hit && opt.fear) cb.fear += opt.fear;
      if (opt.defend) defender = pid;
      if (opt.taunt) taunter = pid;
      say(hit ? opt.log : (opt.miss ?? opt.log), pid);
    }
    if (enc.ally && this.test(enc.ally.if)) {
      if (enc.ally.fear) cb.fear += enc.ally.fear;
      if (enc.ally.dmg) cb.hp -= this.rng.int(enc.ally.dmg[0], enc.ally.dmg[1]);
      say(enc.ally.log);
    }

    const finish = (next: string): void => {
      sc.trail[sc.trail.length - 1]!.combat = lines;
      cb.lastRound = lines;
      this.goTo(next);
    };

    if (cb.hp <= 0 || cb.fear >= enc.enemy.fear) {
      this.s.flags[`${enc.id}:${cb.hp <= 0 ? 'killed' : 'fled'}`] = 1;
      finish(n.win);
      return;
    }

    // Enemy turn.
    const alive = this.joinedIds().filter((x) => this.p(x).hp > 0);
    if (alive.length) {
      const target = taunter && this.p(taunter).hp > 0 ? taunter : this.rng.pick(alive);
      let dmg = this.rng.int(enc.enemy.dmg[0], enc.enemy.dmg[1]);
      if (enc.armor && this.test(enc.armor.if)) dmg = Math.max(0, dmg - enc.armor.value);
      if (defender && defender !== target) dmg = Math.floor(dmg / 2);
      const t = this.p(target);
      t.hp = Math.max(0, t.hp - dmg);
      say(dmg > 0 ? enc.enemyLog : (enc.enemyMissLog ?? enc.enemyLog), target);
      if (t.hp <= 0) say({ self: this.ix.ui('combat_down_self'), other: this.ix.ui('combat_down_other') }, target);
    }

    if (this.joinedIds().every((x) => this.p(x).hp <= 0) || cb.round >= (enc.maxRounds ?? 15)) {
      for (const x of this.joinedIds()) this.p(x).hp = Math.ceil(this.p(x).hpMax / 3);
      finish(n.lose);
      return;
    }
    cb.round += 1;
    cb.picks = {};
    cb.lastRound = lines;
  }

  // ----- dispatch ------------------------------------------------------------

  command(pid: PlayerId, cmd: Command): Result {
    const p = this.p(pid);
    if (!p.joined) return this.fail('err_not_now');
    p.lastSeen = this.now;
    let r: Result;
    switch (cmd.c) {
      case 'act': {
        const e = this.ix.entry(cmd.id);
        if (!e) r = this.fail('err_not_now');
        else if (e.kind === 'act') r = this.doAction(pid, e.def);
        else r = this.propose(pid, cmd.id);
        break;
      }
      case 'accept':
        r = this.accept(pid);
        break;
      case 'decline':
        r = this.decline(pid);
        break;
      case 'cancel':
        r = this.cancel(pid);
        break;
      case 'next':
        r = this.next(pid);
        break;
      case 'choose':
        r = this.choose(pid, cmd.id);
        break;
      case 'sign':
        r = this.sign(pid, cmd.id);
        break;
      case 'ack':
        if (cmd.what === 'welcome') p.welcome = null;
        else p.seenSummary = this.s.meta.actDone;
        r = OK;
        break;
      default:
        r = this.fail('err_not_now');
    }
    this.commit();
    return r;
  }

  // ----- presence & time -----------------------------------------------------

  setOnline(pid: PlayerId, online: boolean): void {
    const p = this.p(pid);
    if (p.online === online) return;
    p.online = online;
    p.lastSeen = this.now;
    if (!online) {
      p.away = { at: this.now, day: this.s.meta.day, res: { ...this.s.res }, log: this.s.meta.nextLogId };
    } else if (p.away) {
      // a real absence (not a dropped connection) earns a "while you were away" summary
      if (this.now - p.away.at >= WELCOME_AFTER) p.welcome = p.away;
      p.away = null;
    }
    if (!online) {
      if (this.s.proposal) this.s.proposal = null;
      if (this.s.scene) this.s.scene.paused = true;
    } else if (this.s.scene && this.bothOnline()) {
      this.s.scene.paused = false;
    }
    this.commit();
  }

  /** Advance real-time systems. Returns true if something visible changed. */
  tick(): boolean {
    const st = this.s.stove;
    const dt = Math.max(0, this.now - this.s.meta.lastTick);
    this.s.meta.lastTick = this.now;
    const anyoneHome = PLAYER_IDS.some((pid) => this.p(pid).online && this.p(pid).at === this.ix.homeArea);
    if (!anyoneHome || !st.lit || st.fuel <= 0) return false;
    const before = this.stoveState();
    st.fuel = Math.max(0, st.fuel - dt);
    const after = this.stoveState();
    if (before !== after) {
      if (after === 'cold') this.log({ all: this.ix.ui('stove_went_cold'), kind: 'warn' });
      if (after === 'low') this.log({ all: this.ix.ui('stove_went_low'), kind: 'warn' });
      this.commit();
      return true;
    }
    return false;
  }

  // ----- joining -------------------------------------------------------------

  join(name: string, gender: Gender, role: Role): { pid: PlayerId } | { err: 'slots_full' | 'role_taken' } {
    const free = PLAYER_IDS.find((pid) => !this.p(pid).joined);
    if (!free) return { err: 'slots_full' };
    if (PLAYER_IDS.some((pid) => this.p(pid).joined && this.p(pid).role === role)) return { err: 'role_taken' };
    const p = this.p(free);
    p.joined = true;
    p.name = name;
    p.gender = gender;
    p.role = role;
    p.hp = p.hpMax;
    p.lastSeen = this.now;
    this.commit();
    return { pid: free };
  }
}

// ---------------------------------------------------------------------------
// World creation
// ---------------------------------------------------------------------------

function blankPlayer(id: PlayerId, hp: number, now: number, at = 'yas'): PlayerState {
  return {
    id,
    joined: false,
    name: '',
    gender: 'm',
    role: null,
    at,
    hp,
    hpMax: hp,
    flags: {},
    cooldowns: {},
    busy: null,
    online: false,
    lastSeen: now,
    away: null,
    welcome: null,
    seenSummary: 0,
  };
}

export function newWorld(content: Content, seed: number, now: number): WorldState {
  const res: Record<string, number> = {};
  for (const r of content.resources) res[r.id] = 0;
  for (const [k, v] of Object.entries(content.start.resources)) res[k] = v;
  const seenRes: Record<string, number> = {};
  for (const [k, v] of Object.entries(res)) if (v > 0) seenRes[k] = 1;
  return {
    version: STATE_VERSION,
    meta: { seed, rng: seed >>> 0, createdAt: now, lastTick: now, day: 1, act: 1, nextLogId: 1, actDone: 0, dayAt: now },
    stats: { gathered: {}, actions: { p1: 0, p2: 0 }, crafted: 0, trips: 0, suppers: 0 },
    players: {
      p1: blankPlayer('p1', content.start.hp, now, content.areas[0]!.id),
      p2: blankPlayer('p2', content.start.hp, now, content.areas[0]!.id),
    },
    res,
    seenRes,
    flags: {},
    stove: { fuel: 0, lit: false },
    scene: null,
    proposal: null,
    log: [],
    clues: {},
    mysteries: {},
    npcs: {},
    goal: null,
  };
}

/** Ensure a loaded world has entries for content added after it was created. */
export function normalizeWorld(content: Content, s: WorldState, now: number): WorldState {
  for (const r of content.resources) if (s.res[r.id] === undefined) s.res[r.id] = 0;
  const areas = new Set(content.areas.map((a) => a.id));
  for (const pid of PLAYER_IDS) {
    s.players[pid].online = false;
    s.players[pid].busy = null;
    if (!areas.has(s.players[pid].at)) s.players[pid].at = content.areas[0]!.id;
  }
  if (s.scene) s.scene.paused = true;
  s.proposal = null;
  s.meta.lastTick = now;
  return s;
}
