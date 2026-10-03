import { createServer, type Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { Content } from '../../shared/src/content.js';
import type { ServerMsg } from '../../shared/src/protocol.js';
import { GameServer, type Conn } from './game-server.js';
import { staticHandler } from './http.js';
import { Storage } from './storage.js';

export interface StartOptions {
  content: Content;
  dbPath: string;
  port: number;
  host?: string;
  clientDir: string;
  inviteCode?: string;
  clock?: () => number;
  seed?: number;
  /** Real-time ticking; tests drive ticks manually. */
  autoTick?: boolean;
  log?: (msg: string) => void;
}

export interface Running {
  game: GameServer;
  storage: Storage;
  http: Server;
  port: number;
  stop(): Promise<void>;
}

function clientIp(req: { headers: Record<string, string | string[] | undefined>; socket: { remoteAddress?: string } }): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = Array.isArray(fwd) ? fwd[0] : fwd?.split(',')[0];
  return (first ?? req.socket.remoteAddress ?? 'unknown').trim();
}

export async function startServer(o: StartOptions): Promise<Running> {
  const storage = new Storage(o.dbPath);
  const game = new GameServer({
    content: o.content,
    storage,
    clock: o.clock,
    inviteCode: o.inviteCode,
    seed: o.seed,
    log: o.log,
  });

  const http = createServer(staticHandler(o.clientDir));
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

  http.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  const alive = new WeakMap<WebSocket, boolean>();
  wss.on('connection', (ws: WebSocket, req) => {
    const conn: Conn = {
      pid: null,
      ip: clientIp(req as never),
      send(msg: ServerMsg) {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
      },
      close() {
        ws.close();
      },
    };
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));
    game.connect(conn);
    ws.on('message', (data) => {
      try {
        game.handle(conn, data.toString());
      } catch (e) {
        o.log?.(`Error handling message: ${(e as Error).stack ?? e}`);
      }
    });
    ws.on('close', () => game.disconnect(conn));
    ws.on('error', () => ws.terminate());
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.get(ws)) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, 30_000);

  const timers: NodeJS.Timeout[] = [heartbeat];
  if (o.autoTick !== false) {
    timers.push(setInterval(() => game.tick(), 1000));
    timers.push(setInterval(() => game.flush(), 2000));
  }

  await new Promise<void>((res) => http.listen(o.port, o.host ?? '0.0.0.0', () => res()));
  const addr = http.address();
  const port = typeof addr === 'object' && addr ? addr.port : o.port;

  return {
    game,
    storage,
    http,
    port,
    async stop() {
      for (const t of timers) clearInterval(t);
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>((res) => wss.close(() => res()));
      await new Promise<void>((res) => http.close(() => res()));
      game.flush();
      storage.close();
    },
  };
}
