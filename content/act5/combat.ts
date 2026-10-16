import type { EncounterDef } from '../../shared/src/content.js';
import { R } from '../act1/ids.js';
import { R2 } from '../act2/ids.js';
import { E5 } from './ids.js';

/** Without his mother at the water, the Master has to be stopped. Not killed: stopped. */
export const encounters5: EncounterDef[] = [
  {
    id: E5.master,
    name: 'Наставник',
    enemy: { name: 'Наставник Северин і сірі', hp: 22, fear: 14, dmg: [1, 3] },
    bars: { hp: 'Сірі', fear: 'Наставник вагається' },
    maxRounds: 14,
    options: [
      {
        id: 'name',
        label: 'Гукнути його: «Савко!»',
        fear: 3,
        log: {
          self: 'Ти кричиш через воду: «Савко!» Він здригається, наче від удару, і на мить забуває слова.',
          other: '{name} гукає: «Савко!» — і Наставник збивається на півслові.',
        },
      },
      {
        id: 'horn',
        label: 'Засурмити в ріг',
        role: 'hunter',
        visible: { res: R2.horn, gte: 1 },
        dmg: [3, 5],
        log: { self: 'Ріг реве над озером, і сірі хитаються, хапаючись за вуха.', other: '{name} сурмить у ріг — сірі хитаються.' },
      },
      {
        id: 'push',
        label: 'Відштовхувати сірих',
        dmg: [1, 3],
        hit: 0.85,
        log: { self: 'Ти збиваєш сірого з ніг на мокрий камінь.', other: '{name} збиває сірого з ніг.' },
        miss: { self: 'Сірий вислизає з-під руки.', other: '{name} промахується.' },
      },
      {
        id: 'torch',
        label: 'Махати смолоскипом',
        visible: { res: R.torch, gte: 1 },
        cost: { [R.torch]: 1 },
        fear: 2,
        dmg: [1, 1],
        log: { self: 'Вогонь у твоїй руці розганяє сірих.', other: '{name} розмахує смолоскипом.' },
      },
      {
        id: 'guard',
        label: 'Прикривати спину',
        defend: true,
        log: { self: 'Ти стаєш спиною до спини.', other: '{name} прикриває тобі спину.' },
      },
    ],
    downOption: {
      id: 'up',
      label: 'Звестися на ноги',
      heal: 3,
      log: { self: 'Ти зводишся, хапаючись за камінь.', other: '{name} підводиться.' },
    },
    ally: {
      if: { flag: 'a5_master_tries', gte: 1 },
      fear: 2,
      log: { all: 'Наставник дедалі частіше замовкає на півслові. Щось у ньому вже тріснуло.' },
    },
    enemyLog: { self: 'Сірі валять тебе на камінь.', other: '{name} падає під сірими.' },
    enemyMissLog: { self: 'Ти вивертаєшся з сірих рук.', other: '{name} вивертається.' },
  },
];
