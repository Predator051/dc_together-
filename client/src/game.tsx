import { useEffect, useMemo, useState } from 'preact/hooks';
import type { EntryView, GroupView, PlayerView } from '../../shared/src/protocol.js';
import type { NetState } from './net.js';
import { net } from './net.js';
import { Scene } from './scene.js';
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

  return (
    <div class={`entry ${e.together ? 'together' : ''}`}>
      <button
        class={`btn act ${mine ? 'running' : ''}`}
        disabled={disabled}
        onClick={() => net.send({ c: 'act', id: e.id })}
      >
        {mine && <Fill key={v.busyUntil} from={v.busyFrom} until={v.busyUntil} offset={c.offset} cls="fill" />}
        <span class="label">{e.label}</span>
        {mine ? <span class="secs">{secsLeft(v.busyUntil, now)}</span> : e.together && <span class="tag">{T.together}</span>}
      </button>
      {(gains.length > 0 || costs.length > 0 || reason || e.hint) && (
        <div class="entry-meta">
          {gains.map((x) => (
            <span class={`gain ${x.unsure ? 'unsure' : ''}`}>{x.text}</span>
          ))}
          {costs.map((c) =>
            c.stock ? (
              <span class="stock-left">
                {c.name}: {c.have}
              </span>
            ) : (
              <span class={`cost ${c.ok ? '' : 'short'}`}>
                −{c.n} {c.name}
                {!c.ok && ` (${T.have} ${c.have})`}
              </span>
            ),
          )}
          {reason && <span class="reason">{reason}</span>}
          {!reason && e.hint && <span class="hint">{e.hint}</span>}
        </div>
      )}
    </div>
  );
}

