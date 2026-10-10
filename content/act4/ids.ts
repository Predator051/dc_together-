// Readable aliases for act 4 content IDs.

export const R4 = {
  oil: 'res_40',
  lamp: 'item_40',
  pick: 'item_41',
  hammer: 'item_42',
} as const;

export const L4 = {
  passage: 'loc_40',
  shaft: 'loc_41',
} as const;

export const S4 = {
  council: 'scn_90',
  descent: 'scn_91',
  paths: 'scn_92',
  wall: 'scn_93',
  supPanas: 'scn_95',
  myroslava: 'scn_96',
  supDoor: 'scn_97',
  supName: 'scn_98',
} as const;

export const M4 = { tunnels: 'map_1', below: 'map_2' } as const;
export const E4 = { book: 'enc_04' } as const;
export const N4 = { tymofii: 'npc_11' } as const;

/** Counters of the shared work in the cave. */
export const RUBBLE = 6;
export const SHAFT = 8;

/** Beyond the Wall the hum is strong: earplugs, and oil for the lamp. */
export const BELOW_COST = { res_38: 2, [R4.oil]: 2 } as const;
