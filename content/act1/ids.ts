// Readable aliases for neutral content IDs. Only the IDs travel to the client.

export const R = {
  wood: 'res_01',
  water: 'res_02',
  food: 'res_03',
  hide: 'res_04',
  iron: 'res_05',
  fat: 'res_06',
  arrow: 'res_07',
  torch: 'res_08',
  snare: 'res_09',
  snareSet: 'res_10',
  cellar: 'res_11',
  scrap: 'res_12',
  flour: 'res_13',
  axe: 'item_01',
  bow: 'item_02',
  shoe: 'item_03',
  tongues: 'item_04',
  flute: 'item_05',
} as const;

export const L = {
  cellar: 'loc_01',
  house: 'loc_02',
  yard: 'loc_03',
  square: 'loc_04',
  smithy: 'loc_05',
  hall: 'loc_06',
  forest: 'loc_07',
  mill: 'loc_08',
  elder: 'loc_09',
  barn: 'loc_10',
  apiary: 'loc_11',
  graves: 'loc_12',
} as const;

export const S = {
  hatch: 'scn_01',
  square: 'scn_02',
  smithy: 'scn_03',
  hall: 'scn_04',
  forest: 'scn_05',
  mill: 'scn_06',
  elder: 'scn_07',
  barn: 'scn_08',
  apiary1: 'scn_09',
  apiary2: 'scn_10',
  warning: 'scn_11',
  graves: 'scn_12',
  night: 'scn_13',
  morning: 'scn_14',
  bell: 'scn_15',
  sup1: 'scn_20',
  sup2: 'scn_21',
  sup3: 'scn_22',
  sup4: 'scn_23',
  supNight: 'scn_24',
  supA: 'scn_25',
  supB: 'scn_26',
  supC: 'scn_27',
  supRetry: 'scn_29',
  supBell: 'scn_28',
  supSong: 'scn_30',
} as const;

export const A = {
  eyes: 'act_p1',
  listen: 'act_p2',
  grope: 'act_p3',
  candle: 'act_p4',
  push: 'act_p5',
  lightStove: 'act_01',
  feedStove: 'act_02',
  chest: 'act_03',
  fixBow: 'act_04',
  bench: 'act_05',
  arrows: 'act_06',
  snares: 'act_07',
  torches: 'act_08',
  feedDog: 'act_09',
  chopDull: 'act_10',
  chopSharp: 'act_11',
  snow: 'act_12',
  cellarFood: 'act_13',
  fixWell: 'act_14',
  water: 'act_15',
  yardLook: 'act_16',
  rounds: 'act_17',
  woodshed: 'act_18',
  smokehouse: 'act_19',
  fortify: 'act_20',
  scrap: 'act_21',
  scavenge: 'act_22',
  sharpen: 'act_23',
  brush: 'act_24',
  setSnare: 'act_25',
  checkSnares: 'act_26',
  hunt: 'act_27',
  flour: 'act_28',
  supper: 'pool_01',
} as const;

export const E = { wolves: 'enc_01' } as const;

export const N = {
  panas: 'npc_01',
  elder: 'npc_02',
  lida: 'npc_03',
  ostap: 'npc_06',
  hanna: 'npc_09',
  dog: 'npc_10',
} as const;

export const done = (id: string) => ({ flag: `done:${id}` });
export const notDone = (id: string) => ({ noFlag: `done:${id}` });
export const seen = (id: string) => ({ flag: `seen:${id}` });
export const built = (id: string) => ({ flag: `built:${id}` });
