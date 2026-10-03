# Движок и формат контента

Короткая шпаргалка для следующих сессий. Типы — `shared/src/content.ts`, исполнение —
`server/src/engine/index.ts`, отображение — `server/src/engine/view.ts`.

## Команды

```
npm run dev:server     # сервер с автоперезапуском (порт из PORT, по умолчанию 8080)
npm run dev:client     # Vite с прокси /ws -> :8080
npm run build          # client/dist + dist/index.js, dist/backup.js
npm test               # все тесты (vitest)
npm run validate       # валидатор контента
npm run typecheck
```

Дев-мир для ручной проверки: `DATA_DIR=... npx tsx scripts/seed-dev-world.ts done:scn_10`
(боты доигрывают до флага и сохраняют мир). Дым-тест живого сервера: `scripts/smoke-ws.ts`.

## Сущности контента

- **ResourceDef** — ресурс/предмет. `cap` + `capBonus`, `hidden` для внутренних запасов,
  `kind: 'tool'` — показывается в «Речі».
- **LocationDef** — карточка места (группа кнопок). `visible` — когда появляется.
- **ActionDef** — рутинная кнопка (только соло). `role`, `once`/`oncePerPlayer`, `visible`,
  `enabled`+`disabledHint`, `cost`, `yield` (число или `[min,max]`), `chance[]`, `rollsPer`
  (повторить броски по числу ресурса), `effects`, `cooldown` (занятость, мс), `recharge`,
  `busy` (статус для партнёра), `log` (self/other/all; массив строк = случайный выбор),
  `beats[]` (одноразовые виньетки), `gives` (текст «что даёт», если движок не может вывести
  это сам: улучшения, открытия). Подпись «что даёт» строится автоматически: точные числа,
  диапазоны, `+?` для удачи и неизвестного.
- **PoolActionDef** — совместная кнопка, запускающая сцену из пула (`supper`).
- **SceneDef** — совместная сцена. `group`+`label` — кнопка предложения. `explores` — помечает
  место исследованным. `cost` списывается при старте. `once` (по умолчанию true).
  Узлы: текст (`next`, `goto`, `button`, `incomplete`), выбор (`mode: joint|each|any`,
  `mismatch`), бой (`enc`, `win`, `lose`). У любого узла: `text` (общий), `hunter`/`maker`
  (личный, получает только эта роль), `effects`.
- **EncounterDef** — бой: враг (`hp`, `fear`, `dmg`), опции (урон, страх, защита, стоимость),
  `downOption` для упавшего, `ally`, `armor`, `maxRounds`.
- **ClueDef** (`to: both|hunter|maker`, `mystery`), **MysteryDef**, **GoalDef** (`when`,
  первая подходящая в списке — текущая цель), **NpcDef**.

## Автоматические флаги

`done:<scene>`, `count:<scene>`, `seen:<loc>` (сцена с `explores`), `built:<action>` (once),
`beat:<action>:<i>`, `<enc>:killed` / `<enc>:fled`. Личные флаги игроков — `pset`/`pflag`.

## Условия и эффекты

Условия: `flag` (с `gte`/`lt`), `noFlag`, `pflag`, `noPflag`, `partnerPflag`, `res`, `day`,
`role`, `clue` (у смотрящего), `anyClue`, `partnerJoined`, `partnerOnline`, `stove`, `rel`,
`all`/`any`/`not`.

Эффекты: `set`, `unset`, `inc`, `pset` (`who: actor|both|hunter|maker`), `add`, `take`, `clue`,
`log`, `mystery` (поднять уровень), `rel`, `meet`, `scene` (только из сцен — цепочка),
`advanceDay`, `heal`, `stove`, `actDone`, `if/then/else`.

## Тексты

- `Text` = строка или массив вариантов `{ if, text }` (первый подходящий).
- `Paras`: строка — абзац; массив только из вариантов — один абзац; иначе список абзацев,
  где объект — условный абзац, вложенный массив — группа вариантов.
- Шаблоны: `{name}`, `{partner}`, `{a|b}` (род субъекта), `{p:a|b}` (род партнёра),
  `{role}`, `{p:role}`. Имена — только в именительном падеже.
- В логах `self` — от второго лица для действующего, `other` — для партнёра
  (`{name}` = действующий), `all` — всем.

## Правила

- ID нейтральные (`scn_12`, `clue_27`), читаемые алиасы — в `content/actN/ids.ts`.
- Сцены нельзя запускать из соло-действий (валидатор ругается).
- Каждая цена ≤ максимальной вместимости, у каждого ресурса — бесконечный источник.
- Любой новый акт: валидатор без ошибок, тест языка, автопрохождение до конца акта.
