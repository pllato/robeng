#!/bin/bash
# Pixel English — поднять ретранслятор голоса (TURN) на том же сервере.
#
# Зачем. Школьный и офисный Wi-Fi часто не дают двум браузерам соединиться
# напрямую. Тогда кнопка микрофона горит зелёным, а конкретного соседа не слышно
# совсем. Ретранслятор пропускает звук через сервер, и такие пары начинают
# слышать друг друга.
#
# Запускается ОДИН РАЗ на самом сервере под root, после server-setup.sh:
#   bash turn-setup.sh pixel.elc-kids.kz
#
# Секрет скрипт придумывает сам и кладёт в /etc/mineenglish.env (права 600).
# Никуда его не выводит и в переписку не отдаёт.

set -euo pipefail
DOMAIN="${1:-}"
ENVF=/etc/mineenglish.env
CONF=/etc/turnserver.conf

say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
[ -n "$DOMAIN" ] || { echo "Укажи домен игры:  bash turn-setup.sh pixel.elc-kids.kz"; exit 1; }
[ "$(id -u)" = "0" ] || { echo "Запусти от root:  sudo bash turn-setup.sh $DOMAIN"; exit 1; }
[ -f "$ENVF" ] || { echo "Нет $ENVF — сперва прогони server-setup.sh"; exit 1; }

say "1/5 Ставлю coturn"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq coturn >/dev/null
echo "    $(turnserver --version 2>&1 | head -1)"

say "2/5 Определяю внешний адрес сервера"
IP="$(curl -4 -fsS --max-time 10 https://api.ipify.org || true)"
if [ -z "$IP" ]; then IP="$(hostname -I | awk '{print $1}')"; fi
[ -n "$IP" ] || { echo "Не смог определить внешний IP — задай его вручную в $CONF (external-ip)"; exit 1; }
echo "    внешний адрес: $IP"

say "3/5 Придумываю секрет и записываю его в $ENVF"
if grep -q '^TURN_SECRET=' "$ENVF"; then
  echo "    секрет уже есть — оставляю прежний"
  SECRET="$(grep '^TURN_SECRET=' "$ENVF" | cut -d= -f2-)"
else
  SECRET="$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 40)"
  printf 'TURN_SECRET=%s\n' "$SECRET" >> "$ENVF"
fi
grep -q '^TURN_HOST=' "$ENVF" || printf 'TURN_HOST=%s\n' "$DOMAIN" >> "$ENVF"
grep -q '^TURN_PORT=' "$ENVF" || printf 'TURN_PORT=3478\n' >> "$ENVF"
chmod 600 "$ENVF"
echo "    готово (сам секрет на экран не выводится)"

say "4/5 Настраиваю coturn"
# Сертификат уже получил Caddy для домена игры — переиспользуем его для turns://.
CERTDIR="/var/lib/caddy/.local/share/caddy/certificates"
CRT="$(find "$CERTDIR" -name "$DOMAIN.crt" 2>/dev/null | head -1 || true)"
KEY="$(find "$CERTDIR" -name "$DOMAIN.key" 2>/dev/null | head -1 || true)"

cat > "$CONF" <<EOF
# Создан turn-setup.sh — правки руками перезапишутся при повторном запуске.
listening-port=3478
fingerprint
use-auth-secret
static-auth-secret=$SECRET
realm=$DOMAIN
external-ip=$IP
min-port=49160
max-port=49200
no-multicast-peers
no-cli
no-tlsv1
no-tlsv1_1
# Детский сервис: ретранслятор не должен быть открытым прокси во внутреннюю сеть
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
user-quota=12
total-quota=600
EOF

if [ -n "$CRT" ] && [ -n "$KEY" ]; then
  printf 'tls-listening-port=5349\ncert=%s\npkey=%s\n' "$CRT" "$KEY" >> "$CONF"
  usermod -aG caddy turnserver 2>/dev/null || true
  grep -q '^TURN_TLS_PORT=' "$ENVF" || printf 'TURN_TLS_PORT=5349\n' >> "$ENVF"
  echo "    нашёл сертификат Caddy — включил и защищённый порт 5349"
else
  echo "    сертификат Caddy не найден — работаю без TLS-порта (обычного хватает)"
fi

sed -i 's/^#*TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn 2>/dev/null || true
grep -q '^TURNSERVER_ENABLED=1' /etc/default/coturn 2>/dev/null || echo 'TURNSERVER_ENABLED=1' >> /etc/default/coturn

say "5/5 Открываю порты и запускаю"
if command -v ufw >/dev/null; then
  ufw allow 3478/udp >/dev/null; ufw allow 3478/tcp >/dev/null
  ufw allow 49160:49200/udp >/dev/null
  [ -n "$CRT" ] && ufw allow 5349/tcp >/dev/null || true
fi
systemctl enable coturn >/dev/null 2>&1 || true
systemctl restart coturn
sleep 1
systemctl restart mineenglish
sleep 1

if systemctl is-active --quiet coturn; then echo "    coturn работает"; else
  echo "    ⚠️  coturn не поднялся — посмотри:  journalctl -u coturn -n 30"; fi
if systemctl is-active --quiet mineenglish; then echo "    игра перезапущена"; else
  echo "    ⚠️  игра не поднялась — посмотри:  journalctl -u mineenglish -n 30"; fi

printf '\n\033[1mГотово.\033[0m В журнале игры должна появиться строка «TURN включён».\n'
printf 'Проверить:  journalctl -u mineenglish -n 20 | grep TURN\n\n'
