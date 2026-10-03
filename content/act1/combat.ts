import type { EncounterDef } from '../../shared/src/content.js';
import { A, E, R, built } from './ids.js';

export const encounters: EncounterDef[] = [
  {
    id: E.wolves,
    name: 'Мовчазна зграя',
    enemy: { name: 'Мовчазна зграя', hp: 14, fear: 10, dmg: [1, 3] },
    options: [
      {
        id: 'bow',
        label: 'Стріляти з лука',
        role: 'hunter',
        visible: { res: R.bow, gte: 1 },
        cost: { [R.arrow]: 1 },
        dmg: [3, 5],
        hit: 0.8,
        log: { self: 'Ти пускаєш стрілу — і вона знаходить ціль.', other: '{name} стріляє — влучно.' },
        miss: { self: 'Стріла зариває в сніг.', other: '{name} стріляє — і схиблює.' },
      },
      {
        id: 'knife',
        label: 'Бити ножем',
        role: 'hunter',
        dmg: [1, 3],
        hit: 0.85,
        log: { self: 'Ти б\'єш ножем, коли вовк кидається ближче.', other: '{name} б\'є ножем.' },
        miss: { self: 'Вовк вивертається з-під ножа.', other: '{name} б\'є ножем — повз.' },
      },
      {
        id: 'shout',
        label: 'Кричати на них',
        role: 'hunter',
        fear: 2,
        log: {
          self: 'Ти кричиш щосили, до хрипу. Вовки відсахуються від голосу, як від вогню.',
          other: '{name} кричить на зграю щосили — і вовки відсахуються.',
        },
      },
      {
        id: 'axe',
        label: 'Рубати сокирою',
        role: 'maker',
        dmg: [2, 3],
        hit: 0.8,
        log: { self: 'Ти рубаєш сокирою навідліг.', other: '{name} рубає сокирою навідліг.' },
        miss: { self: 'Сокира свистить у порожнечі.', other: '{name} рубає — і схиблює.' },
      },
      {
        id: 'bell',
        label: 'Бити в дзвін',
        role: 'maker',
        visible: { flag: 'bell_fixed' },
        fear: 4,
        log: {
          self: 'Ти добігаєш до дзвіниці й смикаєш мотузку. Над селом котиться гуркіт — і зграя здригається, наче від удару.',
          other: '{name} б\'є в дзвін — гуркіт котиться над селом, і зграя здригається.',
        },
      },
      {
        id: 'torch',
        label: 'Відганяти смолоскипом',
        visible: { res: R.torch, gte: 1 },
        cost: { [R.torch]: 1 },
        fear: 3,
        dmg: [1, 1],
        log: {
          self: 'Ти тицяєш смолоскипом в оскалені морди. Шерсть тріщить і смердить.',
          other: '{name} розмахує смолоскипом. Пахне паленою шерстю.',
        },
      },
      {
        id: 'guard',
        label: 'Прикривати спину',
        defend: true,
        log: { self: 'Ти стаєш плечем до плеча, прикриваючи спину.', other: '{name} прикриває тобі спину.' },
      },
    ],
    downOption: {
      id: 'up',
      label: 'Звестися на ноги',
      heal: 3,
      log: { self: 'Ти зводишся на ноги, хапаючи ротом холодне повітря.', other: '{name} підводиться зі снігу.' },
    },
    ally: {
      if: { flag: 'sirko' },
      fear: 1,
      log: { all: 'Сірко кидається на вовків — без гавкоту, тільки клацають зуби.' },
    },
    armor: { if: built(A.fortify), value: 1 },
    enemyLog: { self: 'Вовк кидається на тебе й шматує рукав разом зі шкірою.', other: '{name} не встигає ухилитися — вовчі зуби рвуть рукав разом зі шкірою.' },
    enemyMissLog: { self: 'Вовчі зуби клацають біля самого обличчя — повз.', other: '{name} ухиляється від вовчих зубів.' },
  },
];
