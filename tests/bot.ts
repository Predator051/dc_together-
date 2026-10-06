// A bot player that only sees its own PlayerView and answers with Commands, exactly like a client.
// It peeks into content definitions for heuristics (what an action yields), never into world state.

import type { ActionDef, Content } from '../shared/src/content.js';
import type { Command, EntryView, PlayerView } from '../shared/src/protocol.js';
import { Rng } from '../shared/src/rng.js';

export type ChoicePolicy = 'first' | 'last' | 'random';
export type CombatPolicy = 'smart' | 'weak';

export interface BotOptions {
  choice: ChoicePolicy;
  combat: CombatPolicy;
  seed: number;
  /** Probability to decline a partner's proposal (exercises the decline path). */
  declineRate?: number;
  /** Prefer leaving question hubs right away (exercises skipped dialogue). */
  impatient?: boolean;
  /**
   * A careless player: with this probability, spends resources on any routine action that
   * consumes something (crafting, trading, salting), whether it is needed or not.
   */
  waste?: number;
  /** With this probability, wanders off to another place for no reason. */
  wander?: number;
}

const COMBAT_ORDER = ['bell', 'bow', 'torch', 'axe', 'knife', 'shout', 'guard', 'up'];

export class Bot {
  readonly rng: Rng;
  private actions: Map<string, ActionDef>;
  /** Travel action id -> destination area. */
  private travelTo = new Map<string, string>();
  /** Resource -> areas where some action produces it. */
  private madeIn = new Map<string, Set<string>>();
  /** Scene id -> world signature when it was last proposed (avoid pointless repeats). */
  private tried = new Map<string, string>();
  /** How many times the bot stood at each choice node. */
  private visits = new Map<string, number>();

  constructor(
    readonly name: string,
    readonly content: Content,
    readonly o: BotOptions,
  ) {
    this.rng = new Rng(o.seed);
    this.actions = new Map(content.actions.map((a) => [a.id, a]));
    for (const a of content.actions) for (const e of a.effects ?? []) if ('moveTo' in e) this.travelTo.set(a.id, e.moveTo);
    const areaOf = (group: string) => content.locations.find((l) => l.id === group)?.area ?? content.areas[0]!.id;
    for (const a of content.actions) {
      const made = [...Object.keys(a.yield ?? {}), ...(a.chance ?? []).flatMap((c) => Object.keys(c.add ?? {}))];
      for (const r of made) {
        if (!this.madeIn.has(r)) this.madeIn.set(r, new Set());
        this.madeIn.get(r)!.add(areaOf(a.group));
      }
    }
  }

  private pick<T>(items: T[]): T | undefined {
    if (items.length === 0) return undefined;
    if (this.o.choice === 'first') return items[0];
    if (this.o.choice === 'last') return items[items.length - 1];
    return this.rng.pick(items);
  }

