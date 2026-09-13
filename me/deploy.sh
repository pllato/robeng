#!/bin/bash
# MineEnglish — залить игру на сервер и перезапустить её.
# Запускается на твоём Маке:  ~/Projects/mineenglish/deploy.sh
# Первый раз спросит адрес сервера и запомнит его.

set -u
PROJ="${MINEENGLISH_DIR:-$HOME/Projects/mineenglish}"
CFG="$PROJ/.deploy"
APPDIR=/opt/mineenglish

say(){ printf '%s\n' "$*"; }
fail(){ say ""; say "❌ $*"; exit 1; }

[ -f "$PROJ/server.js" ] || fail "Не нашёл игру в $PROJ"

# ---- куда заливаем ----
if [ -f "$CFG" ]; then . "$CFG"; fi
if [ -z "${SRV:-}" ]; then
  say "Первый запуск. Куда заливать игру?"
  printf 'Адрес сервера (например root@203.0.113.10): '
  read -r SRV
  [ -n "$SRV" ] || fail "адрес не введён"
  printf 'Домен игры (например pixel.elc-kids.kz): '
  read -r DOMAIN
  printf 'SRV=%s\nDOMAIN=%s\n' "$SRV" "$DOMAIN" > "$CFG"
  say ""
fi

say "1/5 Проверяю связь с сервером"
ssh -o BatchMode=yes -o ConnectTimeout=10 "$SRV" 'echo ok' >/dev/null 2>&1 \
  || fail "не подключиться к $SRV. Проверь адрес и что ключ добавлен (ssh-copy-id $SRV)"

say "2/5 Проверяю синтаксис перед отправкой"
node --check "$PROJ/server.js" || fail "в server.js ошибка — на сервер не отправляю"

say "3/5 Заливаю файлы"
rsync -az --delete \
  --exclude 'data/' --exclude 'backups/' --exclude 'node_modules/' \
  --exclude '.deploy' --exclude 'server.log' --exclude '*.png' --exclude '*.mjs' \
  "$PROJ/server.js" "$PROJ/package.json" "$SRV:$APPDIR/" 2>/dev/null \
  || rsync -az "$PROJ/server.js" "$PROJ/package.json" "$SRV:$APPDIR/" || fail "не удалось скопировать server.js"
rsync -az --delete "$PROJ/public/" "$SRV:$APPDIR/public/" || fail "не удалось скопировать public/"

say "4/5 Ставлю зависимости и переношу базу, если её там ещё нет"
ssh "$SRV" "cd $APPDIR && npm install --omit=dev --silent >/dev/null 2>&1; chown -R mineenglish:mineenglish $APPDIR" \
  || fail "npm install на сервере не прошёл"
if ! ssh "$SRV" "test -s $APPDIR/data/db.json"; then
  if [ -s "$PROJ/data/db.json" ]; then
    say "    переношу твою базу с Мака (аккаунты и сады) — только один раз"
    ssh "$SRV" "mkdir -p $APPDIR/data"
    scp -q "$PROJ/data/db.json" "$SRV:$APPDIR/data/db.json"
    ssh "$SRV" "chown mineenglish:mineenglish $APPDIR/data/db.json"
  fi
else
  say "    база на сервере уже есть — не трогаю"
fi

say "5/5 Перезапускаю игру"
ssh "$SRV" "systemctl restart mineenglish && sleep 2 && systemctl is-active mineenglish" >/dev/null \
  || { say ""; say "❌ игра не запустилась. Последние строки журнала:"; ssh "$SRV" "journalctl -u mineenglish -n 15 --no-pager"; exit 1; }

RUN=$(ssh "$SRV" "curl -s http://127.0.0.1:8642/version" 2>/dev/null)
FILE=$(sed -n "s/.*BUILD *= *'\([^']*\)'.*/\1/p" "$PROJ/server.js" | head -1)
say ""
say "✅ Готово. На сервере работает сборка: $RUN"
say "   в файле на Маке: ${FILE:-без версии}"
[ -n "${DOMAIN:-}" ] && say "   Адрес игры: https://$DOMAIN"
say ""
say "   Если версии не совпали — залей ещё раз."
