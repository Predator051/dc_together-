import type { Effect, SceneDef } from '../../../shared/src/content.js';
import { L, N, S, done, notDone, seen } from '../ids.js';

/** Every supper ends the day. */
const supperEnd: Effect[] = [
  { advanceDay: true },
  { heal: 'full' },
  { if: { flag: 'panas_gift' }, then: [{ set: 'panas_ready' }] },
];

export const supperScenes: SceneDef[] = [
  {
    id: S.sup1,
    title: 'Перша вечеря',
    pool: 'supper',
    priority: 10,
    visible: { any: [seen(L.square), seen(L.smithy), seen(L.hall), seen(L.forest), seen(L.mill)] },
    start: 'n1',
    nodes: {
      n1: {
        text: [
          'Уперше за ці дні ви сідаєте до столу. Юшка з картоплею, хліб, що зачерствів, але ще їстівний. Піч дихає теплом. За вікном синіє, і в жодній хаті не засвічується вогник.',
          'Ганнина ложка лежить біля її миски. Ви не прибираєте її.',
        ],
        next: 'n2',
      },
      n2: {
        type: 'choice',
        mode: 'each',
        text: 'Думка мимоволі тікає на південь, звідки ви прийшли. Що ти там {лишив|лишила}?',
        options: [
          { id: 'home', label: 'Дім, що згорів разом із садом', effects: [{ pset: 'bg_home' }] },
          { id: 'people', label: 'Людей, яких уже не знайти', effects: [{ pset: 'bg_people' }] },
          { id: 'nothing', label: 'Нічого, про що варто згадувати', effects: [{ pset: 'bg_nothing' }] },
        ],
        next: 'n3',
      },
      n3: {
        text: [
          'Ви трохи говорите про південь — уривками, неохоче. Про дорогу, про холодні ночівлі, про те, як восени Ясенець здався вам тихим і добрим місцем, де нарешті можна перезимувати.',
          'Тихим. Тепер це слово муляє, як камінь у чоботі.',
        ],
        next: null,
      },
    },
    onEnd: supperEnd,
  },
  {
    id: S.sup2,
    title: 'Ганна',
    pool: 'supper',
    priority: 8,
    visible: done(S.sup1),
    start: 'n1',
    nodes: {
      n1: {
        text: 'На вечерю — Ганнині соління: капуста з кмином, огірки з дубовим листом. Ви їсте й мимоволі прислухаєтеся, чи не рипнуть двері. Здається, ось-ось увійде вона, обтрусить сніг із хустки й скаже щось насмішкувате.',
        next: 'n2',
      },
      n2: {
        type: 'choice',
        mode: 'each',
        text: 'Що ти найкраще пам\'ятаєш про Ганну?',
        options: [
          { id: 'song', label: 'Як вона співала за кроснами', effects: [{ pset: 'bg_hanna_song' }] },
          { id: 'kind', label: 'Як прийняла нас — без жодного запитання', effects: [{ pset: 'bg_hanna_kind' }] },
          { id: 'boots', label: 'Як сварила нас за брудні чоботи', effects: [{ pset: 'bg_hanna_boots' }] },
        ],
        next: 'n3',
      },
      n3: {
        text: [
          'Ви згадуєте її по черзі, і в хаті ніби теплішає.',
          'А потім спливає розмова з першого тижня. Ганна місила тісто й казала: «Онисим каже, нових запишемо після зимового торгу. Тоді вже будете наші, ясенецькі». І сміялася: «Як запишуть — уже не втечете».',
          'Не записали.',
        ],
        effects: [{ clue: 'clue_14' }, { mystery: 'mys_02', level: 2 }],
        next: null,
      },
    },
    onEnd: supperEnd,
  },
  {
    id: S.sup3,
    title: 'Сірко',
    pool: 'supper',
    priority: 6,
    visible: { all: [{ flag: 'sirko' }, done(S.sup1)] },
    start: 'n1',
    nodes: {
      n1: {
        text: 'Сірко лежить біля печі, поклавши морду на лапи. Час від часу він підводить голову й дивиться на двері. Вуха ворушаться, ловлячи щось, чого ви не чуєте.',
        hunter: 'Ти думаєш про ліс: жодного пташиного сліду на снігу, жодного цвірінькання. Звірі живуть — але мовчать. Так буває перед великою бурею. Тільки буря не приходить.',
        maker: 'Ти думаєш про дзвони без сердець. Про підметену підлогу в громадській хаті. Хтось дуже дбав, щоб у селі стало тихо.',
        next: 'n2',
      },
      n2: {
        text: '— Хтось хотів, щоб тут було тихо, — каже один із вас уголос. І обоє здригаєтеся від власного голосу.',
        next: 'n3',
      },
      n3: {
        type: 'choice',
        mode: 'each',
        text: 'Сірко дивиться на вас знизу вгору.',
        options: [
          { id: 'bone', label: 'Дати Сіркові кістку', effects: [{ rel: N.dog, by: 1 }] },
          { id: 'ear', label: 'Почухати його за вухом', effects: [{ rel: N.dog, by: 1 }] },
        ],
        next: 'n4',
      },
      n4: {
        text: 'Сірко зітхає — по-собачому, глибоко — і вперше за весь вечір заплющує очі.',
        effects: [{ mystery: 'mys_01', level: 2 }],
        next: null,
      },
    },
    onEnd: supperEnd,
  },
  {
    id: S.sup4,
    title: 'Дід',
    pool: 'supper',
    priority: 7,
    visible: done(S.apiary2),
    start: 'n1',
    nodes: {
      n1: {
        text: [
          'Вечеряєте дідовим медом. Він густий, темний, пахне гречкою й димом.',
          '— Він щось знає, — каже один із вас. — Більше, ніж пише.',
        ],
        next: 'n2',
      },
      n2: {
        type: 'choice',
        mode: 'joint',
        text: 'Чи можна йому вірити?',
        options: [
          { id: 'trust', label: 'Він нам не ворог', next: 'n3a', effects: [{ rel: N.panas, by: 1 }, { set: 'a1_trust_panas' }] },
          { id: 'wary', label: 'Треба його стерегтися', next: 'n3b', effects: [{ rel: N.panas, by: -1 }, { set: 'a1_wary_panas' }] },
        ],
        mismatch: 'n3c',
      },
      n3a: {
        text: 'Ви погоджуєтеся: хай що приховує дід, зла він вам не бажає. Мед на смак — як подяка.',
        next: null,
      },
      n3b: {
        text: 'Ви погоджуєтеся: дід бреше, і поки невідомо чому, краще мати очі й на потилиці.',
        next: null,
      },
      n3c: {
        text: 'Ви не доходите згоди. Дід лишається загадкою для вас обох — і, може, так і треба.',
        next: null,
      },
    },
    onEnd: supperEnd,
  },
  {
    id: S.supNight,
    title: 'Перед ніччю',
    pool: 'supper',
    priority: 100,
    visible: { all: [{ flag: 'night_warned' }, notDone(S.night), { noFlag: 'night_attempts' }] },
    start: 'n1',
    nodes: {
      n1: {
        text: [
          'Ви вечеряєте при свічці. Сірко не їсть — лежить під дверима, носом до щілини. За вікном синіє сніг, і над бором висить місяць, круглий і білий.',
          { if: { flag: 'a1_panas_with_us' }, text: 'Дід Панас сидить біля печі й не зводить очей із вікна.' },
        ],
        next: 'n2',
      },
      n2: {
        type: 'choice',
        mode: 'each',
        text: 'Що ти скажеш?',
        options: [
          { id: 'brave', label: '«Хай тільки сунуться»', effects: [{ pset: 'bg_vow_brave' }] },
          { id: 'run', label: '«Якщо що — тікай. Не чекай мене»', effects: [{ pset: 'bg_vow_run' }] },
          { id: 'together', label: '«Головне — триматися разом»', effects: [{ pset: 'bg_vow_together' }] },
        ],
        next: 'n3',
      },
      n3: {
        text: 'Свічка догорає. Ви не гасите її: лягаєте одягнені, з сокирою під лавою й луком біля дверей.',
        next: null,
      },
    },
    onEnd: [...supperEnd, { scene: S.night }],
  },
  {
    id: S.supRetry,
    title: 'Знову ніч',
    pool: 'supper',
    priority: 100,
    once: false,
    visible: { all: [{ flag: 'night_attempts' }, notDone(S.night)] },
    start: 'n1',
    nodes: {
      n1: {
        text: [
          'Ви вечеряєте похапцем, не роздягаючись. Подерті руки ще ниють. Сірко не відходить від дверей.',
          'Цього разу ви чекаєте.',
        ],
        next: null,
      },
    },
    onEnd: [...supperEnd, { scene: S.night }],
  },

  {
    id: S.supBell,
    title: 'Напис',
    pool: 'supper',
    priority: 5,
    visible: { all: [{ flag: 'bell_fixed' }, done(S.sup1)] },
    start: 'n1',
    nodes: {
      n1: {
        text: 'Сьогодні вечеря пахне залізом: руки ще чорні від мастила, долоні стерті мотузками.',
        maker: 'Ти розповідаєш про напис на великому дзвоні: «ГУДИ, ЩОБ НЕ ЗАМОВКЛИ». Хто відливав такі слова — і навіщо?',
        hunter: '{partner} розповідає, що на великому дзвоні відлито: «ГУДИ, ЩОБ НЕ ЗАМОВКЛИ». Ти пробуєш ці слова на смак. Це не прикраса. Це наказ.',
        next: 'n2',
      },
      n2: {
        type: 'choice',
        mode: 'joint',
        text: 'Навіщо селу такий дзвін?',
        options: [
          { id: 'gather', label: 'Щоб скликати людей', next: 'n3a', effects: [{ set: 'a1_bell_gather' }] },
          { id: 'ward', label: 'Щоб відганяти щось', next: 'n3b', effects: [{ set: 'a1_bell_ward' }] },
        ],
        mismatch: 'n3c',
      },
      n3a: {
        text: 'Щоб скликати. Щоб ніхто не загубився в заметіль, у тумані, у темряві. Щоб кожен знав дорогу додому. Від цієї думки трохи тепліше.',
        next: null,
      },
      n3b: {
        text: 'Щоб відганяти. Тоді виходить, що колись у Ясенці вже було від чого. І хтось дуже хотів, щоб про це не забули.',
        next: null,
      },
      n3c: {
        text: 'Ви сперечаєтеся до півночі, а потім раптом розумієте, що один не заперечує другому: дзвін може і скликати, і відганяти. Залежить від того, хто слухає.',
        next: null,
      },
    },
    onEnd: [...supperEnd, { mystery: 'mys_06', level: 2 }],
  },
  {
    id: S.supSong,
    title: 'Пісня',
    pool: 'supper',
    priority: 3,
    visible: { all: [{ day: 3 }, done(S.sup2)] },
    start: 'n1',
    nodes: {
      n1: {
        text: 'Тиша за вікном така густа, що хочеться розбити її бодай чимось.',
        next: 'n2',
      },
      n2: {
        type: 'choice',
        mode: 'each',
        text: 'Що ти зробиш?',
        options: [
          { id: 'sing', label: 'Заспівати пісню з півдня', effects: [{ pset: 'bg_sang' }] },
          { id: 'tale', label: 'Розповісти байку з дитинства', effects: [{ pset: 'bg_tale' }] },
          { id: 'listen', label: 'Мовчки слухати', effects: [{ pset: 'bg_listen' }] },
        ],
        next: 'n3',
      },
      n3: {
        text: [
          [
            { if: { all: [{ pflag: 'bg_listen' }, { partnerPflag: 'bg_listen' }] }, text: 'Ви обоє мовчите, чекаючи, що заговорить інший. Так і сидите до ночі, слухаючи, як потріскує піч. Навіть мовчати вдвох — уже не так страшно.' },
            { text: 'Голос звучить хрипко й чужо в порожньому селі. Але слова знайомі, і з кожним наступним хата здається трохи меншою, а ніч за вікном — трохи далі.' },
          ],
          { if: { flag: 'sirko' }, text: 'Сірко підводить голову й слухає, наставивши вуха.' },
        ],
        next: null,
      },
    },
    onEnd: supperEnd,
  },

  // Quiet suppers when nothing else is due.
  {
    id: S.supA,
    title: 'Вечеря',
    pool: 'supper',
    once: false,
    start: 'n1',
    nodes: {
      n1: {
        text: [
          { if: { all: [{ flag: 'a1_done' }, { flag: 'a1_panas_stays' }] }, text: 'Ви вечеряєте вчотирьох: ви двоє, дід Панас і Остап на печі, що ковтає юшку з дідової ложки й дивиться крізь вас. Мелодія в нього в горлі не стихає.' },
          { if: { flag: 'a1_done' }, text: 'Ви вечеряєте втрьох: ви двоє й Остап на печі, що ковтає юшку з ложки й дивиться крізь вас. Мелодія в нього в горлі не стихає.' },
          { if: { flag: 'sirko' }, text: 'Ви вечеряєте мовчки. Тріщать дрова, Сірко сопе біля печі. За вікном — та сама синя тиша.' },
          { text: 'Ви вечеряєте мовчки. Тріщать дрова. За вікном — та сама синя тиша.' },
        ],
        next: null,
      },
    },
    onEnd: supperEnd,
  },
  {
    id: S.supB,
    title: 'Вечеря',
    pool: 'supper',
    once: false,
    start: 'n1',
    nodes: {
      n1: {
        text: 'Сьогодні ви говорите про дрібниці: про тупу сокиру, про зайця, що вислизнув із петлі, про те, де Ганна тримала сіль. Дрібниці гріють.',
        next: null,
      },
    },
    onEnd: supperEnd,
  },
  {
    id: S.supC,
    title: 'Вечеря',
    pool: 'supper',
    once: false,
    start: 'n1',
    nodes: {
      n1: {
        text: 'Вітер шарудить соломою на даху. Обоє на мить завмираєте — і обоє вдаєте, що не завмирали.',
        next: null,
      },
    },
    onEnd: supperEnd,
  },
];
