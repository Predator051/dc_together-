import type { LocationDef } from '../../shared/src/content.js';
import { done } from '../act1/ids.js';
import { L4, RUBBLE, S4, SHAFT } from './ids.js';

export const locations4: LocationDef[] = [
  {
    id: L4.passage,
    area: 'kruchi',
    name: 'Лук\'янів хід',
    desc: [
      { if: { flag: 'a4_door' }, text: 'Розчищений хід веде вглиб гори, аж до Стіни. Ви вже знаєте цю дорогу.' },
      { if: { flag: 'a4_rubble', gte: RUBBLE }, text: 'Хід розчищено. За проломом — темрява й тихий протяг.' },
      { text: 'Старий обвал у глибині печери. Між брилами тягне холодним повітрям. Одне кайло, одні руки — і камінь за каменем.' },
    ],
    visible: done(S4.council),
    order: 4,
    progress: { flag: 'a4_rubble', max: RUBBLE, label: 'Розчищено завалу' },
  },
  {
    id: L4.shaft,
    area: 'kruchi',
    name: 'Вітряний колодязь',
    desc: [
      {
        if: { flag: 'a4_shaft', gte: SHAFT },
        text: 'Шахту розчищено й закріплено. Згори сіється сніг і сіре світло. Тут вийдуть ті, хто не здолає довгих ходів.',
      },
      { text: 'Стара шахта Лук\'яна веде вгору, до неба. Її завалило камінням і снігом, колоди кріплення погнили.' },
    ],
    visible: { flag: 'a4_shaft_found' },
    order: 5,
    progress: { flag: 'a4_shaft', max: SHAFT, label: 'Шахту розчищено' },
  },
];
