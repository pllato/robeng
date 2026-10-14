// Жалоба учителей: «мы наверное никогда не дойдём до Необычных, редких и
// легендарных растений». Проверяем, открывается ли следующий УРОВЕНЬ, если
// ребёнок играет обычным путём — покупает семена по словам, а не набор «вся тема».
import { WebSocket } from 'ws';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const PORT=8781;
const DIR=fs.mkdtempSync(path.join(os.tmpdir(),'gate-'));
const srv=spawn('node',['server.js'],{ env:{...process.env, PORT:String(PORT), DATA_DIR:DIR},
                                       stdio:['ignore','pipe','pipe'] });
let log=''; srv.stdout.on('data',d=>log+=d); srv.stderr.on('data',d=>log+=d);
await new Promise(r=>setTimeout(r,1800));
const ws=new WebSocket(`ws://127.0.0.1:${PORT}`);
const waiting=[];
ws.on('message',raw=>{ let m; try{ m=JSON.parse(raw); }catch(_){ return; }
  for(let i=waiting.length-1;i>=0;i--) if(waiting[i].want(m)) waiting.splice(i,1)[0].go(m); });
const until=(want,ms=9000)=>new Promise((res,rej)=>{ const e={want,go:res}; waiting.push(e);
  setTimeout(()=>{ const i=waiting.indexOf(e); if(i>=0){waiting.splice(i,1); rej(new Error('нет ответа; лог:\n'+log));} },ms); });
const send=o=>ws.send(JSON.stringify(Object.assign({t:'garden'},o)));
await new Promise(r=>ws.on('open',r));
ws.send(JSON.stringify({t:'join',code:'GARDEN',name:'Ученик'}));
await until(m=>m.t==='init');

// словари уроков читаем из тех же файлов, что и сервер
const wordsOf=id=>JSON.parse(fs.readFileSync(`public/lessons/${id}.json`,'utf8'))
  .vocabulary.map(v=>String(v.word).toLowerCase());
const DONE=['starter-01','starter-02','starter-03','starter-04','starter-05'];
const NEXT='starter-06';

// Ребёнок прошёл пять тем по словам: каждое слово собрано хотя бы раз.
// Именно так выглядит обычная игра — набор «вся тема» он не покупал ни разу.
const cropsW={}, openW={};
for(const id of DONE) for(const w of wordsOf(id)){ cropsW[`${id}#${w}`]=3; openW[`${id}#${w}`]=1; }
const last=wordsOf(NEXT).slice(-1)[0];
for(const w of wordsOf(NEXT).slice(0,-1)){ cropsW[`${NEXT}#${w}`]=3; openW[`${NEXT}#${w}`]=1; }
openW[`${NEXT}#${last}`]=1;

const p=until(m=>m.t==='gardenData'&&m.garden);
send({act:'restore', garden:{coins:50000, seeds:{}, basket:{}, open:{}, openW, cropsW, crops:{},
  done:{}, days:{}, soldN:{}, dayK:'', dayN:0, upKey:'',
  beds:{'0':{seed:`${NEXT}#${last}`, lesson:NEXT, cycle:0, wear:0, ripe:[last], readyAt:1,
             words:[{word:last}], st:{[last]:{c:0,r:1,n:1,k:1}}}}}});
const st=await p;
ok(Object.keys(st.garden.cropsW||{}).length>=40,
   `ребёнок прошёл пять тем по словам: собрано ${Object.keys(st.garden.cropsW||{}).length} разных слов`);
ok(!(st.garden.open||{})['a1-01'], 'уровень «необычное» пока закрыт — это правильно, шестая тема не дособрана');

// собираем последнее слово шестой темы — тема закончена
const pk=until(m=>m.t==='gardenData'&&m.garden);
send({act:'pick', bed:0, word:last});
const after=await pk;

const open=after.garden.open||{}, openW2=after.garden.openW||{};
const a1Theme=Object.keys(open).some(id=>id.startsWith('a1-'));
const a1Word=Object.keys(openW2).some(id=>id.startsWith('a1-'));
const a1Shop=(after.shopWords||[]).some(w=>w.level==='A1');
ok(a1Theme||a1Word, `после шести собранных тем открылся уровень A1 (темы: ${Object.keys(open).filter(x=>x.startsWith('a1-')).join(', ')||'нет'})`);
ok(a1Word, 'и первое слово новой темы доступно — иначе купить её нечем');
ok(a1Shop, `и оно видно на прилавке (${(after.shopWords||[]).filter(w=>w.level==='A1').map(w=>w.word).join(', ')||'ничего'})`);

// ── порядок на прилавке: сперва текущее, пройденное — ниже ──
const sw=after.shopWords||[];
const firstDone=sw.findIndex(w=>w.themeDone);
const lastFresh=sw.map(w=>!w.themeDone).lastIndexOf(true);
ok(firstDone===-1 || lastFresh<firstDone,
   `на прилавке сперва текущие темы, пройденные ниже (первая пройденная — ${firstDone+1}-я из ${sw.length})`);
ok(sw.some(w=>w.themeDone), 'пройденные темы помечены — ребёнок видит, что это повтор, а не шаг назад');

try{ws.close();}catch(_){}
srv.kill(); fs.rmSync(DIR,{recursive:true,force:true});
