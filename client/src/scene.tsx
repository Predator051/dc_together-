import { useEffect, useRef, useState } from 'preact/hooks';
import type { PlayerView, SceneView } from '../../shared/src/protocol.js';
import { net } from './net.js';
import { T } from './strings.js';

function Bar({ value, max, kind }: { value: number; max: number; kind: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div class={`bar ${kind}`}>
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Scene({ v, sc, locked }: { v: PlayerView; sc: SceneView; locked: boolean }) {
  const [min, setMin] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const blocksCount = sc.blocks.length;
  const lastRound = sc.combat?.round ?? 0;

  useEffect(() => {
    setMin(false);
  }, [sc.id]);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const last = el.querySelector('.block:last-child');
    if (last) (last as HTMLElement).scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [blocksCount, lastRound]);

  if (min || (sc.paused && min)) {
    return (
      <div class="scene-mini" onClick={() => setMin(false)} role="button">
        <span>{sc.paused ? T.scenePaused : sc.title}</span>
        <b>{T.expand}</b>
      </div>
    );
  }

  const options = sc.options ?? [];
  const canAct = !sc.paused && !sc.waiting && !locked;

  return (
    <div class="scene-wrap">
      <div class="scene">
        <header class="scene-head">
          <h2>{sc.title}</h2>
          {sc.paused && (
            <button class="btn ghost small" onClick={() => setMin(true)}>
              {T.minimize}
            </button>
          )}
        </header>
        <div class="scene-body" ref={bodyRef}>
          {sc.blocks.map((b, i) => (
            <div class={`block ${i === sc.blocks.length - 1 ? 'current' : 'past'}`} key={i}>
              {b.text.map((p) => (
                <p>{p}</p>
              ))}
              {b.own.length > 0 && (
                <div class="own">
                  <div class="own-label">{T.personal}</div>
                  {b.own.map((p) => (
                    <p>{p}</p>
                  ))}
                </div>
              )}
              {b.combat && b.combat.length > 0 && (
                <div class="combat-log">
                  {b.combat.map((p) => (
                    <p>{p}</p>
                  ))}
                </div>
              )}
              {b.picks && <div class="picks">{b.picks}</div>}
            </div>
          ))}
          {sc.combat && (
            <div class="combat">
              <div class="combat-row">
                <span>{sc.combat.enemy}</span>
                <span class="muted small">
                  {T.combatRound} {sc.combat.round}
                </span>
              </div>
              <div class="combat-row">
                <span class="small">{T.combatEnemy}</span>
                <Bar value={sc.combat.hp} max={sc.combat.hpMax} kind="hp" />
              </div>
              <div class="combat-row">
                <span class="small">{T.combatFear}</span>
                <Bar value={sc.combat.fear} max={sc.combat.fearMax} kind="fear" />
              </div>
              <div class="combat-row">
                <span class="small">{T.combatYou}</span>
                <Bar value={v.me.hp} max={v.me.hpMax} kind="me" />
              </div>
              <div class="combat-row">
                <span class="small">{v.partner.name}</span>
                <Bar value={v.partner.hp} max={v.partner.hpMax} kind="me" />
              </div>
              {sc.combat.lastRound.length > 0 && (
                <div class="combat-log">
                  {sc.combat.lastRound.map((p) => (
                    <p>{p}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <footer class="scene-foot">
          {sc.paused && <p class="muted">{sc.pausedText}</p>}
          {!sc.paused && sc.waiting && <p class="muted waiting">{sc.waitingText ?? T.waiting}</p>}
          {!sc.paused && sc.kind === 'text' && !sc.waiting && (
            <button class="btn primary wide" disabled={locked} onClick={() => net.send({ c: 'next' })}>
              {sc.button ?? T.next}
            </button>
          )}
          {!sc.paused && sc.kind !== 'text' && (
            <div class="options">
              {sc.partnerPicked && !sc.myPick && <p class="muted small">{v.partner.name} — ✓</p>}
              {options.map((o) => (
                <button
                  class={`btn wide ${sc.myPick === o.id ? 'on' : ''}`}
                  disabled={!o.enabled || !canAct || !!sc.myPick}
                  onClick={() => net.send({ c: 'choose', id: o.id })}
                >
                  <span>{o.label}</span>
                  {o.reason && <em class="reason">{o.reason}</em>}
                </button>
              ))}
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
