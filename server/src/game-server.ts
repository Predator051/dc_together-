import { randomBytes, randomInt } from 'node:crypto';
import type { WebSocket } from 'ws';
import type { Content, Gender, PlayerId, Role } from '../../shared/src/content.js';
import { PLAYER_IDS } from '../../shared/src/content.js';
import type { ClientMsg, Command, DeltaItem, ErrCode, LobbySlot, ServerMsg } from '../../shared/src/protocol.js';
import { seedFrom } from '../../shared/src/rng.js';
import type { WorldState } from '../../shared/src/state.js';
import { STATE_VERSION } from '../../shared/src/state.js';
import { ContentIndex, Game, newWorld } from './engine/index.js';
import { buildView } from './engine/view.js';
import { migrateState, type Migration } from './migrations.js';
import type { Storage } from './storage.js';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateInviteCode(): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export interface Conn {
  send(msg: ServerMsg): void;
  close(): void;
  pid: PlayerId | null;
  ip: string;
}

export interface GameServerOptions {
  content: Content;
  storage: Storage;
  clock?: () => number;
  inviteCode?: string;
  seed?: number;
  log?: (msg: string) => void;
  /** Override the migration registry (tests). */
  migrations?: Record<number, Migration>;
}

const ERR_TEXT: Record<ErrCode, string> = {
  bad_code: 'Невірний код запрошення.',
  bad_token: 'Сесію не знайдено. Увійдіть знову з кодом запрошення.',
  slots_full: 'Обидва місця вже зайняті.',
  role_taken: 'Цю роль уже обрано.',
  bad_input: 'Перевірте введені дані.',
  rate_limited: 'Забагато спроб. Зачекайте кілька хвилин.',
  not_authed: 'Спершу увійдіть.',
};

/** Authoritative game room: one world, two player slots, any number of sockets. */
export class GameServer {
  readonly ix: ContentIndex;
  state: WorldState;
  readonly inviteCode: string;
  private conns = new Set<Conn>();
  private dirty = false;
  private failures = new Map<string, number[]>();
  /** Increments on every broadcast; lets clients/tests know a view is current. */
  rev = 0;
  readonly clock: () => number;
  private readonly logFn: (msg: string) => void;

  constructor(private readonly opts: GameServerOptions) {
    this.ix = new ContentIndex(opts.content);
    this.clock = opts.clock ?? Date.now;
    this.logFn = opts.log ?? (() => {});
    const st = opts.storage;

    let code = opts.inviteCode ? normalizeCode(opts.inviteCode) : st.getMeta('invite_code');
    if (!code) {
      code = normalizeCode(generateInviteCode());
      st.setMeta('invite_code', code);
    }
    this.inviteCode = code;

    const now = this.clock();
    const stored = st.loadWorld();
    if (stored) {
      const raw = JSON.parse(stored.json);
      const { state, from, migrated } = migrateState(raw, opts.content, now, opts.migrations);
      if (migrated) {
        st.archiveWorld(from, stored.json, `migrate ${from}->${STATE_VERSION}`, now);
        this.logFn(`World migrated from version ${from} to ${STATE_VERSION}`);
      }
      this.state = state;
      this.save();
    } else {
      const seed = opts.seed ?? seedFrom(randomBytes(4).toString('hex'));
      this.state = newWorld(opts.content, seed, now);
      this.save();
      this.logFn('New world created');
    }
  }

  get formattedCode(): string {
    return `${this.inviteCode.slice(0, 4)}-${this.inviteCode.slice(4)}`;
  }

  // ----- persistence ---------------------------------------------------------

  save(): void {
    this.opts.storage.saveWorld(this.state.version, JSON.stringify(this.state), this.clock());
    this.dirty = false;
  }

  flush(): void {
    if (this.dirty) this.save();
  }

  // ----- game ops ------------------------------------------------------------

  private game(): Game {
    return new Game(this.ix, this.state, this.clock());
  }

  tick(): void {
    const g = this.game();
    if (g.tick()) {
      this.dirty = true;
      this.broadcast();
    }
  }

  private changed(): void {
    this.dirty = true;
    this.broadcast();
  }

  broadcast(): void {
    this.rev++;
    const g = this.game();
    const views = new Map<PlayerId, ServerMsg>();
    for (const c of this.conns) {
      if (!c.pid || !this.state.players[c.pid].joined) continue;
      let msg = views.get(c.pid);
      if (!msg) {
        msg = { t: 'view', v: buildView(g, c.pid), rev: this.rev };
        views.set(c.pid, msg);
      }
      c.send(msg);
    }
  }

  /** Tell everyone what this command added or spent (visible resources only). */
  private sendDelta(by: PlayerId, before: Record<string, number>, together: boolean): void {
    const items: DeltaItem[] = [];
    for (const r of this.opts.content.resources) {
      if (r.hidden) continue;
      const n = (this.state.res[r.id] ?? 0) - (before[r.id] ?? 0);
      if (n !== 0) items.push({ id: r.id, name: r.name, n });
    }
    if (!items.length) return;
    items.sort((a, b) => b.n - a.n);
    const msg: ServerMsg = { t: 'delta', by, together, items };
    for (const conn of this.conns) if (conn.pid) conn.send(msg);
  }

  private sendView(c: Conn): void {
    if (!c.pid) return;
    c.send({ t: 'view', v: buildView(this.game(), c.pid), rev: this.rev });
  }

  // ----- connections ---------------------------------------------------------

  connect(c: Conn): void {
    this.conns.add(c);
  }

  disconnect(c: Conn): void {
    this.conns.delete(c);
    if (c.pid) this.updatePresence(c.pid);
  }

  private socketsOf(pid: PlayerId): number {
    let n = 0;
    for (const c of this.conns) if (c.pid === pid) n++;
    return n;
  }

