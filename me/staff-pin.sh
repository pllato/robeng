#!/bin/bash
# Pixel English — PIN сотрудника для стойки «ВЕРНУТЬ САД» на ресепшене.
#
# Зачем. В лобби слева стоит стойка, где сотрудник находит сад ребёнка и копирует
# ссылку возврата. Ссылка — это ключ от сада, поэтому стойка открывается только по
# PIN. PIN живёт на сервере, в игру и в браузер не попадает.
#
# Запускается на самом сервере под root, после server-setup.sh:
#   bash staff-pin.sh              # завести PIN (придумает сам и покажет один раз)
#   bash staff-pin.sh новый        # сменить PIN (старый перестанет работать)
#   bash staff-pin.sh 1212         # поставить свой (минимум 4 знака)
#
# Короткий PIN вроде 1212 школа диктует вслух, и это нормально для стойки у
# ресепшена — но вводить его при детях не нужно: по ссылке из стойки открывается
# чужой сад. Если PIN короче восьми знаков, сервер даёт только три попытки подряд.
#
# PIN печатается ТОЛЬКО здесь, в окне сервера. Запиши его и выдай сотрудникам
# лично. Не отправляй его в чаты, в переписку с разработчиком и в общие группы.

set -euo pipefail
ENVF=/etc/mineenglish.env
ARG="${1:-}"

[ "$(id -u)" = "0" ] || { echo "Запусти от root:  sudo bash staff-pin.sh ${ARG}"; exit 1; }
[ -f "$ENVF" ] || { echo "Нет $ENVF — сперва прогони server-setup.sh"; exit 1; }

HAVE=""
grep -q '^STAFF_PIN=' "$ENVF" && HAVE=1

gen(){ # читаемый PIN: без похожих 0/O, 1/l/I
  local a=23456789abcdefghjkmnpqrstuvwxyz
  local s=""; local i
  for i in 1 2 3 4 5 6 7 8; do
    s+="${a:$((RANDOM % ${#a})):1}"
  done
  printf 'sad-%s' "$s"
}

case "$ARG" in
  ""|новый|new)
    if [ -n "$HAVE" ] && [ -z "$ARG" ]; then
      echo "PIN сотрудника уже задан."
      echo "Посмотреть (только здесь, на сервере):  sudo grep STAFF_PIN $ENVF"
      echo "Сменить (старый перестанет работать):   sudo bash staff-pin.sh новый"
      exit 0
    fi
    PIN="$(gen)"
    ;;
  *)
    PIN="$ARG"
    [ "${#PIN}" -ge 4 ] || { echo "Слишком короткий PIN: нужно минимум 4 знака"; exit 1; }
    ;;
esac

# строку STAFF_PIN заменяем целиком, остальные настройки не трогаем
if [ -n "$HAVE" ]; then
  sed -i '/^STAFF_PIN=/d' "$ENVF"
fi
printf 'STAFF_PIN=%s\n' "$PIN" >> "$ENVF"
chmod 600 "$ENVF"

systemctl restart mineenglish
sleep 1
if systemctl is-active --quiet mineenglish; then :; else
  echo "⚠️  игра не поднялась — посмотри:  journalctl -u mineenglish -n 30"; exit 1
fi

printf '\n\033[1mPIN сотрудника: %s\033[0m\n\n' "$PIN"
echo "Запиши его и выдай сотрудникам лично. В чаты не отправляй."
if [ "${#PIN}" -lt 8 ]; then
  echo "PIN короткий — вводи его так, чтобы дети не видели экран и клавиатуру."
fi
echo "Как пользоваться: войти в игру, в лобби подойти к кирпичной стойке 🛟 ВЕРНУТЬ САД"
echo "слева от входа, нажать E, ввести PIN, найти ребёнка, нажать 📋 и отправить"
echo "ссылку ТОЛЬКО родителю этого ребёнка."
printf '\nПроверить, что стойка включена:  journalctl -u mineenglish -n 30 | grep стойка\n\n'
