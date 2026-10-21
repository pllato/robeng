// Жалоба учителей: «у ученика не берутся плоды с грядок, хотя выходит звук что взял»,
// и на экране висит «⚠️ Урожай ещё не созрел — осталось 1 с».
//
// Так выглядит уставшая земля. Сервер после WEAR_MAX кругов новых плодов не даёт,
// а клиент про усталость не знал и рисовал плоды дальше: ребёнок жал на них,
// слышал щелчок, а сервер отказывал — да ещё и неправдой про «осталось 1 с»
// (срок-то давно прошёл, и отсчёт упирался в единицу).
import { WebSocket } from 'ws';
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs'; import os from 'os'; import path from 'path';
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const PORT=8797, DIR=fs.mkdtempSync(path.join(os.tmpdir(),'tired-'));
const LS='starter-01';
const WS_=JSON.parse(fs.readFileSync(`public/lessons/${LS}.json`,'utf8')).vocabulary.map(v=>String(v.word).toLowerCase());
const past=Date.now()-5*60*1000;
// ученик Алижан: сад на сервере, грядка прошла все круги и больше не плодоносит
fs.writeFileSync(path.join(DIR,'db.json'), JSON.stringify({users:{u1:{
  id:'u1', role:'student', name:'Алижан', token:'kluch-alizhan', pin:null, createdAt:Date.now(),
  garden:{ coins:300, seeds:{}, basket:{}, open:{}, crops:{}, done:{}, days:{}, soldN:{}, dayK:'', dayN:0, upKey:'',
    openW:{[`${LS}#${WS_[0]}`]:1}, cropsW:{[`${LS}#${WS_[0]}`]:3},
    beds:{'0':{ seed:LS, lesson:LS, cycle:4, wear:4, ripe:[], readyAt:past,
      words:[{word:WS_[0]},{word:WS_[1]}],
      st:{ [WS_[0]]:{c:4,r:past,n:0,k:1}, [WS_[1]]:{c:4,r:past,n:0,k:1} } }} } }}}));
const srv=spawn('node',['server.js'],{ env:{...process.env, PORT:String(PORT), DATA_DIR:DIR}, stdio:['ignore','pipe','pipe'] });
let log=''; srv.stdout.on('data',d=>log+=d); srv.stderr.on('data',d=>log+=d);
await new Promise(r=>setTimeout(r,1800));

const L='starter-01';
const W=JSON.parse(fs.readFileSync(`public/lessons/${L}.json`,'utf8')).vocabulary.map(v=>String(v.word).toLowerCase());
const w1=W[0], w2=W[1];
const old=Date.now()-5*60*1000;                      // срок созревания давно прошёл
const tiredBed=()=>({'0':{ seed:L, lesson:L, cycle:4, wear:4, ripe:[], readyAt:old,
  words:[{word:w1},{word:w2}],
  st:{ [w1]:{c:4,r:old,n:0,k:1}, [w2]:{c:4,r:old,n:0,k:1} } }});
const garden=extra=>Object.assign({coins:300, seeds:{}, basket:{}, open:{}, crops:{}, done:{}, days:{},
  soldN:{}, dayK:'', dayN:0, upKey:'', openW:{[`${L}#${w1}`]:1}, cropsW:{[`${L}#${w1}`]:3}, beds:tiredBed()}, extra);

// ── сервер: что он отвечает на попытку сорвать плод с уставшей грядки ──
{
  const ws=new WebSocket(`ws://127.0.0.1:${PORT}`); const waiting=[];
  ws.on('message',raw=>{ let m; try{ m=JSON.parse(raw); }catch(_){ return; }
    for(let i=waiting.length-1;i>=0;i--) if(waiting[i].want(m)) waiting.splice(i,1)[0].go(m); });
  const until=(want,ms=9000)=>new Promise((res,rej)=>{ const e={want,go:res}; waiting.push(e);
    setTimeout(()=>{ const i=waiting.indexOf(e); if(i>=0){waiting.splice(i,1); rej(new Error('молчит; лог:\n'+log));} },ms); });
  const send=o=>ws.send(JSON.stringify(Object.assign({t:'garden'},o)));
  await new Promise(r=>ws.on('open',r));
  ws.send(JSON.stringify({t:'join',code:'GARDEN',name:'Алижан'}));
  await until(m=>m.t==='init');
  const p1=until(m=>m.t==='gardenData'); send({act:'restore', garden:garden()}); const st=await p1;
  ok((st.garden.beds['0'].wear|0)>=4, `грядка уставшая: кругов ${st.garden.beds['0'].wear}`);

  const p2=until(m=>m.t==='err'||m.t==='gardenData'&&m.harvested);
  send({act:'pick', bed:0, word:w1});
  const r=await p2;
  const msg=String(r.msg||'');
  ok(r.t==='err', `сорвать не вышло — это правильно, земля уставшая: «${msg}»`);
  ok(!/осталось 1 с/.test(msg), 'и сервер не врёт про «осталось 1 с»');
  ok(/устал/i.test(msg), 'в отказе названа настоящая причина — усталость земли');
  ok(/подкорм/i.test(msg) || /выкорч/i.test(msg), 'и сказано, что делать: подкормить или выкорчевать');

  // после подкормки грядка снова живая
  const p3=until(m=>m.t==='gardenData'||m.t==='err'); send({act:'feed', bed:0}); await p3;
  const p4=until(m=>m.t==='gardenData'); send({act:'get'}); const fed=await p4;
  ok((fed.garden.beds['0'].wear|0)===0, 'подкормка снимает усталость');
  ws.close();
}

// ── клиент: рисует ли он плоды на уставшей грядке ──
// Входим настоящим учеником по ссылке возврата: у гостя сад живёт в браузере,
// а нам нужен сад, который лежит на сервере — как у Алижана.
{
  const b=await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--use-gl=swiftshader','--no-sandbox'] });
  const p=await b.newPage();
  p.on('pageerror',e=>console.log('PAGEERROR',e.message));
  await p.goto(`http://localhost:${PORT}/#k=kluch-alizhan`,{waitUntil:'load'});
  await p.waitForTimeout(1800);
  await p.evaluate(()=>{ const x=document.getElementById('spGo'); if(x&&x.offsetParent) x.click(); });
  await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
  await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
  await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
  await p.waitForTimeout(2200);

  const bed=await p.evaluate(()=>eval('myGarden.beds["0"]'));
  ok(bed && (bed.wear|0)>=4, `в браузере грядка тоже уставшая: кругов ${bed&&bed.wear}`);
  const tired=await p.evaluate(()=>eval('bedTired(myGarden.beds["0"])'));
  ok(tired===true, 'клиент знает, что земля устала');
  const ripe=await p.evaluate(()=>eval('ripeWords(myGarden.beds["0"])').length);
  ok(ripe===0, `на уставшей грядке плоды не рисуются: показано ${ripe}`);
  const hint=await p.evaluate(()=>eval('bedHintText(myGarden.beds["0"])'));
  ok(/устал/i.test(String(hint||'')), `подсказка у грядки говорит правду: «${hint}»`);
  await b.close();
}

srv.kill(); fs.rmSync(DIR,{recursive:true,force:true});
