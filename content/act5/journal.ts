import type { ClueDef, GoalDef } from '../../shared/src/content.js';
import { done, notDone } from '../act1/ids.js';
import { BELLS, S5 } from './ids.js';

export const clues5: ClueDef[] = [
  {
    id: 'clue_100', to: 'both', mystery: 'mys_05', title: 'Три стовпи',
    text: 'Озерну залу тримають три кам\'яні стовпи — ті самі, що на кресленні Горислави. Якщо підбити їх клинами й розпалити під ними вогонь, склепіння ляже на воду. «Якщо впаде — то разом».',
  },
  {
    id: 'clue_101', to: 'both', mystery: 'mys_05', title: 'Найдовша ніч',
    text: 'Стіну розібрано. Цієї ночі Тихі зведуть до води всіх, хто ще за Стіною. А гул буде такий, що без дзвонів підуть і ті, кого ви вже вивели.',
  },
];

export const goals5: GoalDef[] = [
  { id: 'goal_86', when: { flag: 'a5_done' }, text: 'Найдовша ніч минула.' },
  {
    id: 'goal_85',
    when: { all: [done(S5.dawn), { flag: 'a5_bells', gte: BELLS }, notDone(S5.night)] },
    text: 'Іти на найдовшу ніч. Клини, смолисті в\'язанки, затички, олія — і разом.',
  },
  {
    id: 'goal_84',
    when: { all: [done(S5.dawn), { flag: 'a5_bells', lt: BELLS }] },
    text: [
      {
        if: { all: [{ flag: 'a4_savka_known' }, { noFlag: 'a4_myroslava_coming' }] },
        text: 'Підготувати дзвони Ясенця до ночі, тесати клини й в\'язати смолисті в\'язанки. І розповісти Мирославі про хлопця з перевозу.',
      },
      { text: 'Підготувати дзвони Ясенця до ночі. Тесати клини для трьох стовпів і в\'язати смолисті в\'язанки.' },
    ],
  },
  { id: 'goal_83', when: { all: [{ flag: 'a4_done' }, notDone(S5.dawn)] }, text: 'Подивитися, що робиться в горі.' },
];
