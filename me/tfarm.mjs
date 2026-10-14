// Фарм перестал быть дорогой к деньгам. Игрок набил 51 000 монет, сидя на одной
// теме: куст отрастает каждые 15–20 минут и плодоносит вечно. Проверяем два
// тормоза — тема выдыхается, огород устаёт за день — и что продвижение вперёд
// при этом не сломано.
import { WebSocket } from 'ws';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const nf=n=>Math.abs(n)>=1e6?(n/1e6).toFixed(1)+' млн':Math.abs(n)>=1e3?(n/1e3).toFixed(1)+' тыс':String(Math.round(n));
const PORT=8761;
const DIR=fs.mkdtempSync(path.join(os.tmpdir(),'farm-'));
const srv=spawn('node',['server.js'],{ env:{...process.env, PORT:String(PORT), DATA_DIR:DIR},
                                       stdio:['ignore','pipe','pipe'] });
let log=''; srv.stdout.on('data',d=>log+=d); srv.stderr.on('data',d=>log+=d);
await new Promise(r=>setTimeout(r,1800));

// один гость на всё время: его сад живёт в соединении, счётчики накапливаются
const ws=new WebSocket(`ws://127.0.0.1:${PORT}`);
const waiting=[];
ws.on('message',raw=>{ let m; try{ m=JSON.parse(raw); }catch(_){ return; }
  for(let i=waiting.length-1;i>=0;i--) if(waiting[i].want(m)){ waiting.splice(i,1)[0].go(m); } });
const until=(want,ms=8000)=>new Promise((res,rej)=>{
  const e={want,go:res}; waiting.push(e);
  setTimeout(()=>{ const i=waiting.indexOf(e); if(i>=0){waiting.splice(i,1); rej(new Error('нет ответа; лог:\n'+log));} },ms); });
await new Promise(r=>ws.on('open',r));
ws.send(JSON.stringify({t:'join',code:'GARDEN',name:'Фармер'}));
await until(m=>m.t==='init');

// Гость хранит сад в браузере и присылает его обратно при каждом возвращении —
// вместе со счётчиками усталости. Повторяем это поведение: иначе тест сам бы
// обнулял то, что проверяет.
let keep={soldN:{}, dayK:'', dayN:0, coins:0};
async function sell(lesson,n){
  const p=until(m=>m.t==='gardenData' && m.sold);
  ws.send(JSON.stringify({t:'garden',act:'restore',garden:{coins:keep.coins,seeds:{},beds:{},
    basket:{[lesson]:n}, open:{[lesson]:1}, openW:{}, done:{}, crops:{}, cropsW:{}, days:{},
    soldN:keep.soldN, dayK:keep.dayK, dayN:keep.dayN}}));
  await new Promise(r=>setTimeout(r,120));
  ws.send(JSON.stringify({t:'garden',act:'sell'}));
  const m=await p;
  keep={soldN:m.garden.soldN||{}, dayK:m.garden.dayK||'', dayN:m.garden.dayN|0, coins:m.garden.coins|0};
  return m.sold;
}

// ── 1. тема выдыхается ──
const first=await sell('starter-05',30);
const second=await sell('starter-05',30);
const fifth=(await sell('starter-05',30), await sell('starter-05',30), await sell('starter-05',30));
ok(first.earned>0, `первые 30 плодов темы — полная цена: ${nf(first.earned)}`);
ok(second.earned < first.earned*0.75,
   `следующие 30 — уже дешевле: ${nf(second.earned)} против ${nf(first.earned)}`);
ok(fifth.earned < first.earned*0.2,
   `к пятому заходу тема почти выдохлась: ${nf(fifth.earned)} — это ${Math.round(fifth.earned/first.earned*100)}% от первой партии`);

// ── 2. новая тема платит полностью: вперёд идти по-прежнему выгодно ──
const fresh=await sell('starter-06',30);
ok(fresh.earned>=first.earned,
   `новая тема снова платит целиком: ${nf(fresh.earned)} (выдохшаяся давала ${nf(fifth.earned)})`);

// ── 3. огород устаёт за день: сверх нормы появляется подкормка ──
keep={soldN:{}, dayK:'', dayN:0, coins:0};     // новый день, обычная сдача
const st=await sell('starter-07',60);
ok((st.fee|0)===0, `пока за день сдано немного, подкормки нет: ${st.dayN} плодов за сутки`);
const tired=await sell('starter-08',120);
ok(tired.fee>0, `перевалили за норму — огород запросил подкормку: ${nf(tired.fee)}`);
ok(tired.dayN===180, `счётчик за сутки растёт: ${tired.dayN} плодов (60 + 120)`);

// ── 4. при безостановочном фарме монеты начинают УХОДИТЬ ──
let went=null;
for(let i=0;i<6 && !went;i++){ const r=await sell('starter-09',120); if(r.coins<0) went=r; }
ok(!!went, went ? `продажа ушла в минус: огород забрал ${nf(-went.coins)} монет` : 'минуса так и не случилось');

// ── 5. но в долг ребёнка не загоняем ──
const p2=until(m=>m.t==='gardenData' && m.garden);
ws.send(JSON.stringify({t:'garden',act:'get'}));
const g=(await p2).garden;
ok((g.coins|0)>=0, `монет на счету не меньше нуля: ${g.coins}`);

// ── 6. обычное занятие тормозов не замечает ──
keep={soldN:{}, dayK:'', dayN:0, coins:0};     // новый ребёнок, обычное занятие
const lesson=await sell('a1-03',24);
ok(lesson.fee===0 && lesson.coins===lesson.earned,
   `полный проход по новой теме (24 плода) — без штрафов: ${nf(lesson.coins)}`);

try{ws.close();}catch(_){}
srv.kill(); fs.rmSync(DIR,{recursive:true,force:true});
