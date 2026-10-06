import type { SceneDef } from '../../../shared/src/content.js';
import { done } from '../../act1/ids.js';
import { supperEnd2 } from '../../act2/scenes/ferry.js';
import { S3 } from '../ids.js';

/** Suppers by the fire in Lukyan's cave. */
export const supperScenes3: SceneDef[] = [
  {
    id: S3.supHanna,
    title: 'Після Ганни',
    pool: 'supper3',
    priority: 20,
    visible: { flag: 'a3_hanna_saved' },
    start: 'n1',
    nodes: {
      n1: {
        text: 'Ви вечеряєте біля вогню в печері й довго мовчите. Перед очима — Ганна з долонею під щокою і порожніми очима.',
        next: 'n2',
      },
      n2: {
        type: 'choice',
        mode: 'each',
        text: 'Про що ти думаєш?',
        options: [
          { id: 'hope', label: 'Що ми виведемо всіх', effects: [{ pset: 'bg_a3_hope' }] },
          { id: 'pain', label: 'Що вона нас не впізнала', effects: [{ pset: 'bg_a3_pain' }] },
          { id: 'guilt', label: 'Що треба було прийти раніше', effects: [{ pset: 'bg_a3_guilt' }] },
        ],
        next: 'n3',
      },
      n3: {
        text: 'Вогонь потріскує, а гул за стінами печери — рівний, терплячий, як вода, що точить камінь.',
        next: null,
      },
    },
    onEnd: supperEnd2,
  },
  {
    id: S3.supMaster,
    title: 'Наставник',
    pool: 'supper3',
    priority: 19,
    visible: done(S3.sermon),
    start: 'n1',
    nodes: {
      n1: {
        text: 'Ви довго говорите про Наставника. Про те, як його слухала зала. Про те, як хотілося слухати й вам.',
        next: 'n2',
      },
      n2: {
        type: 'choice',
        mode: 'each',
        text: 'Що тобі найбільше запам\'яталося?',
        options: [
          { id: 'voice', label: 'Його голос', effects: [{ pset: 'bg_a3_voice' }] },
          { id: 'hands', label: 'Його руки', effects: [{ pset: 'bg_a3_hands' }] },
          { id: 'silence', label: 'Те, як усі мовчали', effects: [{ pset: 'bg_a3_silence' }] },
        ],
        next: 'n3',
      },
      n3: {
        hunter: 'Ти не можеш забути шрам на його лівій долоні — кривий, як гачок.',
        maker: 'Ти не можеш забути стіну імен за його спиною — і ті, що ще біліють.',
        text: 'Ви засинаєте пізно. Уві сні хтось співає без голосу.',
        next: null,
      },
    },
    onEnd: supperEnd2,
  },
  {
    id: S3.supA,
    title: 'Вечеря в печері',
    pool: 'supper3',
    once: false,
    start: 'n1',
    nodes: {
      n1: {
        text: 'Риба на камені, солонина, гіркий відвар замість чаю. Гул за стіною не стихає ні на мить, і ви вчитеся говорити тихо, наче ріка може підслухати.',
        next: null,
      },
    },
    onEnd: supperEnd2,
  },
  {
    id: S3.supB,
    title: 'Вечеря в печері',
    pool: 'supper3',
    once: false,
    start: 'n1',
    nodes: {
      n1: {
        text: [
          [
            { if: { flag: 'a3_done' }, text: 'Ви вечеряєте мовчки. Обоє думаєте про Соляні сходи і про темряву, що ковтала людей по одному.' },
            { text: 'Вогонь горить рівно, дим тягне вгору, у завалений хід. Звідти пахне сирістю й чимось давнім.' },
          ],
        ],
        next: null,
      },
    },
    onEnd: supperEnd2,
  },
];
