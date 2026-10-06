// Readable aliases for act 3 content IDs.

export const R3 = {
  sick: 'res_30',
  idle: 'res_31',
  workWood: 'res_32',
  workFood: 'res_33',
  workWater: 'res_34',
  broth: 'res_35',
  honey: 'res_36',
  wax: 'res_37',
  plugs: 'res_38',
} as const;

export const L3 = {
  camp: 'loc_30',
  shore: 'loc_31',
  halls: 'loc_32',
  commune: 'loc_25',
} as const;

export const S3 = {
  crossing: 'scn_60',
  camp: 'scn_61',
  cells: 'scn_62',
  beds: 'scn_63',
  scriptorium: 'scn_64',
  refectory: 'scn_65',
  onysym: 'scn_66',
  sermon: 'scn_67',
  cell: 'scn_68',
  medicine: 'scn_69',
  hanna: 'scn_70',
  marijka: 'scn_71',
  men: 'scn_72',
  panas: 'scn_73',
  finale: 'scn_75',
  supHanna: 'scn_80',
  supMaster: 'scn_81',
  supA: 'scn_82',
  supB: 'scn_83',
} as const;

export const E3 = { grey: 'enc_03' } as const;

export const N3 = {
  master: 'npc_05',
  zoryna: 'npc_14',
  marijka: 'npc_15',
  myron: 'npc_16',
  hordii: 'npc_17',
} as const;

/** Every foray into the halls costs a pair of earplugs each and a torch. */
export const FORAY_COST = { [R3.plugs]: 2, res_08: 1 } as const;
/** Forays are impossible while the Order is on alert. */
export const CALM = { flag: 'alarm', lt: 3 } as const;
export const CALM_HINT = 'Сірі насторожі. Треба перечекати день.';
