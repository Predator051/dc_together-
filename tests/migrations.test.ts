import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { content } from '../content/index.js';
import { STATE_VERSION } from '../shared/src/state.js';
import { newWorld } from '../server/src/engine/index.js';
import { GameServer } from '../server/src/game-server.js';
import { MigrationError, migrateState, type Migration } from '../server/src/migrations.js';
import { Storage } from '../server/src/storage.js';
import { autoplay } from './harness.js';

describe('world state migrations', () => {
  it('current version passes through unchanged and normalises runtime fields', () => {
    const s = newWorld(content, 1, 0);
    s.players.p1.online = true;
    const { state, migrated } = migrateState(JSON.parse(JSON.stringify(s)), content, 5);
    expect(migrated).toBe(false);
    expect(state.players.p1.online).toBe(false);
    expect(state.version).toBe(STATE_VERSION);
  });

  it('applies a chain of migrations in order', () => {
    const registry: Record<number, Migration> = {
      0: (x) => ({ ...x, version: 1, renamed: x.old }),
      1: (x) => ({ ...x, version: 2, flags: { ...x.flags, migrated_twice: 1 } }),
    };
    const old = { ...newWorld(content, 1, 0), version: 0, old: 'value' } as never;
    const { state, from } = migrateState(old, content, 0, registry, 2);
    expect(from).toBe(0);
    expect(state.version).toBe(2);
    expect((state as unknown as { renamed: string }).renamed).toBe('value');
    expect(state.flags['migrated_twice']).toBe(1);
  });

  it('rejects worlds from a newer server and missing steps', () => {
    const s = { ...newWorld(content, 1, 0), version: STATE_VERSION + 5 };
    expect(() => migrateState(s, content, 0)).toThrow(MigrationError);
    const t = { ...newWorld(content, 1, 0), version: 0 };
    expect(() => migrateState(t, content, 0, {}, 1)).toThrow(MigrationError);
  });

  it('real migration v1 -> v2: an act 1 world gets player locations and keeps everything else', () => {
    const s = newWorld(content, 1, 0) as unknown as Record<string, any>;
    s.version = 1;
    for (const pid of ['p1', 'p2']) delete s.players[pid].at;
    s.flags = { a1_done: 1, 'done:scn_14': 1 };
    s.res = { ...s.res, res_01: 7 };
    const { state, from, migrated } = migrateState(JSON.parse(JSON.stringify(s)), content, 0);
    expect(from).toBe(1);
    expect(migrated).toBe(true);
    expect(state.version).toBe(2);
    expect(state.players.p1.at).toBe('yas');
    expect(state.players.p2.at).toBe('yas');
    expect(state.flags['a1_done']).toBe(1);
    expect(state.res['res_01']).toBe(7);
    expect(state.res['res_22']).toBe(0);
  });

  it('drops an in-progress scene that no longer exists, keeping the world playable', () => {
    const s = newWorld(content, 1, 0);
    s.scene = { id: 'scn_removed', node: 'n1', paused: false, ready: {}, picks: {}, used: {}, trail: [], combat: null, startedAt: 0 };
    const { state } = migrateState(JSON.parse(JSON.stringify(s)), content, 0);
    expect(state.scene).toBeNull();
  });

  it('a mid-game world saved to SQLite loads back identically, new resources get defaults', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bezgomin-'));
    const db = join(dir, 'world.db');
    const r = autoplay({ choice: 'random', combat: 'smart', seed: 1 }, { choice: 'random', combat: 'smart', seed: 2 }, {
      seed: 4,
      until: (w) => !!w.state.flags['done:scn_07'],
    });
    const st = new Storage(db);
    const live = r.world.state;
    delete (live.res as Record<string, number>)['res_13'];
    st.saveWorld(live.version, JSON.stringify(live));
    st.close();

    const st2 = new Storage(db);
    const gs = new GameServer({ content, storage: st2, clock: () => 123 });
    expect(gs.state.flags).toEqual(live.flags);
    expect(gs.state.res['res_13']).toBe(0);
    expect(gs.state.meta.day).toBe(live.meta.day);
    st2.backupTo(join(dir, 'b.db'));
    expect(existsSync(join(dir, 'b.db'))).toBe(true);
    st2.close();
  });

  it('archives the old state before migrating and saves the new one', () => {
    const st = new Storage(':memory:');
    const old = { ...newWorld(content, 1, 0), version: STATE_VERSION - 1 };
    st.saveWorld(old.version, JSON.stringify(old));
    const registry: Record<number, Migration> = { [STATE_VERSION - 1]: (x) => ({ ...x, version: STATE_VERSION }) };
    const gs = new GameServer({ content, storage: st, migrations: registry });
    expect(st.archiveCount()).toBe(1);
    expect(st.loadWorld()!.version).toBe(STATE_VERSION);
    expect(gs.state.version).toBe(STATE_VERSION);
    st.close();
  });

  it('refuses to start on a world it cannot migrate instead of overwriting it', () => {
    const st = new Storage(':memory:');
    st.saveWorld(STATE_VERSION + 1, JSON.stringify({ ...newWorld(content, 1, 0), version: STATE_VERSION + 1 }));
    expect(() => new GameServer({ content, storage: st })).toThrow(MigrationError);
    expect(st.loadWorld()!.version).toBe(STATE_VERSION + 1);
    st.close();
  });
});
