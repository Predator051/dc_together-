import type { AmbientDef } from '../shared/src/content.js';

// Visual ambience only: weather per area, where fires burn, and a small accent per action.
export const ambient: AmbientDef = {
  areas: { yas: 'snow', tower: 'river', kruchi: 'cave' },
  overrides: [
    { when: { all: [{ noFlag: 'done:scn_01' }, { flag: 'candle_lit' }] }, kind: 'candle' },
    { when: { noFlag: 'done:scn_01' }, kind: 'cellar' },
  ],
  fires: {
    tower: { flag: 'built:act_42' },
    kruchi: { flag: 'built:act_64' },
  },
  actions: {
    // prologue
    act_p4: 'sparks',
    act_p5: 'dust',
    // fire
    act_01: 'fire',
    act_02: 'fire',
    act_42: 'fire',
    act_64: 'fire',
    // axe work
    act_10: 'chop',
    act_11: 'chop',
    act_48: 'chop',
    // water and fishing
    act_15: 'water',
    act_45: 'water',
    act_65: 'water',
    act_46: 'water',
    act_76: 'water',
    act_59: 'water',
    act_78: 'water',
    // steam
    act_12: 'steam',
    act_70: 'steam',
    // on foot
    act_16: 'walk',
    act_17: 'walk',
    act_22: 'walk',
    act_24: 'walk',
    act_25: 'walk',
    act_26: 'walk',
    act_40: 'walk',
    act_41: 'walk',
    act_50: 'walk',
    act_57: 'walk',
    act_58: 'walk',
    act_62: 'walk',
    act_63: 'walk',
    act_75: 'walk',
    // hunting
    act_27: 'arrow',
    act_49: 'arrow',
    // iron
    act_23: 'sparks',
    act_47: 'sparks',
    // small handiwork
    act_04: 'shavings',
    act_06: 'shavings',
    act_07: 'shavings',
    act_08: 'shavings',
    act_55: 'shavings',
    act_56: 'shavings',
    act_60: 'shavings',
    act_79: 'shavings',
    // building, digging, flour
    act_05: 'dust',
    act_14: 'dust',
    act_18: 'dust',
    act_19: 'dust',
    act_20: 'dust',
    act_21: 'dust',
    act_28: 'dust',
    act_43: 'dust',
    act_44: 'dust',
    act_53: 'dust',
  },
};
