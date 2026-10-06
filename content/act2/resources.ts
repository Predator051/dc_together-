import type { ResourceDef } from '../../shared/src/content.js';
import { R2 } from './ids.js';

export const resources2: ResourceDef[] = [
  { id: R2.salt, name: 'Сіль', cap: 6, order: 11 },
  { id: R2.rope, name: 'Мотузка', cap: 6, order: 12 },
  { id: R2.jerky, name: 'Солонина', cap: 10, order: 13 },
  { id: R2.hooks, name: 'Гачки', kind: 'tool', order: 60 },
  { id: R2.hornOld, name: 'Старий ріг', kind: 'tool', order: 61 },
  { id: R2.horn, name: 'Лук\'янів ріг', kind: 'tool', order: 62 },
  { id: R2.raft, name: 'Пліт', kind: 'tool', order: 63 },
];
