import type { LocationDef } from '../../shared/src/content.js';
import { done, seen } from '../act1/ids.js';
import { AREA, L2, S2 } from './ids.js';

export const locations2: LocationDef[] = [
  {
    id: L2.tower,
    area: AREA.tower,
    name: 'Стара Сторожа',
    desc: [
      { if: { flag: 'built:act_44' }, text: 'Кам\'яна вежа над Глушею. Дах залатано, у горниці тепло від вогнища.' },
      { if: { flag: 'built:act_42' }, text: 'Кам\'яна вежа над Глушею. Унизу горить вогнище, нагорі гуляє вітер.' },
      { text: 'Кам\'яна вежа над Глушею, без даху, з чорними бійницями.' },
    ],
    visible: done(S2.road),
    order: 0,
    base: true,
  },
  {
    id: L2.river,
    area: AREA.tower,
    name: 'Берег Глуші',
    desc: [
      { if: seen(L2.river), text: 'Бистра темна вода, вербова заводь, рештки старої кам\'яної пристані.' },
      { text: 'Під вежею шумить ріка.' },
    ],
    visible: done(S2.tower),
    order: 1,
  },
  {
    id: L2.forest,
    area: AREA.tower,
    name: 'Чорний бір',
    desc: [
      { if: seen(L2.forest), text: 'Старий бір на березі: повалені велетні, лосині стежки, зарубки на корі.' },
      { text: 'За вежею починається старий бір.' },
    ],
    visible: done(S2.tower),
    order: 2,
  },
  {
    id: L2.ferry,
    area: AREA.tower,
    name: 'Перевіз',
    desc: [
      { if: seen(L2.ferry), text: 'Хутір за частоколом, сіті на жердинах, пором із різьбленою рибою на носі.' },
      { text: 'Нижче за течією — хутір і пором. Над комином дим.' },
    ],
    visible: seen(L2.river),
    order: 3,
  },
];
