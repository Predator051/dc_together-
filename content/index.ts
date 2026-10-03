import type { Content } from '../shared/src/content.js';
import { actions, pools } from './act1/actions.js';
import { encounters } from './act1/combat.js';
import { clues, goals, mysteries, npcs } from './act1/journal.js';
import { locations } from './act1/places.js';
import { resources, startResources } from './act1/resources.js';
import { nightScenes } from './act1/scenes/night.js';
import { panasScenes } from './act1/scenes/panas.js';
import { supperScenes } from './act1/scenes/supper.js';
import { villageScenes } from './act1/scenes/village.js';
import { ui } from './ui.js';

export const content: Content = {
  resources,
  actions,
  pools,
  locations,
  scenes: [...villageScenes, ...panasScenes, ...nightScenes, ...supperScenes],
  encounters,
  clues,
  mysteries,
  goals,
  npcs,
  stove: { perWood: 4 * 60 * 1000, maxWood: 6, coldPenalty: 1.5, low: 3 * 60 * 1000 },
  start: { resources: startResources, hp: 10 },
  storyFlags: ['done:', 'seen:', 'a1_', 'bell_fixed', 'night_warned', 'panas_ready', 'panas_gift'],
  actEnd: {
    1: 'Кінець першої дії. Дорога на схід відкриється згодом, а поки Ясенець чекає на вас: можна й далі господарювати.',
  },
  roleTitles: {
    hunter: { m: 'ловець', f: 'ловчиня' },
    maker: { m: 'майстер', f: 'майстриня' },
  },
  ui,
};
