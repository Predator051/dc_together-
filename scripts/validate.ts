import { content } from '../content/index.js';
import { validateContent } from '../server/src/validate.js';

const r = validateContent(content);
for (const w of r.warnings) console.log(`warning: ${w}`);
for (const e of r.errors) console.log(`ERROR: ${e}`);
console.log(`${r.errors.length} errors, ${r.warnings.length} warnings`);
process.exit(r.errors.length ? 1 : 0);
