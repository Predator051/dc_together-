import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { EntryView, GroupView, MateEntryView, PlayerView, SummaryView, WelcomeView } from '../../shared/src/protocol.js';
import type { NetState } from './net.js';
import { net } from './net.js';
import { Ambient } from './ambient.js';
import { Notes, useSeenClues } from './notes.js';
import { notifier } from './notify.js';
import { sound } from './sound.js';
import { Scene } from './scene.js';
import { IconBell, IconBellOff, IconDown, IconFlame, IconLock, IconLog, IconMute, IconNotes, IconPair, IconPin, IconSnow, IconSound, IconWork } from './icons.js';
import { T } from './strings.js';

type Tab = 'work' | 'notes' | 'log';

/** A button unlocks this long after the server says it may (absorbs clock jitter). */
const SAFETY_MS = 150;

/**
 * Current server time. Instead of ticking constantly, the component re-renders exactly when
 * something visible changes: a countdown second rolls over or a lock ends. Progress bars are
 * pure CSS animations, so they run at the display's refresh rate without re-rendering.
 */
function useServerClock(offset: number, moments: number[]): number {
  const [, force] = useState(0);
  const now = Date.now() + offset;
  useEffect(() => {
    let dt = Infinity;
    for (const t of moments) {
      const left = t - now;
      if (left <= 0) continue;
      dt = Math.min(dt, left, left % 1000 || 1000);
    }
    if (!Number.isFinite(dt)) return;
    const id = window.setTimeout(() => force((x) => x + 1), dt + 10);
    return () => window.clearTimeout(id);
  });
  useEffect(() => {
    const onShow = () => force((x) => x + 1);
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, []);
  return now;
}

/**
 * Progress fill animated by CSS (transform: scaleX), started from the current fraction.
 * Re-key it by `until` so a new task starts a fresh animation.
 */
function Fill({ from, until, offset, cls }: { from: number; until: number; offset: number; cls: string }) {
  const [start] = useState(() => {
    const now = Date.now() + offset;
    const span = Math.max(1, until - from);
    return { p: Math.max(0, Math.min(1, (now - from) / span)), left: Math.max(0, until - now) };
  });
  return <span class={`anim-fill ${cls}`} style={{ '--p0': String(start.p), animationDuration: `${start.left}ms` }} />;
}

function useMedia(query: string): boolean {
  const [hit, setHit] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setHit(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return hit;
}

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function secsLeft(until: number, now: number): string {
  return `${Math.max(1, Math.ceil((until - now) / 1000))} ${T.sec}`;
}

interface Ctx {
  v: PlayerView;
  now: number;
  offset: number;
  locked: boolean;
}

/** A one-off "echo" ring when a task this tile was running comes to an end. */
function useEcho(running: boolean): number {
  const [ring, setRing] = useState(0);
  const was = useRef(running);
  useEffect(() => {
    if (was.current && !running) setRing(Date.now());
    was.current = running;
  }, [running]);
  useEffect(() => {
    if (!ring) return;
    const id = window.setTimeout(() => setRing(0), 1200);
    return () => window.clearTimeout(id);
  }, [ring]);
  return ring;
}

function Entry({ e, c }: { e: EntryView; c: Ctx }) {
  const { v, now } = c;
  const busy = v.busyUntil + SAFETY_MS > now;
  const mine = v.busyAction === e.id && v.busyUntil > now;
  const recharge = e.readyAt && e.readyAt + SAFETY_MS > now ? e.readyAt : 0;
  const disabled = c.locked || !e.enabled || (e.kind === 'act' && (busy || !!recharge));
  const reason = e.enabled ? (recharge ? secsLeft(recharge, now) : null) : e.reason;
  const gains = e.gain ?? [];
  const costs = e.cost ?? [];
  const meta = gains.length > 0 || costs.length > 0 || !!reason || !!e.hint;
  const ring = useEcho(mine);

  return (
    <button
      class={`tile ${e.together ? 'together' : ''} ${mine ? 'running' : ''} ${!e.enabled ? 'blocked' : ''}`}
      disabled={disabled}
      onClick={() => net.send({ c: 'act', id: e.id })}
    >
      {mine && <Fill key={v.busyUntil} from={v.busyFrom} until={v.busyUntil} offset={c.offset} cls="tile-fill" />}
      {ring > 0 && <span key={ring} class="ring" aria-hidden="true" />}
      <span class="tile-top">
        <span class="tile-label">{e.label}</span>
        {mine ? (
          <span class="tile-secs">{secsLeft(v.busyUntil, now)}</span>
        ) : (
          e.together && (
            <span class="pill pair">
              <IconPair />
              {T.together}
            </span>
          )
        )}
      </span>
      {meta && (
        <span class="tile-meta">
          {gains.map((x) => (
            <span class={`m gain ${x.unsure ? 'unsure' : ''}`}>{x.text}</span>
          ))}
          {costs.map((c) =>
            c.stock ? (
              <span class="m stock-left">
                {c.name}: {c.have}
              </span>
            ) : (
              <span class={`m cost ${c.ok ? '' : 'short'}`}>
                −{c.n} {c.name}
                {!c.ok && ` (${T.have} ${c.have})`}
              </span>
            ),
          )}
          {reason && (
            <span class="m reason">
              {!e.enabled && <IconLock />}
              {reason}
            </span>
          )}
          {!reason && e.hint && <span class="m hint">{e.hint}</span>}
        </span>
      )}
    </button>
  );
}

/** What only the partner can do here: read-only, folded by default (the choice is remembered). */
function MateList({ items, name }: { items: MateEntryView[]; name: string }) {
  const [open, setOpen] = useState(() => load('bezgomin.mate') === 'open');
  const toggle = () => {
    store('bezgomin.mate', open ? 'closed' : 'open');
    setOpen(!open);
  };
  const ready = items.filter((m) => m.ready).length;
  // "not online" / "elsewhere" applies to everything: say it once, in the header
  const common = items[0]?.reason && items.every((m) => m.reason === items[0]!.reason) ? items[0]!.reason : null;
  return (
    <div class={`mate-list ${open ? 'open' : ''}`}>
      <button type="button" class="mate-list-head" aria-expanded={open} onClick={toggle}>
        <span class="avatar small">{name.slice(0, 1).toUpperCase()}</span>
        <span class="mate-list-title">
          {name} {T.mateCan}
          <span class="mate-list-count">
            {items.length}
            {ready > 0 && ready < items.length && ` · ${T.mateNow} ${ready}`}
          </span>
          {common && <span class="mate-list-note">{common}</span>}
        </span>
        <IconDown class="topic-chev" />
      </button>
      {open && (
        <ul class="mate-items">
          {items.map((m) => (
            <li class={`mate-item ${m.ready ? 'ready' : ''}`}>
              <span class="mate-item-label">{m.label}</span>
              <span class="tile-meta">
                {(m.gain ?? []).map((x) => (
                  <span class={`m gain ${x.unsure ? 'unsure' : ''}`}>{x.text}</span>
                ))}
                {(m.cost ?? []).map((c) =>
                  c.stock ? null : (
                    <span class={`m cost ${c.ok ? '' : 'short'}`}>
                      −{c.n} {c.name}
                      {!c.ok && ` (${T.have} ${c.have})`}
                    </span>
                  ),
                )}
                {m.reason && !common && <span class="m reason">{m.reason}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Group({ g, c }: { g: GroupView; c: Ctx }) {
  return (
    <section class={`group ${g.base ? 'base' : ''}`}>
      <header class="group-head">
        <h3>{g.name}</h3>
        {g.desc && <p class="desc">{g.desc}</p>}
        {g.progress && (
          <div class={`work ${g.progress.n >= g.progress.max ? 'done' : ''}`}>
            <span class="work-label">{g.progress.label}</span>
            <span class="work-bar" aria-hidden="true">
              <span style={{ width: `${(g.progress.n / g.progress.max) * 100}%` }} />
            </span>
            <b>
              {g.progress.n}/{g.progress.max}
            </b>
          </div>
        )}
      </header>
      <div class="tiles">
        {g.entries.map((e) => (
          <Entry key={e.id} e={e} c={c} />
        ))}
      </div>
      {g.partner && g.partner.length > 0 && <MateList items={g.partner} name={c.v.partner.name} />}
    </section>
  );
}

function Stock({ v }: { v: PlayerView }) {
  const res = v.res.filter((r) => r.kind === 'res');
  const tools = v.res.filter((r) => r.kind === 'tool' && r.n > 0);
  const folk = v.res.filter((r) => r.kind === 'people' && r.n > 0);
  if (res.length === 0 && tools.length === 0 && folk.length === 0) return null;
  return (
    <section class="stock">
      {res.length > 0 && (
        <>
          <h3>{T.stock}</h3>
          <dl class="ledger">
            {res.map((r) => (
              <div
                class={`ledger-row ${r.cap !== undefined && r.n >= r.cap ? 'full' : ''} ${r.n === 0 ? 'empty' : ''}`}
              >
                <dt>{r.name}</dt>
                <dd>
                  {r.n}
                  {r.cap !== undefined && <small>/{r.cap}</small>}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
      {folk.length > 0 && (
        <p class="inline-list folk">
          <span class="il-head">{T.folk}:</span>{' '}
          {folk.map((r, i) => (
            <span>
              {i > 0 && ', '}
              {r.name} <b>{r.n}</b>
            </span>
          ))}
        </p>
      )}
      {tools.length > 0 && (
        <p class="inline-list tools">
          <span class="il-head">{T.items}:</span> {tools.map((r) => r.name).join(', ')}.
        </p>
      )}
    </section>
  );
}

function SoundToggle() {
  const [, force] = useState(0);
  useEffect(() => sound.subscribe(() => force((x) => x + 1)), []);
  const label = sound.on ? T.soundOff : T.soundOn;
  return (
    <button class={`sound-toggle ${sound.on ? 'on' : ''}`} aria-label={label} title={label} onClick={() => sound.toggle()}>
      {sound.on ? <IconSound /> : <IconMute />}
    </button>
  );
}

function NotifyToggle() {
  const [, force] = useState(0);
  useEffect(() => notifier.subscribe(() => force((x) => x + 1)), []);
  const label = notifier.on ? T.notifyOff : T.notifyOn;
  const click = async () => {
    const err = await notifier.toggle({ denied: T.notifyDenied, unsupported: T.notifyUnsupported });
    if (err) net.showToast(err);
  };
  return (
    <button class={`sound-toggle ${notifier.on ? 'on' : ''}`} aria-label={label} title={label} onClick={click}>
      {notifier.on ? <IconBell /> : <IconBellOff />}
    </button>
  );
}

function plus(n: number): string {
  return n > 0 ? `+${n}` : `−${-n}`;
}

/** "While you were away": shown once after a real absence. */
function Welcome({ w, partner }: { w: WelcomeView; partner: string }) {
  return (
    <div class="sheet-wrap" role="dialog" aria-labelledby="welcome-title">
      <section class="sheet">
        <h2 id="welcome-title">{T.awayTitle}</h2>
        {w.days > 0 && (
          <p class="sheet-line">
            <span class="sheet-key">{T.awayDays}</span> <b>{w.days}</b>
          </p>
        )}
        {w.res.length > 0 && (
          <div class="sheet-block">
            <h3>{T.awayStock}</h3>
            <p class="sheet-deltas">
              {w.res.map((r) => (
                <span class={r.n > 0 ? 'plus' : 'minus'}>
                  {r.name} {plus(r.n)}
                </span>
              ))}
            </p>
          </div>
        )}
        {w.lines.length > 0 && (
          <div class="sheet-block">
            <h3>{partner}</h3>
            <div class="log">
              {w.lines.map((l) => (
                <p class="from-partner">{l}</p>
              ))}
            </div>
          </div>
        )}
        {w.clues > 0 && (
          <p class="sheet-line">
            <span class="sheet-key">{T.awayClues}</span> <b>{w.clues}</b>
          </p>
        )}
        <button class="btn primary sheet-ok" onClick={() => net.send({ c: 'ack', what: 'welcome' })}>
          {T.ok}
        </button>
      </section>
    </div>
  );
}

const ACT_NAMES = ['', T.act1, T.act2, T.act3, T.act4, T.act5];

/** The end of an act: what the two of you have been through, in numbers. */
function Summary({ s, me, partner }: { s: SummaryView; me: string; partner: string }) {
  const rows: Array<[string, string | number]> = [
    [T.sDays, s.days],
    [T.sPlaces, s.places],
    [T.sScenes, s.scenes],
    [T.sClues, s.clues],
    [T.sCluesMine, s.cluesMine],
    [T.sSolved, s.solved],
    [T.sPeople, s.people],
    [T.sFights, s.fights],
  ];
  const counted: Array<[string, string | number]> = [
    [T.sSuppers, s.suppers],
    [T.sCrafted, s.crafted],
    [T.sTrips, s.trips],
  ];
  const anyCounted = s.actions.me + s.actions.partner > 0;
  return (
    <div class="sheet-wrap" role="dialog" aria-labelledby="summary-title">
      <section class="sheet summary">
        <h2 id="summary-title">
          {T.summaryTitle} {ACT_NAMES[s.act] ?? s.act}
        </h2>
        <dl class="ledger summary-ledger">
          {rows
            .filter(([, v]) => v !== 0)
            .map(([k, v]) => (
              <div class="ledger-row">
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          {anyCounted &&
            counted
              .filter(([, v]) => v !== 0)
              .map(([k, v]) => (
                <div class="ledger-row">
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
        </dl>
        {anyCounted && (
          <div class="sheet-block">
            <h3>{T.sActions}</h3>
            <p class="sheet-line">
              {me} <b>{s.actions.me}</b> · {partner} <b>{s.actions.partner}</b>
            </p>
          </div>
        )}
        {s.gathered.length > 0 && (
          <div class="sheet-block">
            <h3>{T.sGathered}</h3>
            <p class="sheet-deltas">
              {s.gathered.map((r) => (
                <span class="plus">
                  {r.name} {r.n}
                </span>
              ))}
            </p>
          </div>
        )}
        {!anyCounted && <p class="sheet-note">{T.sSince}</p>}
        <button class="btn primary sheet-ok" onClick={() => net.send({ c: 'ack', what: 'summary' })}>
          {T.next}
        </button>
      </section>
    </div>
  );
}

function Partner({ v, now, offset }: { v: PlayerView; now: number; offset: number }) {
  const p = v.partner;
  if (!p.joined)
    return (
      <div class="mate off">
        <span class="avatar">?</span>
        <span class="mate-status muted">{T.partnerNone}</span>
      </div>
    );
  const working = p.online && p.busy && p.busy.until > now ? p.busy : null;
  const status = !p.online ? T.partnerOffline : working ? working.text : T.partnerIdle;
  return (
    <div class={`mate ${p.online ? 'on' : 'off'}`}>
      <span class="avatar">
        {p.name.slice(0, 1).toUpperCase()}
        {working && <span key={working.from} class="ring" aria-hidden="true" />}
      </span>
      <span class="mate-body">
        <span class="mate-line">
          <b>{p.name}</b>
          {p.area !== v.me.area && (
            <span class="mate-where">
              <IconPin />
              {p.where}
            </span>
          )}
        </span>
        <span class="mate-status">
          <span class="status-text">{status}</span>
          {working && (
            <span class="mini-bar" aria-hidden="true">
              <Fill key={working.until} from={working.from} until={working.until} offset={offset} cls="" />
            </span>
          )}
        </span>
      </span>
    </div>
  );
}

function Log({ v }: { v: PlayerView }) {
  const items = [...v.log].reverse();
  if (!items.length) return <p class="empty">{T.emptyLog}</p>;
  return (
    <div class="log">
      {items.map((l, i) => (
        <p key={l.id} class={`log-${l.kind} ${l.partner ? 'from-partner' : ''} ${i < 3 ? 'fresh' : ''}`}>
          {l.text}
        </p>
      ))}
    </div>
  );
}

export function Game({ s }: { s: NetState }) {
  const v = s.view!;
  const [tab, setTab] = useState<Tab>((load('bezgomin.tab') as Tab) || 'work');
  const moments: number[] = [v.busyUntil, v.busyUntil + SAFETY_MS];
  for (const g of v.groups) for (const e of g.entries) if (e.readyAt) moments.push(e.readyAt, e.readyAt + SAFETY_MS);
  if (v.partner.busy) moments.push(v.partner.busy.until);
  moments.push(v.ambient.fxUntil, v.ambient.partnerFxUntil);
  const now = useServerClock(s.offset, moments);
  // Pending clicks are swallowed in net.send (no visual flicker); a stale view locks visibly.
  const locked = s.stale || !s.connected;
  const ctx: Ctx = { v, now, offset: s.offset, locked };
  const [seen, markSeen] = useSeenClues(v.journal.clues.map((c) => c.id));
  const newNotes = v.journal.clues.some((c) => !seen.has(c.id));
  const desktop = useMedia('(min-width: 960px)');
  const [side, setSide] = useState<'log' | 'notes'>(load('bezgomin.side') === 'notes' ? 'notes' : 'log');
  useEffect(() => store('bezgomin.side', side), [side]);

  useEffect(() => store('bezgomin.tab', tab), [tab]);

  // The partner calls you: a knock.
  const calling = v.proposal && !v.proposal.mine ? v.proposal.label : null;
  useEffect(() => {
    if (!calling) return;
    sound.call();
    notifier.ping('call', `${v.partner.name} ${T.notifyCalls}`, `«${calling}»`);
  }, [calling]);

  // A scene begins (e.g. the partner accepted while this tab was in the background).
  const sceneId = v.scene?.id ?? null;
  useEffect(() => {
    if (sceneId && v.scene) notifier.ping('scene', `${T.notifyScene}: ${v.scene.title}`);
  }, [sceneId]);

  // The partner comes back.
  const partnerOn = v.partner.online;
  const wasOn = useRef(partnerOn);
  useEffect(() => {
    if (partnerOn && !wasOn.current) notifier.ping('back', `${v.partner.name} ${T.notifyBack}`);
    wasOn.current = partnerOn;
  }, [partnerOn]);

  // A long task of mine is done while the game is in the background.
  const running = v.busyUntil > now ? v.busyAction : null;
  const lastRun = useRef<{ id: string; long: boolean } | null>(null);
  useEffect(() => {
    if (running) {
      const label = v.groups.flatMap((g) => g.entries).find((e) => e.id === running)?.label ?? '';
      lastRun.current = { id: label, long: v.busyUntil - v.busyFrom >= 20_000 };
    } else if (lastRun.current) {
      if (lastRun.current.long) notifier.ping('done', T.notifyDone, lastRun.current.id);
      lastRun.current = null;
    }
  }, [running]);

  useEffect(() => {
    if (!s.toast) return;
    const id = window.setTimeout(() => net.clearToast(), 2500);
    return () => window.clearTimeout(id);
  }, [s.toast?.id]);

  const hasNotes = v.journal.clues.length + v.journal.questions.length + v.journal.people.length > 0;
  const groups = useMemo(() => v.groups.filter((g) => g.entries.length > 0 || g.desc), [v.groups]);

  const tabs: Array<{ id: Tab; label: string; icon: JSX.Element; badge?: boolean }> = [
    { id: 'work', label: T.tabWork, icon: <IconWork /> },
    ...(hasNotes ? [{ id: 'notes' as Tab, label: T.tabNotes, icon: <IconNotes />, badge: newNotes && tab !== 'notes' }] : []),
    { id: 'log', label: T.tabLog, icon: <IconLog /> },
  ];

  const work = (
    <div class="work">
      {v.actDone && (
        <section class="panel actdone">
          <h3>{T.actDone}</h3>
          <p>{v.actDone.text}</p>
        </section>
      )}
      {v.goal && (
        <p class="goal">
          <span class="goal-label">{T.goal}.</span> {v.goal}
        </p>
      )}
      {v.stove.text && (
        <p class={`stove ${v.stove.state}`}>
          {v.stove.state === 'cold' ? <IconSnow /> : <IconFlame />}
          <span>{v.stove.text}</span>
        </p>
      )}
      <div class="only-mobile">
        <Stock v={v} />
      </div>
      {groups.map((g) => (
        <Group key={g.id} g={g} c={ctx} />
      ))}
    </div>
  );

  return (
    <div class="game">
      <Ambient
        a={{
          ...v.ambient,
          // accents stop exactly when the action runs out, without waiting for the next update
          fx: v.ambient.fxUntil > now ? v.ambient.fx : null,
          partnerFx: v.ambient.partnerFxUntil > now ? v.ambient.partnerFx : null,
        }}
        paused={!!v.scene}
        mood={v.scene && !v.scene.paused ? v.scene.mood : null}
        dayAt={v.dayAt}
        offset={s.offset}
      />
      <header class="top">
        <span class="brand">{T.title}</span>
        <div class="top-info">
          <span class="place">
            <IconPin />
            <span>{v.me.where}</span>
          </span>
          {v.day > 0 && (
            <span class="day">
              {T.day} {v.day}
            </span>
          )}
          <NotifyToggle />
          <SoundToggle />
          <span class={`net ${s.connected ? 'ok' : 'bad'}`} title={s.connected ? T.onlineDot : T.offlineDot} />
        </div>
        <Partner v={v} now={now} offset={s.offset} />
        {!s.connected && <div class="warn-bar">{T.reconnecting}</div>}
        {v.busyUntil > now && (
          <div class="me-progress" aria-hidden="true">
            <Fill key={v.busyUntil} from={v.busyFrom} until={v.busyUntil} offset={s.offset} cls="" />
          </div>
        )}
      </header>

      <main class="layout">
        <aside class="col-left only-desktop">
          <Stock v={v} />
        </aside>
        <div class={`col-mid ${tab === 'work' ? '' : 'hide-mobile'}`}>
          {work}
          <div class="only-mobile mini-log">
            <Log v={{ ...v, log: v.log.slice(-4) }} />
          </div>
        </div>
        <div class={`col-notes only-mobile ${tab === 'notes' ? '' : 'hide-mobile'}`}>
          {!desktop && <Notes v={v} seen={seen} markSeen={markSeen} active={tab === 'notes'} />}
        </div>
        <aside class={`col-right ${tab === 'log' ? '' : 'hide-mobile'}`}>
          {desktop && hasNotes && (
            <div class="side-switch" role="tablist">
              <button role="tab" aria-selected={side === 'log'} class={side === 'log' ? 'on' : ''} onClick={() => setSide('log')}>
                <IconLog />
                {T.tabLog}
              </button>
              <button
                role="tab"
                aria-selected={side === 'notes'}
                class={side === 'notes' ? 'on' : ''}
                onClick={() => setSide('notes')}
              >
                <IconNotes />
                {T.tabNotes}
                {newNotes && side !== 'notes' && <span class="badge" />}
              </button>
            </div>
          )}
          {desktop && !hasNotes && <h3>{T.tabLog}</h3>}
          {desktop && hasNotes && side === 'notes' ? (
            <Notes v={v} seen={seen} markSeen={markSeen} active />
          ) : (
            <Log v={v} />
          )}
        </aside>
      </main>

      <nav class="bottom-nav only-mobile">
        {tabs.map((t) => (
          <button
            class={tab === t.id ? 'on' : ''}
            onClick={() => {
              setTab(t.id);
              window.scrollTo({ top: 0 });
            }}
          >
            <span class="nav-ico">
              {t.icon}
              {t.badge && <span class="badge" />}
            </span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      {v.proposal && !v.scene && (
        <div class="proposal">
          {v.proposal.mine ? (
            <>
              <span class="proposal-text">
                <IconPair />
                <span>{v.proposal.text}</span>
              </span>
              <button class="btn small" disabled={locked} onClick={() => net.send({ c: 'cancel' })}>
                {T.cancel}
              </button>
            </>
          ) : (
            <>
              <span class="proposal-text">
                <span class="call">
                  <IconPair />
                  <span class="ring" aria-hidden="true" />
                </span>
                <span>
                  {v.proposal.text} <b>«{v.proposal.label}»</b>
                </span>
              </span>
              <div class="row">
                <button class="btn primary small" disabled={locked} onClick={() => net.send({ c: 'accept' })}>
                  {T.accept}
                </button>
                <button class="btn small" disabled={locked} onClick={() => net.send({ c: 'decline' })}>
                  {T.decline}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {v.scene && <Scene v={v} sc={v.scene} locked={locked} />}
      {!v.scene && v.summary && <Summary s={v.summary} me={v.me.name} partner={v.partner.name} />}
      {!v.scene && !v.summary && v.welcome && <Welcome w={v.welcome} partner={v.partner.name} />}
      {s.toast && <div class="toast">{s.toast.text}</div>}
      {s.deltas.length > 0 && (
        <div class="deltas" aria-live="polite">
          {s.deltas.map((d) => (
            <div key={d.id} class={`delta from-${d.by}`}>
              {d.by !== 'me' && <span class="who">{d.by === 'both' ? T.deltaBoth : v.partner.name}</span>}
              {d.items.map((it) => (
                <span class={`item ${it.n > 0 ? 'plus' : 'minus'}`}>
                  {it.n > 0 ? `+${it.n}` : `−${-it.n}`} {it.name}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
