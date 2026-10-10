import type { EncounterDef } from '../../shared/src/content.js';
import { R } from '../act1/ids.js';
import { R2 } from '../act2/ids.js';
import { E4, R4 } from './ids.js';

/**
 * At the altar: one holds off the watchers, the other burns the Book.
 * The "fear" bar is the Book catching fire; the guards are voiceless people, knocked down, not killed.
 */
export const encounters4: EncounterDef[] = [
  {
    id: E4.book,
    name: 'Біля Книги',
    enemy: { name: 'Сестра Зорина й сторожа', hp: 26, fear: 12, dmg: [1, 3] },
    bars: { hp: 'Сторожа', fear: 'Книга горить' },
    maxRounds: 14,
    options: [
      {
        id: 'oil',
        label: 'Лити олію на сторінки',
        role: 'maker',
        cost: { [R4.oil]: 1 },
        fear: 4,
        log: {
          self: 'Ти хлюпаєш олію просто на розгорнуті сторінки. Віск між аркушами мокріє й темніє.',
          other: '{name} хлюпає олію на Книгу.',
        },
      },
      {
        id: 'fire',
        label: 'Підпалити від каганця',
        role: 'maker',
        fear: 2,
        log: {
          self: 'Ти підносиш каганець до краю сторінки. Пергамент чорніє, скручується, і по ньому біжить синій вогник.',
          other: '{name} підносить вогонь до Книги. Край сторінки займається.',
        },
      },
      {
        id: 'horn',
        label: 'Засурмити в ріг',
        role: 'hunter',
        visible: { res: R2.horn, gte: 1 },
        dmg: [3, 5],
        log: {
          self: 'Ріг реве над чорною водою, і безголосі сторожі хитаються, наче їх розбудили серед сну. Хтось сідає просто на камінь.',
          other: '{name} сурмить у ріг — сторожі хитаються й сідають.',
        },
      },
      {
        id: 'push',
        label: 'Відштовхувати сторожу',
        dmg: [1, 3],
        hit: 0.85,
        log: { self: 'Ти відштовхуєш сторожа, і він падає на мокрий камінь, не пручаючись.', other: '{name} відштовхує сторожа від Книги.' },
        miss: { self: 'Сторож іде на тебе, наче не відчуває поштовху.', other: '{name} не втримує сторожа.' },
      },
      {
        id: 'torch',
        label: 'Кинути смолоскип на вівтар',
        visible: { res: R.torch, gte: 1 },
        cost: { [R.torch]: 1 },
        fear: 2,
        dmg: [1, 1],
        log: { self: 'Смолоскип падає на вівтар, і віск довкола Книги починає топитися.', other: '{name} кидає смолоскип на вівтар.' },
      },
      {
        id: 'guard',
        label: 'Стати між сторожею й Книгою',
        role: 'hunter',
        defend: true,
        taunt: true,
        log: {
          self: 'Ти стаєш спиною до вівтаря й розводиш руки. Хай ідуть на тебе, а не до вогню.',
          other: '{name} стає між сторожею й тобою. Пали.',
        },
      },
    ],
    downOption: {
      id: 'up',
      label: 'Звестися на ноги',
      heal: 3,
      log: { self: 'Ти зводишся, хапаючись за мокрий камінь.', other: '{name} підводиться з каміння.' },
    },
    // Onysym keeps his word, and every failed attempt teaches where to stand.
    ally: {
      if: { any: [{ flag: 'a3_onysym_atone' }, { flag: 'a4_fight_tries', gte: 1 }] },
      fear: 2,
      log: {
        all: [
          { if: { flag: 'a3_onysym_atone' }, text: 'Онисим кидає в озеро запалений ґніт, і сторожа обертається на світло. Ще мить — і вогонь на Книзі розгоряється.' },
          { text: 'Ви знаєте вже, де стати й куди лити: вогонь лізе сторінками швидше, ніж минулого разу.' },
        ],
      },
    },
    enemyLog: { self: 'Сторож мовчки хапає тебе за руку й валить на камінь.', other: '{name} падає під руками сторожа.' },
    enemyMissLog: { self: 'Холодні пальці ковзають по твоєму рукаву.', other: '{name} вислизає з рук сторожа.' },
  },
];
