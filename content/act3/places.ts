import type { LocationDef } from '../../shared/src/content.js';
import { done } from '../act1/ids.js';
import { L3, S3 } from './ids.js';

export const locations3: LocationDef[] = [
  {
    id: L3.camp,
    area: 'kruchi',
    name: 'Лук\'янова печера',
    desc: [
      { if: { flag: 'built:act_64' }, text: 'Суха печера над самою водою. Горить вогонь, гул тут глухий, як крізь вату.' },
      { text: 'Суха печера над самою водою. Старе вогнище, зарубки на стінах.' },
    ],
    visible: done(S3.crossing),
    order: 0,
    base: true,
  },
  {
    id: L3.shore,
    area: 'kruchi',
    name: 'Під урвищем',
    desc: 'Вузька смуга крейдяного берега під Кручами. Плавник, тиха заводь.',
    visible: done(S3.camp),
    order: 1,
  },
  {
    id: L3.halls,
    area: 'kruchi',
    name: 'Верхні зали',
    desc: [
      { if: { flag: 'alarm', gte: 3 }, text: 'Тріщина в стіні печери веде в ходи Тихих. Там зараз неспокійно: сірі насторожі.' },
      { text: 'Тріщина в стіні печери веде в ходи Тихих. Кожна вилазка — затички у вуха й смолоскип.' },
    ],
    visible: done(S3.camp),
    order: 2,
  },
  {
    id: L3.commune,
    name: 'Громада',
    desc: [
      { if: { res: 'res_30', gte: 1 }, text: 'Врятовані лежать на сінниках у громадській хаті. Дід Панас не відходить від них.' },
      { text: 'Громадська хата знову живе: хтось топить піч, хтось лагодить сіті, хтось просто сидить на ґанку.' },
    ],
    visible: { flag: 'rescued', gte: 1 },
    order: 3,
    base: true,
  },
];
