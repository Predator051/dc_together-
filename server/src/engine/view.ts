import type { ActionDef, ChoiceNode, Effect, PlayerId, PoolActionDef, SceneDef } from '../../../shared/src/content.js';
import type {
  ClueView,
  CostView,
  EntryView,
  GainView,
  GroupView,
  LogView,
  MateEntryView,
  OptionView,
  PlayerView,
  SceneBlock,
  SceneView,
} from '../../../shared/src/protocol.js';
import type { Game } from './index.js';
import { resolveParas } from './text.js';

const LOG_SEND = 120;

/** The red cost line already explains a shortage, so the generic text is not repeated. */
function shownReason(g: Game, reason: string | null): string | undefined {
  if (!reason || reason === g.ix.ui('err_cost')) return undefined;
  return reason;
}

function costView(g: Game, cost: Record<string, number> | undefined): CostView[] | undefined {
  if (!cost) return undefined;
  return Object.entries(cost).map(([id, n]) => {
    const have = g.s.res[id] ?? 0;
    const def = g.ix.res.get(id);
    return { id, name: def?.name ?? id, n, have, ok: have >= n, stock: !!def?.hidden };
  });
}

/** Describe what an action gives: exact amounts, ranges, or "+?" when it depends on luck. */
function actionGains(g: Game, a: ActionDef, pid: PlayerId): GainView[] {
  const out: GainView[] = [];
  const seen = new Set<string>();
  const visibleRes = (r: string) => {
    const def = g.ix.res.get(r);
    return def && !def.hidden ? def : null;
  };
  if (a.gives) out.push({ text: g.render(a.gives, pid) });
  for (const [r, y] of Object.entries(a.yield ?? {})) {
    const def = visibleRes(r);
    if (!def) continue;
    seen.add(r);
    if (a.rollsPer) out.push({ text: `+? ${def.name}`, unsure: true });
    else if (Array.isArray(y)) out.push({ text: `+${y[0]}–${y[1]} ${def.name}` });
    else out.push({ text: `+${y} ${def.name}` });
  }
  const top: Effect[] = a.effects ?? [];
  for (const e of top) {
    if ('add' in e) {
      for (const [r, n] of Object.entries(e.add)) {
        const def = visibleRes(r);
        if (!def || n <= 0 || seen.has(r)) continue;
        seen.add(r);
        out.push({ text: `+${n} ${def.name}` });
      }
    }
    if ('stove' in e) out.push({ text: `+${Math.round((e.stove * g.ix.c.stove.perWood) / 60000)} ${g.ix.ui('gain_fire')}` });
  }
  for (const ch of a.chance ?? []) {
    if (ch.if && !g.test(ch.if, pid)) continue;
    for (const [r, n] of Object.entries(ch.add ?? {})) {
      const def = visibleRes(r);
      if (!def || n <= 0 || seen.has(r)) continue;
      seen.add(r);
      out.push({ text: `+? ${def.name}`, unsure: true });
    }
  }
  for (const r of g.ix.c.resources) {
    for (const b of r.capBonus ?? []) {
      if ('flag' in b.if && b.if.flag === `built:${a.id}`) out.push({ text: `${r.name}: ${g.ix.ui('gain_space')} +${b.add}` });
    }
  }
  if (out.length === 0 && ((a.effects?.length ?? 0) > 0 || (a.beats?.length ?? 0) > 0 || (a.chance?.length ?? 0) > 0)) {
    out.push({ text: g.ix.ui('gain_unknown'), unsure: true });
  }
  return out;
}

function sceneGains(g: Game, def: SceneDef | PoolActionDef, pid: PlayerId): GainView[] {
  if (def.gives) return [{ text: g.render(def.gives, pid) }];
  return [{ text: g.ix.ui('gain_unknown'), unsure: true }];
}

function paras(g: Game, p: Parameters<typeof resolveParas>[0], pid: PlayerId): string[] {
  return resolveParas(p, (c) => g.test(c, pid)).map((t) => g.render(t, pid));
}

