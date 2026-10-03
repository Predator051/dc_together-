# Как запустить игру на своём сервере

Нужен VPS с Linux (Ubuntu или Debian), хватит 1 ГБ памяти. На сервере должен быть открыт порт 80, а для варианта с доменом ещё и 443.

## 1. Установить Docker (один раз)

```bash
curl -fsSL https://get.docker.com | sh
```

## 2. Скопировать игру на сервер

На своём компьютере, из папки проекта (вместо `root@1.2.3.4` подставьте пользователя и IP сервера):

```bash
rsync -av --exclude node_modules --exclude dist --exclude client/dist --exclude deploy/data ./ root@1.2.3.4:~/bezgomin/
```

Если проект лежит в своём git-репозитории, вместо этого можно сделать `git clone` на сервере.

## 3. Первый запуск

На сервере:

```bash
cd ~/bezgomin/deploy && cp .env.example .env && nano .env
```

В файле `.env` впишите свой код приглашения, например `INVITE_CODE=VOVK-2025`. Сохраните (Ctrl+O, Enter, Ctrl+X) и запустите:

```bash
docker compose up -d --build
```

Через минуту игра откроется по адресу `http://IP-сервера/`.

Если код в `.env` не указан, сервер придумает его сам. Посмотреть код:

```bash
docker compose logs game | grep "Invite code"
```

### Вариант со своим доменом и HTTPS

1. У регистратора домена создайте A-запись, указывающую на IP сервера (например, `game.example.com`).
2. В `deploy/.env` напишите `SITE_ADDRESS=game.example.com`.
3. Запустите ту же команду `docker compose up -d --build`. Сертификат HTTPS выпустится автоматически, игра будет по адресу `https://game.example.com`.

## 4. Вход в игру

Оба игрока открывают адрес игры (с телефона или компьютера), вводят код приглашения и создают персонажей. Посторонний без кода не войдёт.

Чтобы зайти тем же персонажем с другого устройства, введите тот же код и нажмите «Я — …» со своим именем.

## 5. Обновление после нового акта

Скопируйте новую версию на сервер (шаг 2), затем на сервере:

```bash
cd ~/bezgomin/deploy && docker compose exec game node dist/backup.js && docker compose up -d --build
```

Первая часть команды делает резервную копию мира, вторая пересобирает и перезапускает игру. Ваш мир хранится в `deploy/data` и переживает обновления: вы продолжите с того места, где остановились.

## 6. Резервная копия мира

Сделать копию вручную:

```bash
cd ~/bezgomin/deploy && docker compose exec game node dist/backup.js
```

Копии лежат в `~/bezgomin/deploy/data/backups/`. Кроме того, сервер сам сохраняет копию при каждом запуске (хранятся последние 10).

Забрать копии себе на компьютер:

```bash
scp 'root@1.2.3.4:~/bezgomin/deploy/data/backups/*.db' .
```

Восстановить мир из копии (подставьте имя нужного файла):

```bash
cd ~/bezgomin/deploy && docker compose stop game && cp data/backups/ИМЯ-ФАЙЛА.db data/world.db && rm -f data/world.db-wal data/world.db-shm && docker compose start game
```

## Полезное

- Логи: `docker compose logs -f game`
- Перезапуск: `docker compose restart`
- Остановить: `docker compose down` (мир при этом сохраняется)
