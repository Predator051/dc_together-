import type { LocationDef } from '../../shared/src/content.js';
import { done } from '../act1/ids.js';
import { BELLS, L5, S5 } from './ids.js';

export const locations5: LocationDef[] = [
  {
    id: L5.watch,
    name: 'Нічна варта',
    desc: [
      { if: { flag: 'a5_bells', gte: BELLS }, text: 'Дзвони підтягнуто, мотузки нові, біля дзвіниці стоять люди на зміну. Ясенець гудітиме до ранку.' },
      { text: 'Гул щоночі сильнішає. Якщо цієї ночі дзвони замовкнуть, врятовані знову підуть до води. Дзвони мають гудіти до ранку.' },
    ],
    visible: done(S5.dawn),
    order: 13,
    progress: { flag: 'a5_bells', max: BELLS, label: 'Дзвіницю готово' },
  },
];
