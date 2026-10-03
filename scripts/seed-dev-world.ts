// Dev helper: play two bots to a given flag and store the world in DATA_DIR (for manual UI checks).
import { join, resolve } from 'node:path';
import { Storage } from '../server/src/storage.js';
import { autoplay } from '../tests/harness.js';

const flag = process.argv[2] ?? 'done:scn_10';
const dataDir = resolve(process.env.DATA_DIR ?? './data');
const r = autoplay({ choice: 'random', combat: 'smart', seed: 5 }, { choice: 'random', combat: 'smart', seed: 6 }, { seed: 5, until: (w) => !!w.state.flags[flag] && !w.state.scene });
if (!r.done) throw new Error('could not reach ' + flag);
const st = new Storage(join(dataDir, 'world.db'));
st.saveWorld(r.world.state.version, JSON.stringify(r.world.state));
st.close();
console.log(`World saved at ${flag}, day ${r.world.state.meta.day}`);
