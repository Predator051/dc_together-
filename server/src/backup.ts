// Manual backup: node --experimental-sqlite dist/backup.js [target-file]
import { join, resolve } from 'node:path';
import { Storage } from './storage.js';

const dataDir = resolve(process.env.DATA_DIR ?? './data');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = resolve(process.argv[2] ?? join(dataDir, 'backups', `manual-${stamp}.db`));

const st = new Storage(join(dataDir, 'world.db'));
st.backupTo(target);
st.close();
console.log(`Backup written: ${target}`);
