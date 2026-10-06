// Engine-side interface strings (Ukrainian). Placeholders: see server/src/engine/text.ts.

export const ui: Record<string, string> = {
  someone: 'хтось',
  goal_prefix: 'Мета:',
  new_clue: 'Новий запис у щоденнику:',
  new_day: 'Ніч минула. Настав день',

  err_in_scene: 'Спершу доведіть до кінця спільну справу.',
  err_not_now: 'Зараз не вийде.',
  err_cost: 'Бракує припасів.',
  err_full: 'Більше нема куди складати.',
  err_cooldown: 'Ще не час.',
  err_busy: 'Спершу закінчи почате.',
  err_need_both: 'Потрібні обоє.',
  err_scene_paused: 'Спершу доведіть до кінця те, що почали разом.',
  err_proposal_pending: 'Спершу дайте відповідь на запрошення.',
  err_wrong_role: 'Це не для твоїх рук.',
  err_already_chosen: 'Вибір уже зроблено.',

  proposal_declined: '{partner} поки не може піти.',
  proposal_mine: 'Ти кличеш. {partner} ще не {p:відповів|відповіла}.',
  proposal_theirs: '{partner} кличе тебе:',

  only: 'Лише',
  partner_now: '{partner} зараз',
  gain_unknown: '+?',
  gain_fire: 'хв вогню',
  gain_space: 'місце',
  pick_you: 'Ти',
  pick_partner: '{partner}',
  pick_both: 'Ви обоє',

  scene_paused: '{partner} не в мережі. Розповідь зачекає, поки {p:він|вона} повернеться, — а ти поки можеш зайнятися справами.',
  wait_choice: '{partner} ще вирішує…',
  wait_read: '{partner} ще читає…',

  combat_down_self: 'Ти падаєш у сніг і не можеш звестися.',
  combat_down_other: '{name} падає в сніг і не може звестися.',

  stove_warm: 'У печі тріщить вогонь.',
  stove_low: 'Жар у печі пригасає.',
  stove_cold: 'Піч вистигла. У хаті холодно, і робота йде повільніше.',
  stove_went_cold: 'Піч згасла. Хата швидко вистигає.',
  stove_went_low: 'Вогонь у печі пригасає. Варто підкинути дров.',

  level_0: 'Невідомо',
  level_1: 'Помічено',
  level_2: 'Підозріло',
  level_3: 'Частково зрозуміло',
  level_4: 'Розкрито',
};
