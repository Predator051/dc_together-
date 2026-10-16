import type { ActionDef } from '../../shared/src/content.js';
import { L, R } from '../act1/ids.js';
import { L2 } from '../act2/ids.js';
import { L3 } from '../act3/ids.js';
import { BELLS, L5, R5 } from './ids.js';

const SEC = 1000;
const ready = { flag: 'done:scn_100' };

const wedges = (id: string, group: string): ActionDef => ({
  id,
  group,
  label: 'Тесати клини',
  role: 'maker',
  visible: ready,
  cost: { [R.wood]: 2 },
  yield: { [R5.wedges]: 2 },
  cooldown: 8 * SEC,
  kind: 'craft',
  busy: 'теше клини',
  log: {
    self: [
      'Ти колеш сухий дуб на клини — довгі, гострі, з широкою п\'ятою під удар.',
      'Клин за клином. Горислава теж колись так сиділа: тесала й рахувала.',
    ],
    other: '{name} {витесав|витесала} ще два клини.',
  },
});

const bundles = (id: string, group: string, extra?: Record<string, number>): ActionDef => ({
  id,
  group,
  label: 'В\'язати смолисті в\'язанки',
  role: 'hunter',
  visible: ready,
  cost: { [R.wood]: 2, ...(extra ?? {}) },
  yield: { [R5.bundles]: 1 },
  cooldown: 8 * SEC,
  kind: 'craft',
  busy: 'в\'яже смолисті в\'язанки',
  log: {
    self: 'Ти добираєш найсмолистіші поліна, обмотуєш їх лубом. Така в\'язанка горить довго й жарко — крейда від неї тріскає.',
    other: '{name} {зв\'язав|зв\'язала} смолисту в\'язанку.',
  },
});

const bellsDone = [
  {
    if: { flag: 'a5_bells', gte: BELLS },
    then: [{ log: { all: 'Дзвіницю готово. Ясенець гудітиме цієї ночі до самого ранку.', kind: 'story' as const } }],
  },
];

export const actions5: ActionDef[] = [
  wedges('act_90', L3.camp),
  wedges('act_94', L.yard),
  bundles('act_91', L.forest),
  bundles('act_95', L2.forest),
  bundles('act_96', L3.shore, { [R.fat]: 1 }),
  {
    id: 'act_92',
    group: L5.watch,
    label: 'Підтягнути серця дзвонів',
    role: 'maker',
    visible: { flag: 'a5_bells', lt: BELLS },
    cost: { [R.fat]: 1 },
    effects: [{ inc: 'a5_bells' }, ...bellsDone],
    gives: 'Дзвіниця готується',
    cooldown: 10 * SEC,
    busy: 'лагодить дзвони',
    log: {
      self: 'Ти мастиш завіси, міняєш перетерті ремені на серцях. «ГУДИ, ЩОБ НЕ ЗАМОВКЛИ» — під твоєю долонею холодна бронза.',
      other: '{name} {підтягнув|підтягнула} серця дзвонів.',
    },
  },
  {
    id: 'act_97',
    group: L5.watch,
    label: 'Учити громаду бити на сполох',
    role: 'hunter',
    visible: { flag: 'a5_bells', lt: BELLS },
    effects: [{ inc: 'a5_bells' }, ...bellsDone],
    gives: 'Дзвіниця готується',
    cooldown: 10 * SEC,
    busy: 'вчить громаду дзвонити',
    log: {
      self: [
        'Ти ставиш біля мотузок тих, хто вже говорить, і показуєш: раз — і раз, без перерви, як серце. Вони кивають. Вони пам\'ятають, як дзвонили на свята.',
        'Мирон бере мотузку великого дзвону. Руки в нього ще тремтять, але тримають.',
      ],
      other: '{name} {навчив|навчила} людей бити на сполох.',
    },
  },
];
