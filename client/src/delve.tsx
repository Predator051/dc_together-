// Underground: the map with its light, the ways each role reads differently, slipping past the
// watchers, and hand signs (with wax in the ears nobody hears anybody).
import type { DelveView, PlayerView, SceneView, StealthView } from '../../shared/src/protocol.js';
import { IconCheck, IconFlame } from './icons.js';
import { net } from './net.js';
import { T } from './strings.js';

const CELL = 56;

/** The rooms found so far, the ways out of them, and where the party stands. */
function DelveMap({ d }: { d: DelveView }) {
  const xs = d.rooms.map((r) => r.x);
  const ys = d.rooms.map((r) => r.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = (Math.max(...xs) - minX + 1) * CELL;
  const h = (Math.max(...ys) - minY + 1) * CELL;
  const at = new Map(d.rooms.map((r) => [r.id, r]));
  const px = (x: number) => (x - minX) * CELL + CELL / 2;
  const py = (y: number) => (y - minY) * CELL + CELL / 2;
  return (
    <svg class="dmap" viewBox={`0 0 ${w} ${h}`} style={{ maxWidth: `${Math.max(w, 120)}px` }} role="img" aria-label={d.map}>
      {d.links.map(([a, b]) => {
        const ra = at.get(a);
        const rb = at.get(b);
        if (!ra || !rb) return null;
        return <line class={`dlink ${ra.unknown || rb.unknown ? 'unknown' : ''}`} x1={px(ra.x)} y1={py(ra.y)} x2={px(rb.x)} y2={py(rb.y)} />;
      })}
      {d.rooms.map((r) => (
        <g class={`droom ${r.here ? 'here' : ''} ${r.unknown ? 'unknown' : ''}`}>
          {r.here && <circle class="dglow" cx={px(r.x)} cy={py(r.y)} r={CELL * 0.42} />}
          <circle cx={px(r.x)} cy={py(r.y)} r={r.here ? 9 : 6} />
          {r.unknown && (
            <text x={px(r.x)} y={py(r.y) + 4} text-anchor="middle">
              ?
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

function LightMeter({ light, max }: { light: number; max: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (light / max) * 100)) : 0;
  return (
    <div class={`light ${light <= 2 ? 'low' : ''}`}>
      <IconFlame />
      <span class="light-label">{T.delveLight}</span>
      <span class="light-bar">
        <span style={{ width: `${pct}%` }} />
      </span>
      <b>{light}</b>
    </div>
  );
}

export function DelveBody({ d, title }: { d: DelveView; title: string }) {
  return (
    <div class="delve">
      <div class="delve-top">
        <div>
          {d.map !== title && <div class="delve-map-name">{d.map}</div>}
          <h3 class="delve-room">{d.room}</h3>
        </div>
        <LightMeter light={d.light} max={d.lightMax} />
      </div>
      <DelveMap d={d} />
      <div class="block current">
        {d.text.map((p) => (
          <p>{p}</p>
        ))}
        {d.own.length > 0 && (
          <div class="own">
            <div class="own-label">
              <span class="pilcrow" aria-hidden="true">
                ¶
              </span>
              {T.personal}
            </div>
            {d.own.map((p) => (
              <p>{p}</p>
            ))}
          </div>
        )}
        {d.lines.length > 0 && (
          <div class="delve-lines">
            {d.lines.map((l) => (
              <p>{l}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function DelveFoot({ d, v, locked }: { d: DelveView; v: PlayerView; locked: boolean }) {
  return (
    <div class="delve-foot">
      <h3>{T.delveWays}</h3>
      <div class="options">
        {d.exits.map((e) => (
          <button
            class={`opt way ${e.mine ? 'on' : ''} ${e.partner ? 'theirs' : ''}`}
            disabled={!e.enabled || locked || e.light > d.light}
            onClick={() => net.send({ c: 'choose', id: e.id })}
          >
            <span class="opt-body">
              <span>{e.label}</span>
              {e.note && <em class={`way-note ${e.tone ?? ''}`}>{e.note}</em>}
              {e.partner && (
                <span class="way-partner">
                  {v.partner.name} {T.delveWants}
                </span>
              )}
              {e.reason && <em class="reason">{e.reason}</em>}
            </span>
            <span class="way-cost">
              {e.mine ? <IconCheck /> : `−${e.light}`}
            </span>
          </button>
        ))}
      </div>
      {d.acts.length > 0 && (
        <div class="delve-acts">
          {d.acts.map((a) => (
            <button class="btn small" disabled={!a.enabled || locked} onClick={() => net.send({ c: 'choose', id: a.id })}>
              {a.label}
              {a.gives && <span class="act-gives">{a.gives}</span>}
              {a.light > 0 && <span class="act-cost">−{a.light}</span>}
              {a.reason && !a.enabled && <em class="reason">{a.reason}</em>}
            </button>
          ))}
        </div>
      )}
      {d.canLeave && (
        <button class="btn ghost small leave" disabled={locked} onClick={() => net.send({ c: 'choose', id: 'leave' })}>
          {T.delveLeave}
        </button>
      )}
    </div>
  );
}

const SIGNS: Array<{ id: string; glyph: string; label: string }> = [
  { id: 'stop', glyph: '✋', label: T.signStop },
  { id: 'go', glyph: '☝', label: T.signGo },
  { id: 'quiet', glyph: '🤫', label: T.signQuiet },
  { id: 'danger', glyph: '✊', label: T.signDanger },
  { id: 'here', glyph: '👋', label: T.signHere },
];

/** Hand signs: show one, see your partner's. */
export function Signs({ sc, v, locked }: { sc: SceneView; v: PlayerView; locked: boolean }) {
  const s = sc.signs;
  const theirs = SIGNS.find((x) => x.id === s?.partner);
  return (
    <div class="signs">
      <div class={`sign-in ${s?.fresh ? 'fresh' : ''}`} aria-live="polite">
        {theirs ? (
          <>
            <span class="sign-glyph" aria-hidden="true">
              {theirs.glyph}
            </span>
            <span>
              {v.partner.name} {T.signShows}: <b>{theirs.label}</b>
            </span>
          </>
        ) : (
          <span class="muted">{T.signsHint}</span>
        )}
      </div>
      <div class="sign-row" role="group" aria-label={T.signsTitle}>
        {SIGNS.map((x) => (
          <button
            class={`sign ${s?.mine === x.id ? 'on' : ''}`}
            disabled={locked}
            onClick={() => net.send({ c: 'sign', id: x.id })}
            title={x.label}
          >
            <span class="sign-glyph" aria-hidden="true">
              {x.glyph}
            </span>
            <span class="sign-label">{x.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Meter({ label, value, max, kind }: { label: string; value: number; max: number; kind: string }) {
  return (
    <div class={`smeter ${kind}`}>
      <span class="smeter-label">{label}</span>
      <span class="pips">
        {Array.from({ length: max }, (_, i) => (
          <span class={i < value ? 'on' : ''} />
        ))}
      </span>
    </div>
  );
}

export function StealthBody({ st, v }: { st: StealthView; v: PlayerView }) {
  const tiles = Array.from({ length: st.length }, (_, i) => i);
  return (
    <div class="stealth">
      <div class="track" aria-label={`${st.pos} / ${st.length}`}>
        {tiles.map((i) => (
          <span class={`tile-s ${i < st.pos ? 'past' : ''} ${i === st.pos ? 'here' : ''} ${st.loose?.[i] ? 'loose' : ''}`}>
            {i === st.pos && <span class="party" aria-hidden="true" />}
          </span>
        ))}
        <span class="track-end">{T.stealthEnd}</span>
      </div>
      <div class="smeters">
        <Meter label={T.stealthAlarm} value={st.alarm} max={st.alarmMax} kind="alarm" />
        <Meter label={T.stealthTime} value={st.timeMax - st.time} max={st.timeMax} kind="time" />
      </div>
      {st.now && (
        <div class="perceive">
          <p>
            <span class="perceive-key">{T.stealthNow}</span> {st.now}
          </p>
          {st.next && (
            <p class="muted">
              <span class="perceive-key">{T.stealthNext}</span> {st.next}
            </p>
          )}
        </div>
      )}
      {st.lines.length > 0 && (
        <div class="delve-lines">
          {st.lines.map((l) => (
            <p>{l}</p>
          ))}
        </div>
      )}
      {st.partnerPicked && !st.myPick && <p class="partner-picked">{v.partner.name} — ✓</p>}
    </div>
  );
}

export function StealthFoot({ sc, st, v, locked }: { sc: SceneView; st: StealthView; v: PlayerView; locked: boolean }) {
  const moves: Array<{ id: string; label: string; hint?: string }> = [
    { id: 'step', label: T.stealthStep },
    { id: 'sneak', label: T.stealthSneak, hint: T.stealthSneakHint },
    { id: 'freeze', label: T.stealthFreeze },
  ];
  return (
    <div class="stealth-foot">
      <Signs sc={sc} v={v} locked={locked} />
      <div class="moves">
        {moves.map((m) => (
          <button
            class={`opt move ${st.myPick === m.id ? 'on' : ''}`}
            disabled={locked || !!st.myPick}
            onClick={() => net.send({ c: 'choose', id: m.id })}
          >
            <span class="opt-body">
              <span>{m.label}</span>
              {m.hint && <em class="reason">{m.hint}</em>}
            </span>
          </button>
        ))}
      </div>
      {st.myPick && !st.partnerPicked && <p class="muted waiting">{T.waiting}</p>}
    </div>
  );
}
