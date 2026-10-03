import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { PlayerId } from '../../shared/src/content.js';

/** Bump when the SQL schema (not the world state) changes. */
const SCHEMA_VERSION = 1;

export interface StoredWorld {
  version: number;
  json: string;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * SQLite persistence: one row with the world JSON, sessions, metadata and an archive of
 * world snapshots taken before every state migration.
 */
export class Storage {
  readonly db: DatabaseSync;

  constructor(readonly path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA busy_timeout = 5000;');
    this.migrateSchema();
  }

  private migrateSchema(): void {
    this.db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    const current = Number(this.getMeta('schema_version') ?? '0');
    if (current < 1) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS world (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          version INTEGER NOT NULL,
          state TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS world_archive (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          version INTEGER NOT NULL,
          state TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY,
          player_id TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          last_used INTEGER NOT NULL
        );
      `);
    }
    if (current !== SCHEMA_VERSION) this.setMeta('schema_version', String(SCHEMA_VERSION));
  }

  getMeta(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? row.value : null;
  }

  setMeta(key: string, value: string): void {
    this.db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
  }

  loadWorld(): StoredWorld | null {
    const row = this.db.prepare('SELECT version, state FROM world WHERE id = 1').get() as { version: number; state: string } | undefined;
    return row ? { version: Number(row.version), json: row.state } : null;
  }

  saveWorld(version: number, json: string, now = Date.now()): void {
    this.db
      .prepare(
        'INSERT INTO world (id, version, state, updated_at) VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET version = excluded.version, state = excluded.state, updated_at = excluded.updated_at',
      )
      .run(version, json, now);
  }

  archiveWorld(version: number, json: string, reason: string, now = Date.now()): void {
    this.db.prepare('INSERT INTO world_archive (version, state, reason, created_at) VALUES (?, ?, ?, ?)').run(version, json, reason, now);
  }

  archiveCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM world_archive').get() as { n: number };
    return Number(row.n);
  }

  addSession(token: string, pid: PlayerId, now = Date.now()): void {
    this.db.prepare('INSERT INTO sessions (token_hash, player_id, created_at, last_used) VALUES (?, ?, ?, ?)').run(hashToken(token), pid, now, now);
  }

  sessionPlayer(token: string, now = Date.now()): PlayerId | null {
    const h = hashToken(token);
    const row = this.db.prepare('SELECT player_id FROM sessions WHERE token_hash = ?').get(h) as { player_id: string } | undefined;
    if (!row) return null;
    this.db.prepare('UPDATE sessions SET last_used = ? WHERE token_hash = ?').run(now, h);
    return row.player_id === 'p1' || row.player_id === 'p2' ? row.player_id : null;
  }

  /** Consistent copy of the database into `file` (safe while the server runs). */
  backupTo(file: string): void {
    mkdirSync(dirname(file), { recursive: true });
    rmSync(file, { force: true });
    this.db.prepare('VACUUM INTO ?').run(file);
  }

  close(): void {
    this.db.close();
  }
}

/** Keep only the newest `keep` files matching `prefix` in `dir`. */
export function pruneBackups(dir: string, prefix: string, keep: number): void {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.startsWith(prefix)).sort();
  } catch {
    return;
  }
  for (const f of files.slice(0, Math.max(0, files.length - keep))) rmSync(join(dir, f), { force: true });
}
