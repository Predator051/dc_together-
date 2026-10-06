import type { EncounterDef } from '../../shared/src/content.js';
import { encounters } from '../act1/combat.js';
import { E2, R2 } from './ids.js';

const base = encounters[0]!;

/** The pack from Ясенець, in its own forest: tougher, no bell, no dog — but there is the horn. */
export const encounters2: EncounterDef[] = [
  {
    ...base,
    id: E2.lair,
    name: 'Зграя в бору',
    enemy: { name: 'Зграя в бору', hp: 16, fear: 12, dmg: [1, 3] },
    options: [
      ...base.options.filter((o) => o.id !== 'bell'),
      {
        id: 'horn',
        label: 'Сурмити в ріг',
        visible: { res: R2.horn, gte: 1 },
        fear: 5,
        log: {
          self: 'Ти здіймаєш ріг Лук\'яна — і бір здригається від реву. Вовки припадають до снігу, наче їх ударило.',
          other: '{name} сурмить у ріг — бір здригається, вовки припадають до снігу.',
        },
      },
    ],
    ally: undefined,
    armor: undefined,
  },
];
