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
import { actions2, pools2 } from './act2/actions.js';
import { encounters2 } from './act2/combat.js';
import { clues2, goals2, mysteries2, npcs2 } from './act2/journal.js';
import { locations2 } from './act2/places.js';
import { resources2 } from './act2/resources.js';
import { ferryScenes } from './act2/scenes/ferry.js';
import { roadScenes } from './act2/scenes/road.js';
import { supperScenes2 } from './act2/scenes/supper.js';
import { ui } from './ui.js';

export const content: Content = {
  areas: [
    { id: 'yas', name: 'Ясенець', where: 'у Ясенці' },
    { id: 'tower', name: 'Стара Сторожа', where: 'біля Старої Сторожі' },
  ],
  resources: [...resources, ...resources2],
  actions: [...actions, ...actions2],
  pools: [...pools, ...pools2],
  locations: [...locations, ...locations2],
  scenes: [...villageScenes, ...panasScenes, ...nightScenes, ...supperScenes, ...roadScenes, ...ferryScenes, ...supperScenes2],
  encounters: [...encounters, ...encounters2],
  clues: [...clues, ...clues2],
  mysteries: [...mysteries, ...mysteries2],
  // Later acts first: the first goal whose condition holds is shown.
  goals: [...goals2, ...goals],
  npcs: [...npcs, ...npcs2],
  stove: { perWood: 4 * 60 * 1000, maxWood: 6, coldPenalty: 1.5, low: 3 * 60 * 1000 },
  start: { resources: startResources, hp: 10 },
  storyFlags: ['done:', 'seen:', 'a1_', 'a2_done', 'a2_ferry_ok', 'a2_talk_', 'bell_fixed', 'night_warned', 'panas_ready', 'panas_gift'],
  actEnd: {
    1: 'Кінець першої дії. Дорога на схід відкриється згодом, а поки Ясенець чекає на вас: можна й далі господарювати.',
    2: 'Кінець другої дії. Що далі — відкриється згодом. А поки Сторожа й Ясенець чекають на вас: можна господарювати й ходити між ними.',
  },
  roleTitles: {
    hunter: { m: 'ловець', f: 'ловчиня' },
    maker: { m: 'майстер', f: 'майстриня' },
  },
  ui,
};
