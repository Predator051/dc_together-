import type { ResourceDef } from '../../shared/src/content.js';
import { A, R, built } from './ids.js';

export const resources: ResourceDef[] = [
  { id: R.wood, name: 'Дрова', cap: 20, capBonus: [{ if: built(A.woodshed), add: 20 }], order: 1 },
  { id: R.water, name: 'Вода', cap: 8, order: 2 },
  { id: R.food, name: 'Харчі', cap: 16, capBonus: [{ if: built(A.smokehouse), add: 14 }], order: 3 },
  { id: R.hide, name: 'Шкури', cap: 8, order: 4 },
  { id: R.iron, name: 'Залізо', cap: 12, order: 5 },
  { id: R.fat, name: 'Жир', cap: 8, order: 6 },
  { id: R.arrow, name: 'Стріли', cap: 16, order: 7 },
  { id: R.torch, name: 'Смолоскипи', cap: 8, order: 8 },
  { id: R.snare, name: 'Сильця', cap: 6, order: 9 },
  { id: R.snareSet, name: 'Сильця на стежках', cap: 6, order: 10 },

  { id: R.cellar, name: 'Запаси в погребі', hidden: true, order: 90 },
  { id: R.scrap, name: 'Лом у кузні', hidden: true, order: 91 },
  { id: R.flour, name: 'Борошно в млині', hidden: true, order: 92 },

  { id: R.axe, name: 'Сокира', kind: 'tool', order: 50 },
  { id: R.bow, name: 'Лук', kind: 'tool', order: 51 },
  { id: R.shoe, name: 'Дитячий черевичок', kind: 'tool', order: 52 },
  { id: R.tongues, name: 'Серця дзвонів', kind: 'tool', order: 53 },
  { id: R.flute, name: 'Остапова сопілка', kind: 'tool', order: 54 },
];

export const startResources: Record<string, number> = {
  [R.cellar]: 12,
  [R.scrap]: 14,
};