function Group({ g, c }: { g: GroupView; c: Ctx }) {
  return (
    <section class={`card group ${g.base ? 'base' : ''}`}>
      <h3>{g.name}</h3>
      {g.desc && <p class="desc">{g.desc}</p>}
      <div class="entries">
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
    <section class="card stock">
      {res.length > 0 && (
        <>
          <h3>{T.stock}</h3>
          <div class="chips">
            {res.map((r) => (
              <span class={`chip ${r.cap !== undefined && r.n >= r.cap ? 'full' : ''}`}>
                <span>{r.name}</span>
                <b>
                  {r.n}
                  {r.cap !== undefined && <small>/{r.cap}</small>}
                </b>
              </span>
            ))}
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
  if (!p.joined) return <div class="partner muted">{T.partnerNone}</div>;
  const working = p.online && p.busy && p.busy.until > now ? p.busy : null;
  const status = !p.online ? T.partnerOffline : working ? working.text : T.partnerIdle;
  return (
    <div class={`partner ${p.online ? 'on' : 'off'}`}>
      <span class="dot" />
      <b>{p.name}</b>
      <span class="muted">{p.roleTitle ? ` · ${p.roleTitle}` : ''}</span>
      {p.area !== v.me.area && <span class="where-other">{p.where}</span>}
      <span class="status">{status}</span>
      {working && (
        <span class="mini-bar" aria-hidden="true">
          <Fill key={working.until} from={working.from} until={working.until} offset={offset} cls="" />
        </span>
      )}
    </div>
  );
}

function Notes({ v }: { v: PlayerView }) {
  const j = v.journal;
  if (!j.clues.length && !j.questions.length && !j.people.length) return <p class="muted pad">{T.emptyNotes}</p>;
  return (
    <div class="notes">
      {j.questions.length > 0 && (
        <section class="card">
          <h3>{T.questions}</h3>
          {j.questions.map((q) => (
            <div class="question">
              <span>{q.question}</span>
              <span class={`level l${q.level}`}>{q.levelText}</span>
            </div>
          ))}
        </section>
      )}
      {j.clues.length > 0 && (
        <section class="card">
          <h3>{T.clues}</h3>
          {j.clues.map((c) => (
            <div class={`clue ${c.personal ? 'personal' : ''}`}>
              <div class="clue-head">
                <b>{c.title}</b>
                {c.personal && <span class="tag own">{T.personalShort}</span>}
              </div>
              <p>{c.text}</p>
            </div>
          ))}
        </section>
      )}
      {j.people.length > 0 && (
        <section class="card">
          <h3>{T.people}</h3>
          {j.people.map((p) => (
            <div class="person">
              <b>{p.name}</b>
              <p>{p.desc}</p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function Log({ v }: { v: PlayerView }) {
  const items = [...v.log].reverse();
  if (!items.length) return <p class="muted pad">{T.emptyLog}</p>;
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
  const seenClues = Number(load('bezgomin.clues') ?? '0');
  const newNotes = v.journal.clues.length > seenClues;

  useEffect(() => store('bezgomin.tab', tab), [tab]);
  useEffect(() => {
    if (tab === 'notes') store('bezgomin.clues', String(v.journal.clues.length));
  }, [tab, v.journal.clues.length]);

  useEffect(() => {
    if (!s.toast) return;
    const id = window.setTimeout(() => net.clearToast(), 2500);
    return () => window.clearTimeout(id);
  }, [s.toast?.id]);

  const hasNotes = v.journal.clues.length + v.journal.questions.length + v.journal.people.length > 0;
  const groups = useMemo(() => v.groups.filter((g) => g.entries.length > 0 || g.desc), [v.groups]);

  const work = (
    <div class="work">
      {v.actDone && (
        <section class="card actdone">
          <h3>{T.actDone}</h3>
          <p>{v.actDone.text}</p>
        </section>
      )}
      {v.stove.text && <p class={`stove ${v.stove.state}`}>{v.stove.text}</p>}
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
        <div class="top-row">
          <span class="brand">{T.title}</span>
          <span class="where small">{v.me.where}</span>
          {v.me.role && <span class="muted small">{v.day > 0 ? `${T.day} ${v.day}` : ''}</span>}
          <span class={`net ${s.connected ? 'ok' : 'bad'}`} title={s.connected ? T.onlineDot : T.offlineDot} />
        </div>
        <Partner v={v} now={now} offset={s.offset} />
        {v.goal && (
          <div class="goal">
            <span class="muted">{T.goal}:</span> {v.goal}
          </div>
        )}
        {!s.connected && <div class="warn-bar">{T.reconnecting}</div>}
        {v.busyUntil > now && (
          <div class="me-progress" aria-hidden="true">
            <Fill key={v.busyUntil} from={v.busyFrom} until={v.busyUntil} offset={s.offset} cls="" />
          </div>
        )}
        <nav class="tabs only-mobile">
          <button class={tab === 'work' ? 'on' : ''} onClick={() => setTab('work')}>
            {T.tabWork}
          </button>
          {hasNotes && (
            <button class={tab === 'notes' ? 'on' : ''} onClick={() => setTab('notes')}>
              {T.tabNotes}
              {newNotes && tab !== 'notes' && <span class="badge" />}
            </button>
          )}
          <button class={tab === 'log' ? 'on' : ''} onClick={() => setTab('log')}>
            {T.tabLog}
          </button>
        </nav>
      </header>


      <main class="layout">
        <aside class="col-left only-desktop">
          <Stock v={v} />
          {hasNotes && <Notes v={v} />}
        </aside>
        <div class={`col-mid ${tab === 'work' ? '' : 'hide-mobile'}`}>
          {work}
          <div class="only-mobile mini-log">
            <Log v={{ ...v, log: v.log.slice(-4) }} />
          </div>
        </div>
        <div class={`col-notes only-mobile ${tab === 'notes' ? '' : 'hide-mobile'}`}>
          <Notes v={v} />
        </div>
        <aside class={`col-right ${tab === 'log' ? '' : 'hide-mobile'}`}>
          <Log v={v} />
        </aside>
      </main>

      {v.proposal && !v.scene && (
        <div class="proposal">
          {v.proposal.mine ? (
            <>
              <span>{v.proposal.text}</span>
              <button class="btn small" disabled={locked} onClick={() => net.send({ c: 'cancel' })}>
                {T.cancel}
              </button>
            </>
          ) : (
            <>
              <span>
                {v.proposal.text} <b>«{v.proposal.label}»</b>
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
