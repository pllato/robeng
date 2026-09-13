#!/bin/bash
# Pixel English — разовая настройка арендованного сервера.
# Проверено на Debian 13 и Ubuntu 22.04/24.04.
# Запускается ОДИН РАЗ на самом сервере под root:
#   bash server-setup.sh pixel.elc-kids.kz
# После этого игра работает круглосуточно по https://pixel.elc-kids.kz

set -euo pipefail
DOMAIN="${1:-}"
APPUSER=mineenglish
APPDIR=/opt/mineenglish

say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
[ -n "$DOMAIN" ] || { echo "Укажи домен:  bash server-setup.sh pixel.elc-kids.kz"; exit 1; }
[ "$(id -u)" = "0" ] || { echo "Запусти от root:  sudo bash server-setup.sh $DOMAIN"; exit 1; }

say "1/6 Обновляю систему и ставлю Node.js"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg rsync ufw >/dev/null
NODEMAJ=0
if command -v node >/dev/null 2>&1; then NODEMAJ=$(node -v | sed 's/^v//' | cut -d. -f1); fi
if [ "${NODEMAJ:-0}" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
echo "    node $(node -v)"

say "2/6 Ставлю Caddy — он сам получит и продлит сертификат HTTPS"
if ! command -v caddy >/dev/null; then
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https >/dev/null
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -qq && apt-get install -y -qq caddy >/dev/null
fi
echo "    caddy $(caddy version | head -1)"

say "3/6 Создаю пользователя и папку игры"
id -u "$APPUSER" >/dev/null 2>&1 || useradd --system --create-home --home-dir "$APPDIR" --shell /usr/sbin/nologin "$APPUSER"
mkdir -p "$APPDIR/public" "$APPDIR/data" "$APPDIR/backups"
chown -R "$APPUSER:$APPUSER" "$APPDIR"

say "4/6 Настраиваю автозапуск (systemd)"
# пароль владельца хранится отдельным файлом с правами 600 — не в systemd-юните
if [ ! -f /etc/mineenglish.env ]; then
  PIN=$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 20)
  printf 'ADMIN_PIN=%s\nPUBLIC=1\nPORT=8642\n' "$PIN" > /etc/mineenglish.env
  chmod 600 /etc/mineenglish.env
  NEWPIN="$PIN"
fi
cat > /etc/systemd/system/mineenglish.service <<UNIT
[Unit]
Description=Pixel English
After=network.target

[Service]
Type=simple
User=$APPUSER
WorkingDirectory=$APPDIR
EnvironmentFile=/etc/mineenglish.env
ExecStart=/usr/bin/node $APPDIR/server.js
Restart=always
RestartSec=3
# ограничиваем права процесса: он не должен трогать ничего, кроме своей папки
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$APPDIR

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable mineenglish >/dev/null 2>&1

say "5/6 Настраиваю адрес $DOMAIN"
cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
	encode gzip
	reverse_proxy 127.0.0.1:8642
}
CADDY
systemctl reload caddy 2>/dev/null || systemctl restart caddy

say "6/6 Закрываю всё лишнее снаружи"
ufw allow 22/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
echo "    открыты только 22 (управление), 80 и 443 (сайт)"

say "✅ Сервер готов"
echo "   Папка игры: $APPDIR   (файлы зальёт deploy.sh с твоего Мака)"
echo "   Адрес:      https://$DOMAIN"
if [ -n "${NEWPIN:-}" ]; then
  echo ""
  echo "   ПАРОЛЬ ВЛАДЕЛЬЦА (имя admin) — запиши, больше не покажу:"
  echo "      $NEWPIN"
  echo "   Он лежит в /etc/mineenglish.env"
fi
echo ""
echo "   Теперь на своём Маке выполни:  ~/Projects/mineenglish/deploy.sh"
