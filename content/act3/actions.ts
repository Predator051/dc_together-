import type { ActionDef, PoolActionDef } from '../../shared/src/content.js';
import { L, R, done } from '../act1/ids.js';
import { L2, R2 } from '../act2/ids.js';
import { L3, R3, S3 } from './ids.js';

const SEC = 1000;
const canCross = { any: [{ flag: 'a2_ferry_ok' }, { res: R2.raft, gte: 1 }] };

const plugs = (id: string, group: string): ActionDef => ({
  id,
  group,
  label: 'Зліпити затички від гулу',
  role: 'maker',
  visible: { flag: 'a2_done' },
  cost: { [R3.wax]: 1 },
  yield: { [R3.plugs]: 4 },
  cooldown: 5 * SEC,
  kind: 'craft',
  busy: 'ліпить затички',
  log: {
    self: 'Ти розминаєш віск у теплих долонях, змішуєш із куделею й ліпиш тугі затички — дві пари. Як у Мирослави.',
    other: '{name} {зліпив|зліпила} затички з воску.',
  },
});

export const actions3: ActionDef[] = [
  // ------------------------------------------------------------------ wax & earplugs
  plugs('act_66', L2.tower),
  plugs('act_67', L.house),
  plugs('act_77', L3.camp),
  {
    id: 'act_68',
    group: L.apiary,
    label: 'Набрати меду й воску в омшанику',
    visible: { flag: 'a2_done' },
    yield: { [R3.honey]: 1, [R3.wax]: 2 },
    cooldown: 8 * SEC,
    kind: 'gather',
    busy: 'порається в омшанику',
    log: {
      self: [
        'В омшанику тепло й темно, вулики тихо гудуть — живий гул, не той. Ти відламуєш стільник і вирізаєш шмат воску.',
        'Бджоли сонні й не жалять. Мед густий, темний, гречаний.',
      ],
      other: '{name} {набрав|набрала} меду й воску на пасіці.',
    },
  },
  {
    id: 'act_69',
    group: L2.ferry,
    label: 'Обміняти шкуру на віск',
    visible: { flag: 'a2_done' },
    cost: { [R.hide]: 1 },
    yield: { [R3.wax]: 1 },
    cooldown: 6 * SEC,
    busy: 'міняє шкуру на віск',
    log: {
      self: 'Мирослава відламує з полиці жовтий брусок воску. «Затички, — каже вона. — Тугіше вминайте»',
      other: '{name} {виміняв|виміняла} у Мирослави віск.',
    },
  },

  // ------------------------------------------------------------------ crossing
  {
    id: 'act_62',
    group: L2.river,
    label: 'Переправитися до Лук\'янової печери',
    visible: done(S3.crossing),
    enabled: canCross,
    disabledHint: 'Потрібен пором або пліт.',
    cooldown: 20 * SEC,
    busy: 'переправляється через Глушу',
    gives: 'Дорога через Глушу',
    log: {
      self: ['Глуша б\'є в борт, але ти вже знаєш її норов. Нора над водою зустрічає тебе глухим гулом.', 'Ти переправляєшся вдосвіта, поки на кручах нікого немає.'],
      other: '{name} {переправився|переправилася} до Лук\'янової печери.',
    },
    effects: [{ moveTo: 'kruchi' }],
  },
  {
    id: 'act_63',
    group: L3.camp,
    label: 'Повернутися на свій берег',
    enabled: canCross,
    disabledHint: 'Потрібен пором або пліт.',
    cooldown: 20 * SEC,
    busy: 'переправляється на свій берег',
    gives: 'Дорога через Глушу',
    log: {
      self: ['Ти переправляєшся назад, до вежі. За спиною гул стихає, і в голові світлішає.', 'Свій берег. Шум ріки, сосни, вежа. Можна дихати.'],
      other: '{name} {повернувся|повернулася} на свій берег.',
    },
    effects: [{ moveTo: 'tower' }],
  },

  // ------------------------------------------------------------------ camp
  {
    id: 'act_79',
    group: L3.camp,
    label: 'Зробити смолоскип зі смолистого плавника',
    role: 'maker',
    visible: done(S3.camp),
    cost: { [R.wood]: 2 },
    yield: { [R.torch]: 1 },
    cooldown: 6 * SEC,
    kind: 'craft',
    busy: 'робить смолоскип',
    log: {
      self: 'Сосновий плавник, просочений живицею, горить і без жиру — чадно, але довго.',
      other: '{name} {зробив|зробила} смолоскип.',
    },
  },
  {
    id: 'act_64',
    group: L3.camp,
    label: 'Розпалити вогонь у печері',
    once: true,
    cost: { [R.wood]: 3 },
    cooldown: 4 * SEC,
    kind: 'build',
    gives: 'Можна вечеряти в печері',
    log: {
      self: 'Ти розпалюєш вогонь у Лук\'яновому вогнищі. Дим іде вгору, у хід, — туди, де тягне повітрям.',
      other: '{name} {розпалив|розпалила} вогонь у печері.',
    },
  },
  {
    id: 'act_65',
    group: L3.shore,
    label: 'Набрати води',
    visible: done(S3.camp),
    yield: { [R.water]: 2 },
    cooldown: 4 * SEC,
    kind: 'gather',
    busy: 'набирає воду під урвищем',
    log: { self: ['Вода під урвищем біла від крейди. Треба дати їй відстоятися.', 'Ти набираєш воду, не зводячи очей зі стежок на кручах.'], other: '{name} набирає воду.' },
  },
  {
    id: 'act_75',
    group: L3.shore,
    label: 'Збирати плавник',
    role: 'hunter',
    visible: done(S3.camp),
    yield: { [R.wood]: 1 },
    cooldown: 6 * SEC,
    kind: 'gather',
    busy: 'збирає плавник під урвищем',
    log: { self: ['Ріка наносить під урвище гілля й дошки. Одна дошка — з вирізаним колом, перетятим рискою.', 'Сухий плавник, вибілений крейдою.'], other: '{name} збирає плавник.' },
  },
  {
    id: 'act_76',
    group: L3.shore,
    label: 'Рибалити в заводі',
    role: 'hunter',
    visible: { all: [done(S3.camp), { res: R2.hooks, gte: 1 }] },
    yield: { [R.food]: [1, 2] },
    cooldown: 12 * SEC,
    kind: 'gather',
    busy: 'рибалить під урвищем',
    log: { self: ['Риба тут лінива й сліпувата. Бере сама.', 'Окунь, ще окунь. І жодного сплеску — навіть риба тут мовчить.'], other: '{name} рибалить у заводі.' },
  },
  {
    id: 'act_78',
    group: L3.shore,
    label: 'Поставити вершу',
    role: 'maker',
    visible: done(S3.camp),
    yield: { [R.food]: 1 },
    cooldown: 10 * SEC,
    kind: 'gather',
    busy: 'ставить вершу',
    log: { self: 'Ти ставиш вершу в тихій заводі під урвищем. До вечора в ній кілька риб.', other: '{name} ставить верші.' },
  },

  // ------------------------------------------------------------------ medicine & community
  {
    id: 'act_70',
    group: L.house,
    label: 'Зварити відвар',
    role: 'maker',
    visible: { flag: 'a3_recipe' },
    cost: { [R3.honey]: 1, [R.water]: 1, [R.wood]: 1 },
    yield: { [R3.broth]: 2 },
    cooldown: 8 * SEC,
    kind: 'craft',
    busy: 'варить відвар',
    log: {
      self: 'Соснова хвоя, мед, окріп. Відвар виходить гіркий, аж зводить вилиці. Дід Панас нюхає й киває: так.',
      other: '{name} {зварив|зварила} гіркий відвар.',
    },
  },
  {
    id: 'act_71',
    group: L3.commune,
    label: 'Напоїти безголосого відваром',
    visible: { flag: 'a3_recipe' },
    cost: { [R3.broth]: 1, [R3.sick]: 1 },
    yield: { [R3.idle]: 1 },
    cooldown: 5 * SEC,
    busy: 'напуває безголосих відваром',
    gives: 'Ще один повернеться до себе',
    log: {
      self: [
        'Ти напуваєш відваром, кличеш на ім\'я — довго, терпляче. І людина відгукується: кліпає, плаче, питає, де вона.',
        'Після відвару жінка з Ясенця довго дивиться на свої руки, а тоді питає, чи доїла хтось її корову.',
      ],
      other: '{name} напуває безголосих відваром.',
    },
    beats: [
      { log: { self: 'Ганна вперше дивиться на тебе, а не крізь. — Ти… — каже вона. — Ти ж нашої… — І плаче, не договоривши.' } },
      { if: { flag: 'a3_marijka_saved' }, log: { self: 'Марійка сидить на ґанку в обох черевичках і розповідає Сіркові щось довге й поважне. Сірко слухає.' } },
      { if: { flag: 'a3_men_saved' }, log: { self: 'Мирон уперше бере до рук молот. Тримає довго, а тоді йде до кузні, не сказавши ні слова. Увечері з кузні чути дзвін.' } },
      { if: { flag: 'a3_men_saved' }, log: { self: 'Остап і Гордій сидять на ґанку, і Остап — уголос — розповідає батькові, як минула зима. Голос у нього хрипкий і невпевнений, але це голос.' } },
    ],
    effects: [{ inc: 'recovered' }],
  },
  {
    id: 'act_72',
    group: L3.commune,
    label: 'Послати по дрова',
    visible: { flag: 'recovered', gte: 1 },
    cost: { [R3.idle]: 1 },
    yield: { [R3.workWood]: 1 },
    cooldown: 2 * SEC,
    gives: 'Щодня: Дрова +2',
    log: { self: 'Ще одні руки в лісі. Сокира застукала за селом.', other: '{name} {послав|послала} людей по дрова.' },
  },
  {
    id: 'act_73',
    group: L3.commune,
    label: 'Послати на лови',
    visible: { flag: 'recovered', gte: 1 },
    cost: { [R3.idle]: 1 },
    yield: { [R3.workFood]: 1 },
    cooldown: 2 * SEC,
    gives: 'Щодня: Харчі +2',
    log: { self: 'Хтось бере сіті й вудки й іде до ставка за млином.', other: '{name} {послав|послала} людей на лови.' },
  },
  {
    id: 'act_74',
    group: L3.commune,
    label: 'Послати по воду',
    visible: { flag: 'recovered', gte: 1 },
    cost: { [R3.idle]: 1 },
    yield: { [R3.workWater]: 1 },
    cooldown: 2 * SEC,
    gives: 'Щодня: Вода +2',
    log: { self: 'Біля криниці знову черга з відрами й розмови. Тихі, але розмови.', other: '{name} {послав|послала} людей по воду.' },
  },
];

export const pools3: PoolActionDef[] = [
  {
    id: 'pool_03',
    group: L3.camp,
    label: 'Повечеряти біля вогню',
    pool: 'supper3',
    visible: { flag: 'built:act_64' },
    cost: { [R.food]: 2, [R.water]: 1 },
    gives: 'Новий день · сили відновляться',
  },
];