function groups(g: Game, pid: PlayerId): GroupView[] {
  const out: GroupView[] = [];
  const locs = [...g.ix.c.locations].sort((a, b) => a.order - b.order);
  const here = g.p(pid).at;
  for (const loc of locs) {
    if ((loc.area ?? g.ix.homeArea) !== here) continue;
    if (!g.test(loc.visible, pid)) continue;
    const entries: EntryView[] = [];
    for (const sc of g.ix.c.scenes) {
      if (sc.group !== loc.id || sc.label === undefined) continue;
      if (!g.sceneOrPoolVisible(sc, pid)) continue;
      const reason = g.proposalBlock(sc, pid);
      entries.push({
        id: sc.id,
        kind: 'scene',
        label: g.render(sc.label, pid),
        enabled: reason === null,
        reason: shownReason(g, reason),
        cost: costView(g, sc.cost),
        gain: sceneGains(g, sc, pid),
        together: true,
      });
    }
    for (const pool of g.ix.c.pools) {
      if (pool.group !== loc.id) continue;
      if (!g.sceneOrPoolVisible(pool, pid)) continue;
      const reason = g.proposalBlock(pool, pid);
      entries.push({
        id: pool.id,
        kind: 'pool',
        label: g.render(pool.label, pid),
        enabled: reason === null,
        reason: shownReason(g, reason),
        hint: pool.hint ? g.render(pool.hint, pid) : undefined,
        cost: costView(g, pool.cost),
        gain: sceneGains(g, pool, pid),
        together: true,
      });
    }
    for (const a of g.ix.c.actions) {
      if (a.group !== loc.id) continue;
      if (!g.actionVisible(a, pid)) continue;
      const reason = g.actionBlock(a, pid);
      const cd = g.p(pid).cooldowns[a.id] ?? 0;
      entries.push({
        id: a.id,
        kind: 'act',
        label: g.render(a.label, pid),
        enabled: reason === null,
        reason: shownReason(g, reason),
        hint: a.hint ? g.render(a.hint, pid) : undefined,
        cost: costView(g, a.cost),
        gain: actionGains(g, a, pid),
        readyAt: cd > g.now ? cd : undefined,
        cooldown: Math.round(a.cooldown * g.cooldownMult(g.ix.areaOf(a.group))),
      });
    }
    const partner = mateEntries(g, pid, loc.id);
    out.push({ id: loc.id, name: loc.name, desc: g.render(loc.desc, pid), base: !!loc.base, entries, ...(partner.length ? { partner } : {}) });
  }
  return out;
}

/**
 * Actions here that only the partner's role can do: shown read-only, wherever the partner is,
 * so a player knows what the other one could make of the shared stores.
 */
function mateEntries(g: Game, pid: PlayerId, locId: string): MateEntryView[] {
  const other = g.other(pid);
  const o = g.p(other);
  const me = g.p(pid);
  if (!o.joined || !o.role || o.role === me.role) return [];
  const out: MateEntryView[] = [];
  for (const a of g.ix.c.actions) {
    if (a.group !== locId || a.role !== o.role) continue;
    // visible to the partner, as if they stood here
    if (a.once && g.flag(`built:${a.id}`)) continue;
    if (a.oncePerPlayer && o.flags[`built:${a.id}`]) continue;
    if (a.visible && !g.test(a.visible, other)) continue;
    const away = o.at !== g.ix.areaOf(a.group);
    const block = away || !o.online ? null : g.actionBlock(a, other);
    const reason = !o.online
      ? g.render(g.ix.ui('mate_offline'), pid)
      : away
        ? g.render(g.ix.ui('mate_away'), pid)
        : shownReason(g, block);
    out.push({
      id: a.id,
      label: g.render(a.label, other),
      ready: o.online && !away && block === null,
      ...(reason ? { reason } : {}),
      cost: costView(g, a.cost),
      gain: actionGains(g, a, other),
    });
  }
  return out;
}

function optionLabel(g: Game, def: SceneDef, nodeId: string, optId: string | undefined, pid: PlayerId): string {
  if (!optId) return '';
  const n = def.nodes[nodeId];
  if (!n || n.type !== 'choice') return '';
  const o = n.options.find((x) => x.id === optId);
  return o ? g.render(o.label, pid) : '';
}

