import type { ClientMsg, Command, DeltaItem, LobbySlot, PlayerView, ServerMsg } from '../../shared/src/protocol.js';
import type { Role } from '../../shared/src/content.js';

const TOKEN_KEY = 'bezgomin.token';

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(t: string | null): void {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: the session lasts until reload */
  }
}

export type Phase = 'connecting' | 'auth' | 'game';

export interface NetState {
  phase: Phase;
  connected: boolean;
  view: PlayerView | null;
  /** Server time minus local time. */
  offset: number;
  lobby: { slots: LobbySlot[]; freeRoles: Role[] } | null;
  error: string | null;
  toast: { text: string; id: number } | null;
  /** Recent stock changes (own and partner's), shown as popups. */
  deltas: Array<{ id: number; by: 'me' | 'partner' | 'both'; items: DeltaItem[] }>;
  /** The view may be outdated (tab was hidden, connection dropped): buttons stay disabled. */
  stale: boolean;
  /** A command is on its way to the server: buttons stay disabled until it answers. */
  pending: boolean;
}

type Listener = (s: NetState) => void;

export class Net {
  state: NetState = {
    phase: 'connecting',
    connected: false,
    view: null,
    offset: 0,
    lobby: null,
    error: null,
    toast: null,
    deltas: [],
    stale: true,
    pending: false,
  };
  /** Clock samples (server time − local receive time). Each one is ≤ the true offset. */
  private samples: Array<{ offset: number; at: number }> = [];
  private pendingTimer: number | undefined;
  private deltaSeq = 0;
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private token: string | null = readToken();
  private backoff = 500;
  private seq = 0;
  private pingTimer: number | undefined;
  private reconnectTimer: number | undefined;
  private memToken: string | null = null;

  constructor() {
    if (!this.token) this.state.phase = 'auth';
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (!this.state.connected) {
        this.connect();
        return;
      }
      // Never trust what was on screen while hidden: ask for the current state first.
      this.set({ stale: true });
      this.raw({ t: 'sync' });
    });
    window.addEventListener('online', () => this.connect());
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<NetState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    window.clearTimeout(this.reconnectTimer);
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.backoff = 500;
      this.samples = [];
      this.set({ connected: true });
      const tok = this.token ?? this.memToken;
      if (tok) this.raw({ t: 'hello', token: tok });
      window.clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => this.raw({ t: 'ping' }), 25000);
    };
    ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMsg;
      } catch {
        return;
      }
      this.onMessage(msg);
    };
    ws.onclose = () => {
      window.clearInterval(this.pingTimer);
      this.set({ connected: false, stale: true, pending: false });
      this.ws = null;
      this.reconnectTimer = window.setTimeout(() => this.connect(), this.backoff);
      this.backoff = Math.min(this.backoff * 2, 5000);
    };
    ws.onerror = () => ws.close();
  }

  private onMessage(msg: ServerMsg): void {
    switch (msg.t) {
      case 'welcome':
        this.token = msg.token;
        this.memToken = msg.token;
        writeToken(msg.token);
        this.set({ phase: 'game', error: null, lobby: null });
        return;
      case 'view':
        this.set({ view: msg.v, offset: this.clockOffset(msg.v.now), phase: 'game', stale: false });
        return;
      case 'lobby':
        this.set({ lobby: { slots: msg.slots, freeRoles: msg.freeRoles }, error: null });
        return;
      case 'err':
        if (msg.code === 'bad_token') {
          this.token = null;
          this.memToken = null;
          writeToken(null);
          this.set({ phase: 'auth', view: null, error: msg.text });
          return;
        }
        this.set({ error: msg.text });
        return;
      case 'delta': {
        const me = this.state.view?.me.pid;
        const by: 'me' | 'partner' | 'both' = msg.together ? 'both' : msg.by === me ? 'me' : 'partner';
        const id = ++this.deltaSeq;
        // Keep the newest few; each one disappears on its own.
        this.set({ deltas: [...this.state.deltas, { id, by, items: msg.items }].slice(-5) });
        window.setTimeout(() => this.set({ deltas: this.state.deltas.filter((d) => d.id !== id) }), 4200);
        return;
      }
      case 'ack':
        window.clearTimeout(this.pendingTimer);
        this.set({ pending: false, ...(!msg.ok && msg.text ? { toast: { text: msg.text, id: Date.now() } } : {}) });
        return;
      default:
        return;
    }
  }

  private raw(msg: ClientMsg): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /**
   * Server time estimate that is never ahead of the real one: a message built at server time T
   * arrives after some delay, so T − arrival ≤ true offset. The largest recent sample is the best.
   */
  private clockOffset(serverNow: number): number {
    const at = Date.now();
    this.samples.push({ offset: serverNow - at, at });
    this.samples = this.samples.filter((x) => at - x.at < 120_000).slice(-50);
    return Math.max(...this.samples.map((x) => x.offset));
  }

  send(cmd: Command): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.state.pending) return;
    this.set({ pending: true });
    window.clearTimeout(this.pendingTimer);
    this.pendingTimer = window.setTimeout(() => this.set({ pending: false }), 5000);
    this.raw({ t: 'cmd', cmd, seq: ++this.seq });
  }

  lobby(code: string): void {
    this.set({ error: null });
    this.raw({ t: 'lobby', code });
  }

  join(code: string, name: string, gender: 'm' | 'f', role: Role): void {
    this.set({ error: null });
    this.raw({ t: 'join', code, name, gender, role });
  }

  claim(code: string, pid: 'p1' | 'p2'): void {
    this.set({ error: null });
    this.raw({ t: 'claim', code, pid });
  }

  resetLobby(): void {
    this.set({ lobby: null, error: null });
  }

  clearToast(): void {
    this.set({ toast: null });
  }
}

export const net = new Net();
