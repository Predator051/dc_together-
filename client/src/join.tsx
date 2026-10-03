import { useState } from 'preact/hooks';
import type { Role } from '../../shared/src/content.js';
import type { NetState } from './net.js';
import { net } from './net.js';
import { T } from './strings.js';

export function Join({ s }: { s: NetState }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [gender, setGender] = useState<'m' | 'f' | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const lobby = s.lobby;

  const submitCode = (e: Event) => {
    e.preventDefault();
    if (code.trim()) net.lobby(code.trim());
  };

  const submitJoin = (e: Event) => {
    e.preventDefault();
    if (!name.trim() || !gender || !role) return;
    net.join(code.trim(), name.trim(), gender, role);
  };

  const joined = lobby?.slots.filter((x) => x.joined) ?? [];
  const free = lobby ? lobby.slots.some((x) => !x.joined) : false;

  return (
    <div class="join">
      <div class="join-card">
        <h1 class="logo">{T.title}</h1>
        <p class="muted center">{T.subtitle}</p>

        {!lobby && (
          <form onSubmit={submitCode} class="stack">
            <label class="field">
              <span>{T.codeLabel}</span>
              <input
                value={code}
                onInput={(e) => setCode((e.target as HTMLInputElement).value)}
                placeholder={T.codePlaceholder}
                autocapitalize="characters"
                autocomplete="off"
                spellcheck={false}
                inputMode="text"
                maxLength={12}
              />
            </label>
            <button class="btn primary" type="submit" disabled={!s.connected || !code.trim()}>
              {s.connected ? T.codeEnter : T.loading}
            </button>
            <p class="muted small">{T.codeHint}</p>
          </form>
        )}

        {lobby && free && (
          <form onSubmit={submitJoin} class="stack">
            <h2>{T.createTitle}</h2>
            <label class="field">
              <span>{T.nameLabel}</span>
              <input
                value={name}
                maxLength={24}
                onInput={(e) => setName((e.target as HTMLInputElement).value)}
                placeholder={T.namePlaceholder}
                autocomplete="off"
              />
            </label>
            <div class="field">
              <span>{T.genderLabel}</span>
              <div class="seg">
                <button type="button" class={`btn ${gender === 'm' ? 'on' : ''}`} onClick={() => setGender('m')}>
                  {T.genderM}
                </button>
                <button type="button" class={`btn ${gender === 'f' ? 'on' : ''}`} onClick={() => setGender('f')}>
                  {T.genderF}
                </button>
              </div>
            </div>
            <div class="field">
              <span>{T.roleLabel}</span>
              {(['hunter', 'maker'] as Role[]).map((r) => {
                const takenBy = lobby.slots.find((x) => x.joined && x.role === r);
                const title =
                  r === 'hunter' ? (gender === 'f' ? T.roleHunterF : T.roleHunterM) : gender === 'f' ? T.roleMakerF : T.roleMakerM;
                return (
                  <button
                    type="button"
                    class={`role ${role === r ? 'on' : ''}`}
                    disabled={!!takenBy}
                    onClick={() => setRole(r)}
                  >
                    <b>{title}</b>
                    <span>{r === 'hunter' ? T.roleHunterDesc : T.roleMakerDesc}</span>
                    {takenBy && (
                      <em>
                        {takenBy.name} — {T.roleTaken}
                      </em>
                    )}
                  </button>
                );
              })}
              <p class="muted small">{T.roleNote}</p>
            </div>
            <button class="btn primary" type="submit" disabled={!name.trim() || !gender || !role}>
              {T.start}
            </button>
            {joined.length > 0 && (
              <div class="stack">
                <p class="muted small">{T.claimOr}</p>
                {joined.map((x) => (
                  <button type="button" class="btn" onClick={() => net.claim(code.trim(), x.pid)}>
                    {x.name} ({x.roleTitle})
                  </button>
                ))}
              </div>
            )}
            <button type="button" class="btn ghost" onClick={() => net.resetLobby()}>
              {T.back}
            </button>
          </form>
        )}

        {lobby && !free && (
          <div class="stack">
            <h2>{T.claimTitle}</h2>
            {joined.map((x) => (
              <button type="button" class="btn" onClick={() => net.claim(code.trim(), x.pid)}>
                {T.claimAs} {x.name} ({x.roleTitle})
              </button>
            ))}
            <button type="button" class="btn ghost" onClick={() => net.resetLobby()}>
              {T.back}
            </button>
          </div>
        )}

        {s.error && <p class="error">{s.error}</p>}
      </div>
    </div>
  );
}
