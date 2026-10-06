import type { ResourceDef } from '../../shared/src/content.js';
import { R3 } from './ids.js';

export const resources3: ResourceDef[] = [
  { id: R3.plugs, name: 'Затички', cap: 8, order: 14 },
  { id: R3.wax, name: 'Віск', cap: 6, order: 15 },
  { id: R3.honey, name: 'Мед', cap: 6, order: 16 },
  { id: R3.broth, name: 'Відвар', cap: 8, order: 17 },
  { id: R3.sick, name: 'Безголосі під опікою', kind: 'people', order: 30 },
  { id: R3.idle, name: 'Вільні руки', kind: 'people', order: 31 },
  { id: R3.workWood, name: 'На дровах', kind: 'people', order: 32 },
  { id: R3.workFood, name: 'На ловах', kind: 'people', order: 33 },
  { id: R3.workWater, name: 'На воді', kind: 'people', order: 34 },
];