function sceneView(g: Game, pid: PlayerId): SceneView | null {
  const sc = g.s.scene;
  if (!sc) return null;
  const def = g.ix.scenes.get(sc.id)!;
  const role = g.p(pid).role;
  const other = g.other(pid);
  const blocks: SceneBlock[] = [];
  for (const t of sc.trail) {
    const n = def.nodes[t.node]!;
    const b: SceneBlock = {
      text: paras(g, n.text, pid),
      own: role === 'hunter' ? paras(g, n.hunter, pid) : role === 'maker' ? paras(g, n.maker, pid) : [],
    };
    if (t.picks && n.type === 'choice') {
      const mine = optionLabel(g, def, t.node, t.picks[pid], pid);
      const theirs = optionLabel(g, def, t.node, t.picks[other], pid);
      if (n.mode === 'any') {
        const who = t.picks[pid] ? g.ix.ui('pick_you') : g.render(g.ix.ui('pick_partner'), pid);
        b.picks = `${who}: ${mine || theirs}`;
      } else if (mine && theirs && mine === theirs) {
        b.picks = `${g.ix.ui('pick_both')}: ${mine}`;
      } else {
        b.picks = `${g.ix.ui('pick_you')}: ${mine} · ${g.render(g.ix.ui('pick_partner'), pid)}: ${theirs}`;
      }
    }
    if (t.combat) b.combat = t.combat[pid];
    blocks.push(b);
  }

  const n = def.nodes[sc.node]!;
  const view: SceneView = {
    id: sc.id,
    title: def.title,
    paused: sc.paused,
    pausedText: sc.paused ? g.render(g.ix.ui('scene_paused'), pid) : undefined,
    blocks,
    kind: n.type === 'choice' ? 'choice' : n.type === 'combat' ? 'combat' : 'text',
    partnerPicked: false,
    waiting: false,
  };

  if (n.type === 'choice') {
    const cn = n as ChoiceNode;
    view.mode = cn.mode;
    view.options = cn.options
      .filter((o) => g.optionVisible(o, pid, sc.node))
      .map((o): OptionView => {
        const wrongRole = !!o.role && role !== o.role;
        const blocked = !!o.enabled && !g.test(o.enabled, pid);
        return {
          id: o.id,
          label: g.render(o.label, pid),
          enabled: !wrongRole && !blocked,
          reason: wrongRole
            ? `${g.ix.ui('only')} ${g.ix.c.roleTitles[o.role!][g.p(pid).gender]}`
            : blocked
              ? o.disabledHint ? g.render(o.disabledHint, pid) : g.ix.ui('err_not_now')
              : undefined,
        };
      });
    view.myPick = sc.picks[pid];
    view.partnerPicked = !!sc.picks[other];
    if (view.myPick && !view.partnerPicked) {
      view.waiting = true;
      view.waitingText = g.render(g.ix.ui('wait_choice'), pid);
    }
  } else if (n.type === 'combat' && sc.combat) {
    const cb = sc.combat;
    const enc = g.ix.enc.get(cb.enc)!;
    view.options = g.combatOptions(enc, pid).map((o) => {
      const wrongRole = !!o.role && role !== o.role;
      const affordable = g.hasCost(o.cost);
      return {
        id: o.id,
        label: g.render(o.label, pid),
        enabled: !wrongRole && affordable,
        reason: !affordable ? g.ix.ui('err_cost') : undefined,
      };
    });
    view.myPick = cb.picks[pid];
    view.partnerPicked = !!cb.picks[other];
    if (view.myPick && !view.partnerPicked) {
      view.waiting = true;
      view.waitingText = g.render(g.ix.ui('wait_choice'), pid);
    }
    view.combat = {
      enemy: enc.enemy.name,
      hp: Math.max(0, cb.hp),
      hpMax: enc.enemy.hp,
      fear: Math.min(cb.fear, enc.enemy.fear),
      fearMax: enc.enemy.fear,
      round: cb.round,
      lastRound: cb.lastRound[pid] ?? [],
    };
  } else {
    view.button = n.type !== 'combat' && n.button ? g.render(n.button, pid) : undefined;
    if (sc.ready[pid]) {
      view.waiting = true;
      view.waitingText = g.render(g.ix.ui('wait_read'), pid);
    }
  }
  return view;
}