  private updatePresence(pid: PlayerId): void {
    const online = this.socketsOf(pid) > 0;
    if (this.state.players[pid].online === online) return;
    this.game().setOnline(pid, online);
    this.changed();
  }

  private limited(ip: string): boolean {
    const now = this.clock();
    const list = (this.failures.get(ip) ?? []).filter((t) => now - t < 10 * 60 * 1000);
    this.failures.set(ip, list);
    return list.length >= 20;
  }

  private fail(ip: string): void {
    const list = this.failures.get(ip) ?? [];
    list.push(this.clock());
    this.failures.set(ip, list);
  }

  private err(c: Conn, code: ErrCode): void {
    c.send({ t: 'err', code, text: ERR_TEXT[code] });
  }

  private checkCode(c: Conn, code: unknown): boolean {
    if (this.limited(c.ip)) {
      this.err(c, 'rate_limited');
      return false;
    }
    if (typeof code !== 'string' || normalizeCode(code) !== this.inviteCode) {
      this.fail(c.ip);
      this.err(c, 'bad_code');
      return false;
    }
    return true;
  }

  private lobbySlots(): { slots: LobbySlot[]; freeRoles: Role[] } {
    const g = this.game();
    const taken = new Set<Role>();
    const slots = PLAYER_IDS.map((pid): LobbySlot => {
      const p = this.state.players[pid];
      if (p.joined && p.role) taken.add(p.role);
      return p.joined ? { pid, joined: true, name: p.name, role: p.role ?? undefined, roleTitle: g.roleTitle(pid) } : { pid, joined: false };
    });
    const freeRoles = (['hunter', 'maker'] as Role[]).filter((r) => !taken.has(r));
    return { slots, freeRoles };
  }

  private authenticate(c: Conn, pid: PlayerId): void {
    const token = randomBytes(24).toString('base64url');
    this.opts.storage.addSession(token, pid, this.clock());
    c.pid = pid;
    c.send({ t: 'welcome', token, pid });
    this.updatePresence(pid);
    this.sendView(c);
  }

  handle(c: Conn, raw: string): void {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw) as ClientMsg;
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object' || typeof (msg as { t?: unknown }).t !== 'string') return;

    switch (msg.t) {
      case 'ping':
        c.send({ t: 'pong' });
        return;
      case 'sync':
        if (c.pid) this.sendView(c);
        return;
      case 'hello': {
        if (this.limited(c.ip)) return this.err(c, 'rate_limited');
        const pid = typeof msg.token === 'string' ? this.opts.storage.sessionPlayer(msg.token, this.clock()) : null;
        if (!pid || !this.state.players[pid].joined) {
          this.fail(c.ip);
          return this.err(c, 'bad_token');
        }
        c.pid = pid;
        c.send({ t: 'welcome', token: msg.token, pid });
        this.updatePresence(pid);
        this.sendView(c);
        return;
      }
      case 'lobby': {
        if (!this.checkCode(c, msg.code)) return;
        c.send({ t: 'lobby', ...this.lobbySlots() });
        return;
      }
      case 'join': {
        if (!this.checkCode(c, msg.code)) return;
        const name = cleanName(msg.name);
        const gender = msg.gender === 'm' || msg.gender === 'f' ? (msg.gender as Gender) : null;
        const role = msg.role === 'hunter' || msg.role === 'maker' ? (msg.role as Role) : null;
        if (!name || !gender || !role) return this.err(c, 'bad_input');
        const g = this.game();
        const r = g.join(name, gender, role);
        if ('err' in r) return this.err(c, r.err);
        this.dirty = true;
        this.logFn(`Player ${r.pid} joined`);
        this.authenticate(c, r.pid);
        this.broadcast();
        return;
      }
      case 'claim': {
        if (!this.checkCode(c, msg.code)) return;
        const pid = msg.pid === 'p1' || msg.pid === 'p2' ? msg.pid : null;
        if (!pid || !this.state.players[pid].joined) return this.err(c, 'bad_input');
        this.authenticate(c, pid);
        return;
      }
      case 'cmd': {
        if (!c.pid) return this.err(c, 'not_authed');
        const cmd = validCommand(msg.cmd);
        if (!cmd) return;
        const before = { ...this.state.res };
        const inScene = !!this.state.scene || cmd.c === 'accept';
        const r = this.game().command(c.pid, cmd);
        if (r.ok) {
          this.changed();
          this.sendDelta(c.pid, before, inScene || !!this.state.scene);
        }
        c.send({ t: 'ack', seq: msg.seq, ok: r.ok, text: r.err, rev: this.rev });
        return;
      }
      default:
        return;
    }
  }
}

function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/[\u0000-\u001f\u007f<>{}|]/g, '').replace(/\s+/g, ' ').trim();
  if (s.length < 1 || s.length > 24) return null;
  if (!/\p{L}/u.test(s)) return null;
  return s;
}

function validCommand(cmd: unknown): Command | null {
  if (!cmd || typeof cmd !== 'object') return null;
  const c = cmd as { c?: unknown; id?: unknown };
  switch (c.c) {
    case 'act':
    case 'choose':
      return typeof c.id === 'string' && c.id.length < 64 ? ({ c: c.c, id: c.id } as Command) : null;
    case 'accept':
    case 'decline':
    case 'cancel':
    case 'next':
      return { c: c.c } as Command;
    case 'sign':
      return typeof c.id === 'string' && c.id.length < 16 ? { c: 'sign', id: c.id } : null;
    case 'ack': {
      const what = (cmd as { what?: unknown }).what;
      return what === 'welcome' || what === 'summary' ? { c: 'ack', what } : null;
    }
    default:
      return null;
  }
}

export type { WebSocket };