  /** `now` is the current server time; defaults to the time the view was built. */
  decide(v: PlayerView, now: number = v.now): Command | null {
    const sc = v.scene;
    if (sc && !sc.paused) {
      if (sc.waiting) return null;
      if (sc.kind === 'text') return { c: 'next' };
      const opts = (sc.options ?? []).filter((o) => o.enabled);
      if (sc.myPick) return null;
      if (sc.kind === 'combat') {
        const order = this.o.combat === 'smart' ? COMBAT_ORDER : ['guard', 'up'];
        for (const id of order) if (opts.find((o) => o.id === id)) return { c: 'choose', id };
        return opts[0] ? { c: 'choose', id: opts[0].id } : null;
      }
      if (this.o.impatient && sc.mode === 'any') {
        const last = opts[opts.length - 1];
        if (last) return { c: 'choose', id: last.id };
      }
      const key = `${sc.id}:${sc.blocks.length}:${opts.map((o) => o.id).join(',')}`;
      const n = (this.visits.get(key) ?? 0) + 1;
      this.visits.set(key, n);
      // A stubborn policy that keeps landing on the same choice switches to random picks.
      const o = n > 2 ? this.rng.pick(opts) : this.pick(opts);
      return o ? { c: 'choose', id: o.id } : null;
    }

    if (v.proposal) {
      if (v.proposal.mine) return null;
      if (this.o.declineRate && this.rng.chance(this.o.declineRate)) return { c: 'decline' };
      return { c: 'accept' };
    }

    const entries = v.groups.flatMap((g) => g.entries);

    // Together scenes first (story), supper only occasionally or when nothing else is pending.
    const sig = this.signature(v);
    const scenes = entries.filter((e) => e.kind === 'scene' && e.enabled && this.tried.get(e.id) !== sig);
    if (scenes.length && v.partner.online) {
      const s = this.pick(scenes)!;
      this.tried.set(s.id, sig);
      return { c: 'act', id: s.id };
    }

    if (v.busyUntil > now) return null;
    // Travel: stay with the partner; otherwise sometimes go where there may be work.
    const travels = entries.filter((e) => e.kind === 'act' && e.enabled && this.travelTo.has(e.id) && !(e.readyAt && e.readyAt > now));
    if (travels.length) {
      const apart = v.partner.joined && v.partner.area !== v.me.area;
      if (apart) {
        const order = this.content.areas.map((a) => a.id);
        const dir = Math.sign(order.indexOf(v.partner.area) - order.indexOf(v.me.area));
        const toward = travels.find((e) => Math.sign(order.indexOf(this.travelTo.get(e.id)!) - order.indexOf(v.me.area)) === dir);
        const storyHere = entries.some((e) => e.kind === 'scene');
        if (toward && this.rng.chance(storyHere ? 0.15 : 0.6)) return { c: 'act', id: toward.id };
      } else {
        // Go where a missing resource can be produced, if it can't be made here.
        const wantedHere = this.wanted(v, entries);
        const madeHere = new Set<string>();
        for (const e of entries) {
          const a = this.actions.get(e.id);
          if (!a) continue;
          for (const r of Object.keys(a.yield ?? {})) madeHere.add(r);
          for (const ch of a.chance ?? []) for (const r of Object.keys(ch.add ?? {})) madeHere.add(r);
        }
        const missing = [...wantedHere.keys()].filter((r) => !madeHere.has(r) && this.madeIn.has(r));
        if (missing.length && this.rng.chance(0.2)) {
          const order = this.content.areas.map((a) => a.id);
          const target = [...(this.madeIn.get(this.rng.pick(missing)) ?? [])].filter((a) => a !== v.me.area);
          if (target.length) {
            const goal = this.rng.pick(target);
            const dir = Math.sign(order.indexOf(goal) - order.indexOf(v.me.area));
            const toward = travels.find((e) => Math.sign(order.indexOf(this.travelTo.get(e.id)!) - order.indexOf(v.me.area)) === dir);
            if (toward) return { c: 'act', id: toward.id };
          }
        }
        if (this.rng.chance(0.01)) return { c: 'act', id: this.rng.pick(travels).id };
      }
    }
    const ready = entries.filter((e) => e.kind === 'act' && e.enabled && !(e.readyAt && e.readyAt > now));
    if (this.o.wander && travels.length && this.rng.chance(this.o.wander)) return { c: 'act', id: this.rng.pick(travels).id };
    if (this.o.waste && this.rng.chance(this.o.waste)) {
      const spend = ready.filter((e) => {
        const a = this.actions.get(e.id);
        return a && !a.once && !a.oncePerPlayer && !this.travelTo.has(e.id) && Object.keys(a.cost ?? {}).length > 0;
      });
      if (spend.length) return { c: 'act', id: this.rng.pick(spend).id };
    }
    const wanted = this.wanted(v, entries);
    const supper = entries.find((e) => e.kind === 'pool' && e.enabled);
    const storyWaiting = entries.some((e) => e.kind === 'scene' && !e.enabled && e.reason && e.cost?.some((c) => !c.ok));

    let best: EntryView | null = null;
    let bestScore = 0;
    for (const e of ready) {
      const s = this.score(v, e, wanted);
      if (s > bestScore) {
        best = e;
        bestScore = s;
      }
    }

    if (supper && v.partner.online) {
      // Don't eat the food that a waiting story step needs.
      const food = v.res.find((r) => r.id === 'res_03')?.n ?? 0;
      const reserve = Math.max(0, ...entries.flatMap((e) => (e.kind !== 'pool' ? (e.cost ?? []) : [])).filter((c) => c.id === 'res_03').map((c) => c.n));
      const spare = food - 2 >= reserve;
      const chance = storyWaiting ? 0.05 : 0.25;
      if (spare && (bestScore < 20 || this.rng.chance(chance))) return { c: 'act', id: supper.id };
    }
    if (best) return { c: 'act', id: best.id };
    return null;
  }

  private signature(v: PlayerView): string {
    const res = v.res.map((r) => `${r.id}:${Math.min(r.n, 5)}`).join(',');
    return `${v.day}|${v.journal.clues.length}|${res}`;
  }

  /** Resources the bot would like to have more of. */
  private wanted(v: PlayerView, entries: EntryView[]): Map<string, number> {
    const w = new Map<string, number>();
    for (const e of entries) {
      for (const c of e.cost ?? []) {
        if (!c.ok) w.set(c.id, Math.max(w.get(c.id) ?? 0, c.n - c.have));
      }
    }
    const res = (id: string) => v.res.find((r) => r.id === id)?.n ?? 0;
    if (res('res_03') < 6) w.set('res_03', Math.max(w.get('res_03') ?? 0, 6 - res('res_03')));
    if (res('res_02') < 3) w.set('res_02', Math.max(w.get('res_02') ?? 0, 3 - res('res_02')));
    if (res('res_01') < 6) w.set('res_01', Math.max(w.get('res_01') ?? 0, 6 - res('res_01')));
    if (res('res_07') < 4) w.set('res_07', 4);
    if (res('res_08') < 2) w.set('res_08', 2);
    if (res('res_10') < 3) w.set('res_10', 3);
    return w;
  }

  private score(v: PlayerView, e: EntryView, wanted: Map<string, number>): number {
    const a = this.actions.get(e.id);
    if (!a) return 0;
    let s = 1 + this.rng.next();
    if (a.once || a.oncePerPlayer) s += 100;
    // Unknown outcome ("+?") with one-time vignettes is worth exploring.
    if (a.beats?.length && e.gain?.some((x) => x.text === '+?')) s += 45;
    const gives = new Map<string, number>();
    for (const [r, y] of Object.entries(a.yield ?? {})) gives.set(r, (gives.get(r) ?? 0) + (Array.isArray(y) ? y[1] : y));
    for (const ch of a.chance ?? []) for (const [r, n] of Object.entries(ch.add ?? {})) if (n > 0) gives.set(r, (gives.get(r) ?? 0) + n * ch.p);
    for (const ef of a.effects ?? []) if ('stove' in ef && v.stove.state !== 'warm') s += 60;
    for (const [r, n] of gives) if (wanted.has(r)) s += 30 * Math.min(1, n);
    for (const [r, n] of Object.entries(a.cost ?? {})) {
      const need = wanted.get(r);
      const have = v.res.find((x) => x.id === r)?.n ?? 0;
      if (need && have - n < need) s -= 15;
    }
    if (a.id === 'act_02' && v.stove.state === 'warm') s -= 50;
    if (this.travelTo.has(a.id)) return 0;
    if (a.id === 'act_p5') s -= 40;
    if (a.id === 'act_09') s -= 5;
    return s;
  }
}
