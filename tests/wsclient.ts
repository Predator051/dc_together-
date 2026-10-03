// A real WebSocket client for tests: speaks the same protocol as the browser client.

import WebSocket from 'ws';
import type { Gender, PlayerId, Role } from '../shared/src/content.js';
import type { ClientMsg, Command, PlayerView, ServerMsg } from '../shared/src/protocol.js';

export class TestClient {
  ws!: WebSocket;
  view: PlayerView | null = null;
  rev = 0;
  token: string | null = null;
  pid: PlayerId | null = null;
  inbox: ServerMsg[] = [];
  private waiters: Array<{ pred: (m: ServerMsg) => boolean; res: (m: ServerMsg) => void; rej: (e: Error) => void; t: NodeJS.Timeout }> = [];

  constructor(readonly url: string) {}

  open(): Promise<void> {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(this.url);
      this.ws.on('open', () => res());
      this.ws.on('error', rej);
      this.ws.on('message', (data) => {
        const m = JSON.parse(data.toString()) as ServerMsg;
        this.inbox.push(m);
        if (m.t === 'view') {
          this.view = m.v;
          this.rev = Math.max(this.rev, m.rev);
        }
        if (m.t === 'welcome') {
          this.token = m.token;
          this.pid = m.pid;
        }
        for (const w of [...this.waiters]) {
          if (w.pred(m)) {
            clearTimeout(w.t);
            this.waiters.splice(this.waiters.indexOf(w), 1);
            w.res(m);
          }
        }
      });
    });
  }

  send(m: ClientMsg): void {
    this.ws.send(JSON.stringify(m));
  }

  wait<T extends ServerMsg['t']>(t: T, pred: (m: Extract<ServerMsg, { t: T }>) => boolean = () => true, ms = 3000): Promise<Extract<ServerMsg, { t: T }>> {
    return new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error(`timeout waiting for ${t}`)), ms);
      this.waiters.push({
        pred: (m) => m.t === t && pred(m as Extract<ServerMsg, { t: T }>),
        res: res as (m: ServerMsg) => void,
        rej,
        t: timer,
      });
    });
  }

  async join(code: string, name: string, gender: Gender, role: Role): Promise<void> {
    const p = this.wait('welcome');
    const v = this.wait('view');
    this.send({ t: 'join', code, name, gender, role });
    await p;
    await v;
  }

  async hello(token: string): Promise<ServerMsg> {
    const p = Promise.race([this.wait('welcome'), this.wait('err')]);
    this.send({ t: 'hello', token });
    const m = await p;
    if (m.t === 'welcome') await this.waitRev(0);
    return m;
  }

  /** Send a command and resolve with its ack (views for it are already received). */
  async cmd(cmd: Command): Promise<{ ok: boolean; text?: string; rev: number }> {
    const p = this.wait('ack');
    this.send({ t: 'cmd', cmd });
    const a = await p;
    return { ok: a.ok, text: a.text, rev: a.rev };
  }

  /** Wait until this client has seen a view at least as new as `rev`. */
  async waitRev(rev: number, ms = 3000): Promise<void> {
    if (this.view && this.rev >= rev) return;
    await this.wait('view', (m) => m.rev >= rev, ms);
  }

  /** Wait for a view that satisfies `pred` (checks the current one first). */
  async until(pred: (v: PlayerView) => boolean, ms = 3000): Promise<PlayerView> {
    if (this.view && pred(this.view)) return this.view;
    const m = await this.wait('view', (x) => pred(x.v), ms);
    return m.v;
  }

  close(): Promise<void> {
    return new Promise((res) => {
      if (this.ws.readyState === WebSocket.CLOSED) return res();
      this.ws.once('close', () => res());
      this.ws.close();
    });
  }
}
