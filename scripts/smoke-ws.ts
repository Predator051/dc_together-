// Smoke test against a running server: node scripts/smoke-ws.ts ws://host/ws CODE
import { TestClient } from '../tests/wsclient.js';
const [url, code] = process.argv.slice(2);
const a = new TestClient(url!);
await a.open();
const lob = a.wait('lobby');
a.send({ t: 'lobby', code: code! });
const l = await lob;
console.log('slots', JSON.stringify(l.slots));
if (l.freeRoles.length) {
  await a.join(code!, 'Перевірка', 'm', l.freeRoles[0]!);
  console.log('joined as', a.pid, 'goal:', a.view?.goal);
  const r = await a.cmd({ c: 'act', id: 'act_p1' });
  console.log('act ok', r.ok);
}
await a.close();
process.exit(0);
