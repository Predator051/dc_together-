import type { EncounterDef } from '../../shared/src/content.js';
import { R } from '../act1/ids.js';
import { R2 } from '../act2/ids.js';
import { E3 } from './ids.js';

/** The grey brothers: people, not beasts. The heroes knock them down and scare them off. */
export const encounters3: EncounterDef[] = [
  {
    id: E3.grey,
    name: 'Сірі брати',
    enemy: { name: 'Сірі брати', hp: 18, fear: 14, dmg: [1, 3] },
    options: [
      {
        id: 'bow',
        label: 'Стріляти над головами',
        role: 'hunter',
        visible: { res: R.bow, gte: 1 },
        cost: { [R.arrow]: 1 },
        fear: 3,
        log: { self: 'Стріла свистить над каптурами й б\'ється в крейду. Сірі пригинаються.', other: '{name} стріляє над головами сірих — ті пригинаються.' },
      },
      {
        id: 'fist',
        label: 'Збивати з ніг',
        role: 'hunter',
        dmg: [1, 3],
        hit: 0.85,
        log: { self: 'Ти підсікаєш найближчого, і він котиться по крейді.', other: '{name} збиває сірого з ніг.' },
        miss: { self: 'Сірий вислизає з-під руки.', other: '{name} хапає порожнечу.' },
      },
      {
        id: 'shout',
        label: 'Кричати на них',
        role: 'hunter',
        fear: 2,
        log: { self: 'Ти кричиш щосили, і сірі відсахуються: голос тут — як удар.', other: '{name} кричить, і сірі відсахуються від голосу.' },
      },
      {
        id: 'axe',
        label: 'Бити обухом',
        role: 'maker',
        dmg: [2, 3],
        hit: 0.8,
        log: { self: 'Ти б\'єш обухом по руці, що тягнеться до тебе. Сірий осідає.', other: '{name} б\'є обухом — сірий осідає.' },
        miss: { self: 'Обух б\'є в стіну, крейда сиплеться.', other: '{name} б\'є повз.' },
      },
      {
        id: 'torch',
        label: 'Відганяти смолоскипом',
        visible: { res: R.torch, gte: 1 },
        cost: { [R.torch]: 1 },
        fear: 3,
        dmg: [1, 1],
        log: { self: 'Ти тицяєш смолоскипом у сірі каптури. Віск на вустах тече від жару.', other: '{name} розмахує смолоскипом.' },
      },
      {
        id: 'horn',
        label: 'Сурмити в ріг',
        visible: { res: R2.horn, gte: 1 },
        fear: 5,
        log: { self: 'Ріг Лук\'яна реве під склепінням, і сірі хапаються за голови, наче їх ударили.', other: '{name} сурмить у ріг — сірі хапаються за голови.' },
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
      log: { self: 'Ти зводишся на ноги, хапаючи ротом гіркий від диму повітря.', other: '{name} підводиться з крейди.' },
    },
    // After a failed attempt the heroes know the passages better: every round the greys lose heart.
    ally: {
      if: { flag: 'a3_finale_tries', gte: 1 },
      fear: 2,
      log: { all: 'Ви знаєте ці ходи краще, ніж минулого разу: сірі плутаються в поворотах і відступають.' },
    },
    enemyLog: { self: 'Сірий хапає тебе за комір і б\'є головою об стіну.', other: '{name} не встигає ухилитися — сірі валять на крейду.' },
    enemyMissLog: { self: 'Сірі руки хапають повітря біля самого твого обличчя.', other: '{name} вивертається з сірих рук.' },
  },
];
