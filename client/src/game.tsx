import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { EntryView, GroupView, PlayerView } from '../../shared/src/protocol.js';
import type { NetState } from './net.js';
import { net } from './net.js';
import { Notes, useSeenClues } from './notes.js';
import { Scene } from './scene.js';
import { IconFlame, IconLock, IconLog, IconNotes, IconPair, IconPin, IconSnow, IconTarget, IconWork } from './icons.js';
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

  return (
    <button
      class={`tile ${e.together ? 'together' : ''} ${mine ? 'running' : ''} ${!e.enabled ? 'blocked' : ''}`}
      disabled={disabled}
      onClick={() => net.send({ c: 'act', id: e.id })}
    >
      {mine && <Fill key={v.busyUntil} from={v.busyFrom} until={v.busyUntil} offset={c.offset} cls="tile-fill" />}
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

function Group({ g, c }: { g: GroupView; c: Ctx }) {
  return (
    <section class={`group ${g.base ? 'base' : ''}`}>
      <header class="group-head">
        <h3>{g.name}</h3>
        {g.desc && <p class="desc">{g.desc}</p>}
      </header>
      <div class="tiles">
        {g.entries.map((e) => (
          <Entry key={e.id} e={e} c={c} />
        ))}
      </div>
    </section>
  );
}

function Stock({ v }: { v: PlayerView }) {
  const res = v.res.filter((r) => r.kind === 'res');
  const tools = v.res.filter((r) => r.kind === 'tool' && r.n > 0);
  const folk = v.res.filter((r) => r.kind === 'people' && r.n > 0);
  if (res.length === 0 && tools.length === 0 && folk.length === 0) return null;
  return (
    <section class="panel stock">
      {res.length > 0 && (
        <>
          <h3>{T.stock}</h3>
          <div class="res-grid">
            {res.map((r) => {
              const full = r.cap !== undefined && r.n >= r.cap;
              const pct = r.cap ? Math.min(100, (r.n / r.cap) * 100) : 0;
              return (
                <div class={`res ${full ? 'full' : ''} ${r.n === 0 ? 'empty' : ''}`}>
                  <span class="res-name">{r.name}</span>
                  <span class="res-n">
                    {r.n}
                    {r.cap !== undefined && <small>/{r.cap}</small>}
                  </span>
                  {r.cap !== undefined && (
                    <span class="res-bar" aria-hidden="true">
                      <span style={{ width: `${pct}%` }} />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      {folk.length > 0 && (
        <>
          <h3>{T.folk}</h3>
          <div class="chips">
            {folk.map((r) => (
              <span class="chip folk">
                <span>{r.name}</span>
                <b>{r.n}</b>
              </span>
            ))}
          </div>
        </>
      )}
      {tools.length > 0 && (
        <>
          <h3>{T.items}</h3>
          <div class="chips">
            {tools.map((r) => (
              <span class="chip tool">{r.name}</span>
            ))}
          </div>
        </>
      )}
    </section>
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
      <span class="avatar">{p.name.slice(0, 1).toUpperCase()}</span>
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
        <div class="goal">
          <IconTarget />
          <span>
            <span class="goal-label">{T.goal}</span>
            {v.goal}
          </span>
        </div>
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
                <IconPair />
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
