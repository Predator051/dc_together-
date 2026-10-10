import type { ResourceDef } from '../../shared/src/content.js';
import { R4 } from './ids.js';

export const resources4: ResourceDef[] = [
  { id: R4.oil, name: 'Олія', cap: 8, order: 18 },
  { id: R4.lamp, name: 'Каганець', kind: 'tool', order: 64 },
  { id: R4.pick, name: 'Кайло', kind: 'tool', order: 65 },
  { id: R4.hammer, name: 'Молоток Горислави', kind: 'tool', order: 66 },
];
