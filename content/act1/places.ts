import type { LocationDef } from '../../shared/src/content.js';
import { L, S, done, notDone, seen } from './ids.js';

export const locations: LocationDef[] = [
  {
    id: L.cellar,
    name: 'Темрява',
    desc: [
      { if: { flag: 'candle_lit' }, text: 'Погріб: діжки, мішки, яблука в соломі. Над головою — ляда.' },
      { text: 'Нічого не видно.' },
    ],
    visible: notDone(S.hatch),
    order: 0,
    base: true,
  },
  {
    id: L.house,
    name: 'Ганнина хата',
    desc: [
      { if: { stove: 'cold' }, text: 'Хата, де ви жили з осені. Піч вистигла, на шибках наростає іній.' },
      { if: { stove: 'warm' }, text: 'Хата, де ви жили з осені. Пахне димом і теплом.' },
      { text: 'Хата, де ви жили з осені. Холодна піч, три миски на столі.' },
    ],
    visible: done(S.hatch),
    order: 1,
    base: true,
  },
  {
    id: L.yard,
    name: 'Подвір\'я',
    desc: 'Повітка, тин, погріб, колодязь. За ворітьми — порожня вулиця.',
    visible: done(S.hatch),
    order: 2,
    base: true,
  },
  {
    id: L.square,
    name: 'Майдан і дзвіниця',
    desc: [
      { if: { flag: 'bell_fixed' }, text: 'Дзвони знову мають серця. Мотузка звисає до самого снігу.' },
      { if: seen(L.square), text: 'Три дзвони без сердець. Стоптана стежка на схід.' },
      { text: 'Серце села. Звідси видно дзвіницю.' },
    ],
    visible: { flag: 'built:act_01' },
    order: 10,
  },
  {
    id: L.smithy,
    name: 'Кузня',
    desc: [
      { if: seen(L.smithy), text: 'Холодне горно, ковадло в інеї, купа лому під стіною.' },
      { text: 'Кузня коваля Мирона, край майдану.' },
    ],
    visible: { flag: 'built:act_01' },
    order: 11,
  },
  {
    id: L.hall,
    name: 'Громадська хата',
    desc: [
      { if: seen(L.hall), text: 'Підметена підлога, порожня полиця, дошка з оголошеннями.' },
      { text: 'Тут староста збирав людей на раду.' },
    ],
    visible: { flag: 'built:act_01' },
    order: 12,
  },
  {
    id: L.forest,
    name: 'Узлісся',
    desc: [
      { if: seen(L.forest), text: 'Край соснового бору. Заячі стежки, сухе гілля, сліди на схід.' },
      { text: 'Туди, на схід, ведуть сліди.' },
    ],
    visible: { flag: 'built:act_01' },
    order: 13,
  },
  {
    id: L.mill,
    name: 'Млин',
    desc: [
      { if: seen(L.mill), text: 'Колесо вмерзло в лід. У коморі — мішки з борошном.' },
      { text: 'Водяний млин на потічку за селом.' },
    ],
    visible: { flag: 'built:act_01' },
    order: 14,
  },
  {
    id: L.elder,
    name: 'Хата старости',
    desc: [
      { if: seen(L.elder), text: 'Найзаможніша хата в селі. Дитяче ліжко за запоною.' },
      { text: 'Під бляхою, з різьбленими лиштвами. Єдина замкнена хата в селі.' },
    ],
    visible: { all: [seen(L.square), seen(L.hall)] },
    order: 15,
  },
  {
    id: L.barn,
    name: 'Клуня старости',
    desc: 'Висока клуня з воротами на дві стулки.',
    visible: seen(L.elder),
    order: 16,
  },
  {
    id: L.apiary,
    name: 'Пасіка',
    desc: [
      { if: done(S.apiary2), text: 'Вулики під снігом, низька хатинка, дим із комина. Тут живе дід Панас.' },
      { text: 'За селом, під лісом. Над деревами в\'ється дим.' },
    ],
    visible: seen(L.forest),
    order: 17,
  },
  {
    id: L.graves,
    name: 'Цвинтар',
    desc: 'Пагорб за селом, старі ясени, камені під снігом.',
    visible: { all: [seen(L.square), seen(L.forest)] },
    order: 18,
  },
];