export function buildView(g: Game, pid: PlayerId): PlayerView {
  const me = g.p(pid);
  const other = g.other(pid);
  const o = g.p(other);
  const ui = (k: string): string => g.ix.ui(k);

  const res = g.ix.c.resources
    .filter((r) => !r.hidden && ((g.s.res[r.id] ?? 0) > 0 || g.s.seenRes[r.id]))
    .sort((a, b) => a.order - b.order)
    .map((r) => {
      const cap = g.cap(r.id);
      return {
        id: r.id,
        name: r.name,
        n: g.s.res[r.id] ?? 0,
        cap: Number.isFinite(cap) && r.kind !== 'tool' ? cap : undefined,
        kind: r.kind ?? 'res',
      };
    });

  const stoveState = g.stoveState();
  // The stove is in Ясенець: elsewhere its state is not shown.
  const stoveText = stoveState === 'never' || me.at !== g.ix.homeArea ? '' : ui(`stove_${stoveState}`);

  const amb = g.ix.c.ambient;
  const here = me.at;
  let ambKind = (amb?.areas[here] ?? 'snow') as PlayerView['ambient']['kind'];
  for (const o2 of amb?.overrides ?? [])
    if (g.test(o2.when, pid)) {
      ambKind = o2.kind;
      break;
    }
  let fire: PlayerView['ambient']['fire'] = 'none';
  if (here === g.ix.homeArea) fire = stoveState === 'never' ? 'none' : stoveState;
  else if (amb?.fires?.[here] && g.test(amb.fires[here]!, pid)) fire = 'warm';
  if (ambKind === 'cellar' || ambKind === 'candle') fire = 'none';
  const fxOf = (pl: typeof me) =>
    pl.busy && pl.busy.until > g.now ? (amb?.actions[pl.busy.action] ?? null) : null;
  const fx = fxOf(me);
  const partnerFx = o.joined && o.online && o.at === here ? fxOf(o) : null;
  const ambient: PlayerView['ambient'] = {
    kind: ambKind,
    fire,
    fx,
    partnerFx,
    fxUntil: fx ? me.busy!.until : 0,
    partnerFxUntil: partnerFx ? o.busy!.until : 0,
  };

  let partnerBusy: { text: string; from: number; until: number } | null = null;
  if (o.busy && o.busy.until > g.now) {
    const a = g.ix.actions.get(o.busy.action);
    if (a?.busy) {
      const dur = Math.round(a.cooldown * g.cooldownMult(g.ix.areaOf(a.group)));
      const text = g.render(a.busy, pid, other);
      partnerBusy = { text: text.charAt(0).toLowerCase() + text.slice(1), from: o.busy.until - dur, until: o.busy.until };
    }
  }

  const pr = g.s.proposal;
  let proposal: PlayerView['proposal'] = null;
  if (pr) {
    const sc = g.ix.scenes.get(pr.scene)!;
    const via = g.ix.entry(pr.via);
    const label = via && via.kind !== 'act' ? g.render(via.def.label, pid) : sc.title;
    proposal = {
      title: sc.title,
      label,
      mine: pr.by === pid,
      text: g.render(pr.by === pid ? ui('proposal_mine') : ui('proposal_theirs'), pid),
    };
  }

  const clues: ClueView[] = [];
  for (const [id, rec] of Object.entries(g.s.clues)) {
    if (!rec.who.includes(pid)) continue;
    const def = g.ix.clues.get(id);
    if (!def) continue;
    clues.push({ id, title: def.title, text: g.render(def.text, pid), personal: def.to !== 'both', at: rec.at, mystery: def.mystery });
  }
  clues.sort((a, b) => b.at - a.at);

  const questions = g.ix.c.mysteries
    .filter((m) => (g.s.mysteries[m.id] ?? 0) > 0)
    .sort((a, b) => a.order - b.order)
    .map((m) => {
      const level = g.s.mysteries[m.id] ?? 0;
      return { id: m.id, question: m.question, level, levelText: ui(`level_${level}`) };
    });

  const people = g.ix.c.npcs
    .filter((n) => g.s.npcs[n.id]?.met)
    .map((n) => ({ id: n.id, name: g.render(n.name, pid), desc: g.render(n.desc, pid) }));

  const log: LogView[] = [];
  for (let i = g.s.log.length - 1; i >= 0 && log.length < LOG_SEND; i--) {
    const e = g.s.log[i]!;
    const text = e.text[pid];
    if (!text) continue;
    log.push({ id: e.id, t: e.t, kind: e.kind, mine: e.actor === pid, partner: e.actor === other, text });
  }
  log.reverse();

  const goalDef = g.s.goal ? g.ix.goals.get(g.s.goal) : undefined;
  // The "end of act" banner only makes sense while no later act exists in this build.
  const lastAct = Math.max(0, ...Object.keys(g.ix.c.actEnd).map(Number));
  const actDone = g.s.meta.actDone > 0 && g.s.meta.actDone >= lastAct && g.ix.c.actEnd[g.s.meta.actDone]
    ? { act: g.s.meta.actDone, text: g.render(g.ix.c.actEnd[g.s.meta.actDone], pid) }
    : null;

  return {
    now: g.now,
    me: {
      pid,
      area: me.at,
      where: g.ix.areaWhere(me.at),
      name: me.name,
      gender: me.gender,
      role: me.role!,
      roleTitle: g.roleTitle(pid),
      hp: me.hp,
      hpMax: me.hpMax,
    },
    partner: {
      pid: other,
      joined: o.joined,
      name: o.joined ? o.name : '',
      gender: o.gender,
      role: o.role,
      roleTitle: o.joined ? g.roleTitle(other) : '',
      online: o.joined && o.online,
      area: o.at,
      where: g.ix.areaWhere(o.at),
      busy: partnerBusy,
      hp: o.hp,
      hpMax: o.hpMax,
    },
    day: g.s.meta.day,
    act: g.s.meta.act,
    goal: goalDef ? g.render(goalDef.text, pid) : null,
    stove: { state: stoveState, text: stoveText },
    ambient,
    status: [],
    res,
    groups: groups(g, pid),
    proposal,
    scene: sceneView(g, pid),
    log,
    journal: { clues, questions, people },
    actDone,
    busyUntil: me.busy && me.busy.until > g.now ? me.busy.until : 0,
    busyFrom:
      me.busy && me.busy.until > g.now
        ? me.busy.until -
          Math.round((g.ix.actions.get(me.busy.action)?.cooldown ?? 0) * g.cooldownMult(g.ix.areaOf(g.ix.actions.get(me.busy.action)?.group)))
        : 0,
    busyAction: me.busy && me.busy.until > g.now ? me.busy.action : null,
  };
}
