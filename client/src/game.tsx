import { useEffect, useMemo, useState } from 'preact/hooks';
import type { EntryView, GroupView, PlayerView } from '../../shared/src/protocol.js';
import type { NetState } from './net.js';
import { net } from './net.js';
import { Scene } from './scene.js';
import { T } from './strings.js';

type Tab = 'work' | 'notes' | 'log';

function useNow(offset: number, active: boolean): number {
  const [now, setNow] = useState(Date.now() + offset);
  useEffect(() => {
    setNow(Date.now() + offset);
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now() + offset), 200);
    return () => window.clearInterval(id);
  }, [offset, active]);
  return now;
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

function Entry({ e, v, now }: { e: EntryView; v: PlayerView; now: number }) {
  const busy = v.busyUntil > now;
  const mine = v.busyAction === e.id && busy;
  const recharge = e.readyAt && e.readyAt > now ? e.readyAt : 0;
  const disabled = !e.enabled || (e.kind === 'act' && (busy || !!recharge));
  let progress = 0;
  if (mine && v.busyUntil > v.busyFrom) progress = (now - v.busyFrom) / (v.busyUntil - v.busyFrom);
  const reason = e.enabled ? (recharge ? `${Math.ceil((recharge - now) / 1000)} ${T.sec}` : null) : e.reason;

  return (
    <div class={`entry ${e.together ? 'together' : ''}`}>
      <button
        class={`btn act ${mine ? 'running' : ''}`}
        disabled={disabled}
        onClick={() => net.send({ c: 'act', id: e.id })}
      >
        {mine && <span class="fill" style={{ width: `${Math.min(100, progress * 100)}%` }} />}
        <span class="label">{e.label}</span>
        {e.together && <span class="tag">{T.together}</span>}
      </button>
      {(e.cost || reason || e.hint) && (
        <div class="entry-meta">
          {e.cost?.map((c) => (
            <span class={`cost ${c.ok ? '' : 'short'}`}>
              {c.name} {c.n}
            </span>
          ))}
          {reason && <span class="reason">{reason}</span>}
          {!reason && e.hint && <span class="hint">{e.hint}</span>}
        </div>
      )}
    </div>
  );
}

function Group({ g, v, now }: { g: GroupView; v: PlayerView; now: number }) {
  return (
    <section class={`card group ${g.base ? 'base' : ''}`}>
      <h3>{g.name}</h3>
      {g.desc && <p class="desc">{g.desc}</p>}
      <div class="entries">
        {g.entries.map((e) => (
          <Entry key={e.id} e={e} v={v} now={now} />
        ))}
      </div>
    </section>
  );
}

function Stock({ v }: { v: PlayerView }) {
  const res = v.res.filter((r) => r.kind === 'res');
  const tools = v.res.filter((r) => r.kind === 'tool' && r.n > 0);
  if (res.length === 0 && tools.length === 0) return null;
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

function Partner({ v, now }: { v: PlayerView; now: number }) {
  const p = v.partner;
  if (!p.joined) return <div class="partner muted">{T.partnerNone}</div>;
  const status = !p.online ? T.partnerOffline : p.busy && p.busy.until > now ? p.busy.text : T.partnerIdle;
  return (
    <div class={`partner ${p.online ? 'on' : 'off'}`}>
      <span class="dot" />
      <b>{p.name}</b>
      <span class="muted">{p.roleTitle ? ` · ${p.roleTitle}` : ''}</span>
      <span class="status">{status}</span>
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
  const counting = v.busyUntil > Date.now() + s.offset || v.groups.some((g) => g.entries.some((e) => e.readyAt)) || !!v.partner.busy;
  const now = useNow(s.offset, counting);
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
        <Group key={g.id} g={g} v={v} now={now} />
      ))}
    </div>
  );

  return (
    <div class="game">
      <header class="top">
        <div class="top-row">
          <span class="brand">{T.title}</span>
          {v.me.role && <span class="muted small">{v.day > 0 ? `${T.day} ${v.day}` : ''}</span>}
          <span class={`net ${s.connected ? 'ok' : 'bad'}`} title={s.connected ? T.onlineDot : T.offlineDot} />
        </div>
        <Partner v={v} now={now} />
        {v.goal && (
          <div class="goal">
            <span class="muted">{T.goal}:</span> {v.goal}
          </div>
        )}
        {!s.connected && <div class="warn-bar">{T.reconnecting}</div>}
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
              <button class="btn small" onClick={() => net.send({ c: 'cancel' })}>
                {T.cancel}
              </button>
            </>
          ) : (
            <>
              <span>
                {v.proposal.text} <b>«{v.proposal.label}»</b>
              </span>
              <div class="row">
                <button class="btn primary small" onClick={() => net.send({ c: 'accept' })}>
                  {T.accept}
                </button>
                <button class="btn small" onClick={() => net.send({ c: 'decline' })}>
                  {T.decline}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {v.scene && <Scene v={v} sc={v.scene} />}
      {s.toast && <div class="toast">{s.toast.text}</div>}
    </div>
  );
}
