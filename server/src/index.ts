import { join, resolve } from 'node:path';
import { content } from '../../content/index.js';
import { startServer } from './main.js';
import { pruneBackups, Storage } from './storage.js';

const dataDir = resolve(process.env.DATA_DIR ?? './data');
const dbPath = join(dataDir, 'world.db');
const port = Number(process.env.PORT ?? 8080);
const clientDir = resolve(process.env.CLIENT_DIR ?? './client/dist');
const inviteCode = process.env.INVITE_CODE?.trim() || undefined;

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// Snapshot the world before anything (including migrations) touches it.
try {
  const pre = new Storage(dbPath);
  if (pre.loadWorld()) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    pre.backupTo(join(dataDir, 'backups', `auto-${stamp}.db`));
    pruneBackups(join(dataDir, 'backups'), 'auto-', 10);
  }
  pre.close();
} catch (e) {
  log(`Startup backup failed: ${(e as Error).message}`);
}

const running = await startServer({ content, dbPath, port, clientDir, inviteCode, log });
log(`Server listening on port ${running.port}`);
log(`Invite code: ${running.game.formattedCode}`);

let stopping = false;
async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  log('Shutting down…');
  await running.stop();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
