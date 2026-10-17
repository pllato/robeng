#!/bin/bash
# Найти сад ученика и вернуть ему доступ.
#
# Запускается НА СЕРВЕРЕ:
#   bash find-garden.sh "Алия"
#
# Ищет по части имени и печатает по каждому совпадению: когда завели сад, когда
# ребёнок работал в нём в последний раз, сколько грядок и монет — и ссылку
# возврата. Ссылку отправляют родителю; открыв её, ребёнок попадает в свой сад
# с любого телефона.
#
# ВАЖНО: ссылка — это и есть ключ от сада. Кто её открыл, тот и хозяин.
# Отправляй только родителю этого ребёнка и никуда больше не пересылай.
# Телефоны родителей скрипт не показывает — они для восстановления не нужны.

set -u
Q="${1:-}"
DB="${DB:-/opt/mineenglish/data/db.json}"
DOMAIN="${DOMAIN:-pixel.elc-kids.kz}"

[ -n "$Q" ] || { echo "Укажи имя или его часть:  bash find-garden.sh \"Алия\""; exit 1; }
[ -s "$DB" ] || { echo "Не нашёл базу: $DB"; exit 1; }

DB="$DB" DOMAIN="$DOMAIN" Q="$Q" node -e '
const fs=require("fs");
const db=JSON.parse(fs.readFileSync(process.env.DB,"utf8"));
const q=process.env.Q.toLowerCase().trim();
const dom=process.env.DOMAIN;
const nf=n=>Math.round(+n||0).toLocaleString("ru");
const day=t=>t?new Date(t).toISOString().slice(0,10):"—";

const hits=Object.values(db.users||{})
  .filter(u=>u && u.role==="student" && String(u.name||"").toLowerCase().includes(q));

if(!hits.length){
  console.log(`\nНикого с именем «${process.env.Q}» в базе нет.`);
  console.log("Попробуй часть имени или другое написание. Если ребёнок играл гостем,");
  console.log("без входа в игру, его сад жил только в его телефоне — вернуть нечего.\n");
  process.exit(0);
}
if(hits.length>8){ console.log(`\nСлишком много совпадений (${hits.length}) — уточни имя.\n`); process.exit(0); }

console.log(`\nНайдено садов: ${hits.length}\n`);
for(const u of hits){
  const g=u.garden||{};
  const days=Object.keys(g.days||{}).sort();
  const beds=Object.keys(g.beds||{}).length;
  const words=Object.keys(g.cropsW||{}).length;
  console.log(`  ${u.name}`);
  console.log(`    сад заведён:      ${day(u.createdAt)}`);
  console.log(`    последний раз:    ${days.length?days[days.length-1]:"ни разу не работал"}`);
  console.log(`    дней в огороде:   ${days.length}`);
  console.log(`    грядок:           ${beds}`);
  console.log(`    слов собрано:     ${words}`);
  console.log(`    монет:            ${nf(g.coins)}`);
  console.log(`    ССЫЛКА ВОЗВРАТА:  https://${dom}/#k=${encodeURIComponent(u.token||"")}`);
  console.log("");
}
console.log("Ссылка — это ключ от сада. Отправь её только родителю этого ребёнка.");
console.log("Пусть откроет на том телефоне, где будет играть, и сразу нажмёт");
console.log("«Поделиться → На экран Домой» — тогда сад больше не потеряется.\n");
'
