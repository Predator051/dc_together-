import type { ActionDef } from '../../shared/src/content.js';
import { L, R } from '../act1/ids.js';
import { L3 } from '../act3/ids.js';
import { L4, R4, RUBBLE, SHAFT } from './ids.js';

const SEC = 1000;
const fireInCave = { flag: 'built:act_64' };

const renderFat = (id: string, group: string, enabled?: ActionDef['enabled']): ActionDef => ({
  id,
  group,
  label: 'Перетопити жир на олію',
  visible: { flag: 'a3_done' },
  ...(enabled ? { enabled, disabledHint: 'Потрібен вогонь у печері.' } : {}),
  cost: { [R.fat]: 2 },
  yield: { [R4.oil]: 2 },
  cooldown: 6 * SEC,
  kind: 'craft',
  busy: 'перетоплює жир',
  log: {
    self: [
      'Жир шкварчить у казанку, і ти зливаєш прозору олію в глечик. Каганцю стане надовго.',
      'Від казанка тягне гарячим салом. Олія виходить чиста, жовта, як мед.',
    ],
    other: '{name} {перетопив|перетопила} жир на олію.',
  },
});

export const actions4: ActionDef[] = [
  // ------------------------------------------------------------------ light
  renderFat('act_80', L3.camp, fireInCave),
  renderFat('act_88', L.house),
  {
    id: 'act_81',
    group: L3.camp,
    label: 'Витоплювати риб\'ячий жир',
    visible: { flag: 'a3_done' },
    enabled: fireInCave,
    disabledHint: 'Потрібен вогонь у печері.',
    cost: { [R.food]: 3 },
    yield: { [R4.oil]: 1 },
    cooldown: 8 * SEC,
    kind: 'craft',
    busy: 'витоплює риб\'ячий жир',
    log: {
      self: 'Риб\'ячі тельбухи довго киплять над вогнем. Сморід страшенний, зате олії вистачить на кілька годин світла.',
      other: '{name} {витопив|витопила} риб\'ячий жир. У печері тхне рибою.',
    },
  },
  {
    id: 'act_82',
    group: L3.camp,
    label: 'Змайструвати каганець',
    role: 'maker',
    once: true,
    visible: { flag: 'a3_done' },
    cost: { [R.iron]: 2, [R.fat]: 1 },
    yield: { [R4.lamp]: 1 },
    cooldown: 10 * SEC,
    kind: 'craft',
    busy: 'майструє каганець',
    log: {
      self: 'Ти вигинаєш із заліза мисочку з носиком, скручуєш ґніт із кужеля. Вогник рівний і не боїться протягу — не те що смолоскип.',
      other: '{name} {змайстрував|змайструвала} каганець. Тепер є з чим спускатися.',
    },
  },
  {
    id: 'act_83',
    group: L.smithy,
    label: 'Викувати кайло',
    role: 'maker',
    once: true,
    visible: { flag: 'a3_done' },
    cost: { [R.iron]: 3, [R.wood]: 2 },
    yield: { [R4.pick]: 1 },
    cooldown: 12 * SEC,
    kind: 'craft',
    busy: 'кує кайло',
    log: {
      self: 'Мирон, мабуть, сварився б, як ти тримаєш кліщі. Але кайло виходить важке, з добрим гострим дзьобом.',
      other: '{name} {викував|викувала} кайло в кузні.',
    },
  },

  // ------------------------------------------------------------------ the old passage: loosen, carry, repeat
  {
    id: 'act_84',
    group: L4.passage,
    label: 'Розхитувати брили кайлом',
    role: 'maker',
    visible: { flag: 'a4_rubble', lt: RUBBLE },
    enabled: { all: [{ res: R4.pick, gte: 1 }, { flag: 'a4_loose', lt: 2 }] },
    disabledHint: [
      { if: { res: R4.pick, lt: 1 }, text: 'Потрібне кайло. Викувати його можна в кузні в Ясенці.' },
      { text: 'Розхитане каміння ще лежить. Спершу його треба винести.' },
    ],
    effects: [{ inc: 'a4_loose' }],
    gives: 'Розхитане каміння, щоб винести',
    cooldown: 10 * SEC,
    busy: 'розбиває завал',
    log: {
      self: [
        'Ти загонуєш кайло в шпарину між брилами й налягаєш усім тілом. Камінь неохоче зсувається.',
        'Брила тріскає навпіл. Звідти дмухає холодом, аж сльозяться очі.',
        'Кайло дзвенить об крейду. Ти зупиняєшся й слухаєш: чи не сиплеться згори. Ні, тримає.',
      ],
      other: '{name} {розхитав|розхитала} кілька брил. Тепер їх треба винести.',
    },
  },
  {
    id: 'act_85',
    group: L4.passage,
    label: 'Виносити каміння',
    role: 'hunter',
    visible: { flag: 'a4_rubble', lt: RUBBLE },
    enabled: { flag: 'a4_loose', gte: 1 },
    disabledHint: 'Спершу треба розхитати брили кайлом.',
    effects: [
      { inc: 'a4_loose', by: -1 },
      { inc: 'a4_rubble' },
      {
        if: { flag: 'a4_rubble', gte: RUBBLE },
        then: [{ log: { all: 'Остання брила відкочується вбік, і з чорного пролому дихає протягом. Лук\'янів хід відкрито.', kind: 'story' } }],
      },
    ],
    gives: 'Завал меншає',
    cooldown: 10 * SEC,
    busy: 'виносить каміння',
    log: {
      self: [
        'Ти виносиш каміння до води по одному, як колись Лук\'ян. Плечі гудуть.',
        'Брили важкі й гострі. Ти складаєш їх уздовж стіни рівним валом.',
      ],
      other: '{name} {виніс|винесла} розхитане каміння. Завал меншає.',
    },
  },

  // ------------------------------------------------------------------ the shaft: a way out for the many
  {
    id: 'act_86',
    group: L4.shaft,
    label: 'Кріпити стовбур шахти',
    role: 'maker',
    visible: { flag: 'a4_shaft', lt: SHAFT },
    cost: { [R.wood]: 3 },
    effects: [
      { inc: 'a4_shaft' },
      {
        if: { flag: 'a4_shaft', gte: SHAFT },
        then: [
          { set: 'a5_route_ready' },
          { log: { all: 'Шахту розчищено й закріплено. Тепер тут можуть вийти люди — усі, скільки їх буде.', kind: 'story' } },
        ],
      },
    ],
    gives: 'Шахта міцнішає',
    cooldown: 12 * SEC,
    busy: 'кріпить шахту',
    log: {
      self: 'Ти вклинюєш свіжі колоди замість погнилих. Дерево скрипить, але тримає.',
      other: '{name} {закріпив|закріпила} ще кілька сажнів шахти.',
    },
  },
  {
    id: 'act_87',
    group: L4.shaft,
    label: 'Вигрібати сніг і каміння',
    role: 'hunter',
    visible: { flag: 'a4_shaft', lt: SHAFT },
    effects: [
      { inc: 'a4_shaft' },
      {
        if: { flag: 'a4_shaft', gte: SHAFT },
        then: [
          { set: 'a5_route_ready' },
          { log: { all: 'Шахту розчищено й закріплено. Тепер тут можуть вийти люди — усі, скільки їх буде.', kind: 'story' } },
        ],
      },
    ],
    gives: 'Шахта розчищається',
    cooldown: 12 * SEC,
    busy: 'розчищає шахту',
    log: {
      self: [
        'Ти лізеш угору по колодах і скидаєш униз сніг, гілля, каміння. Згори на обличчя сиплеться небо.',
        'Вітер у шахті свистить, як у сопілці. Ти вигрібаєш ще сажень.',
      ],
      other: '{name} {розчистив|розчистила} частину шахти.',
    },
  },
];
