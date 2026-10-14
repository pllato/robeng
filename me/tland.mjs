// Земля устаёт и содержание огорода. После нескольких кругов грядка перестаёт
// плодоносить совсем, оживить её можно только за деньги, а запас сверх нужного
// тает сам. Проверяем всё это и — отдельно — что ребёнок не окажется в тупике.
import { WebSocket } from 'ws';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const nf=n=>Math.abs(n)>=1e3?(n/1e3).toFixed(1)+' тыс':String(Math.round(n));
const PORT=8771;
const DIR=fs.mkdtempSync(path.join(os.tmpdir(),'land-'));
const srv=spawn('node',['server.js'],{ env:{...process.env, PORT:String(PORT), DATA_DIR:DIR},
                                       stdio:['ignore','pipe','pipe'] });
let log=''; srv.stdout.on('data',d=>log+=d); srv.stderr.on('data',d=>log+=d);
await new Promise(r=>setTimeout(r,1800));
// Каждая проверка — своё подключение: сад гостя живёт в соединении, а содержание
// списывается раз в сутки, поэтому сценарии нельзя смешивать в одном сеансе.
function session(){
  const ws=new WebSocket(`ws://127.0.0.1:${PORT}`);
  const waiting=[];
  ws.on('message',raw=>{ let m; try{ m=JSON.parse(raw); }catch(_){ return; }
    for(let i=waiting.length-1;i>=0;i--) if(waiting[i].want(m)) waiting.splice(i,1)[0].go(m); });
  const until=(want,ms=8000)=>new Promise((res,rej)=>{ const e={want,go:res}; waiting.push(e);
    setTimeout(()=>{ const i=waiting.indexOf(e); if(i>=0){waiting.splice(i,1); rej(new Error('нет ответа; лог:\n'+log));} },ms); });
  const send=o=>ws.send(JSON.stringify(Object.assign({t:'garden'},o)));
  const ready=new Promise(r=>ws.on('open',()=>{ ws.send(JSON.stringify({t:'join',code:'GARDEN',name:'Садовод'})); r(); }))
    .then(()=>until(m=>m.t==='init'));
  return { ws, until, send, ready, close:()=>{ try{ws.close();}catch(_){} } };
}
const bedOf=(wear)=>({'0':{seed:'starter-01', lesson:'starter-01', cycle:0, wear, ripe:[], readyAt:1,
                           words:[{word:'apple'}]}});
const garden=(coins,beds)=>({coins, seeds:{}, basket:{}, beds:beds||{}, open:{'starter-01':1},
  openW:{}, done:{}, crops:{}, cropsW:{}, days:{}, soldN:{}, dayK:'', dayN:0});

// ── 1. свежая земля плодоносит, уставшая — нет ──
{
  const S=session(); await S.ready;
  let p=S.until(m=>m.t==='gardenData'&&m.garden); S.send({act:'restore',garden:garden(100000,bedOf(0))});
  let st=await p;
  ok((st.garden.beds['0'].ripe||[]).length>0,
     `свежая грядка дала урожай: ${(st.garden.beds['0'].ripe||[]).length} плодов`);
  ok(typeof st.feedPrice==='number' && st.feedPrice>0, `цена подкормки объявлена: ${nf(st.feedPrice)}`);
  p=S.until(m=>m.t==='gardenData'&&m.garden); S.send({act:'restore',garden:garden(100000,bedOf(4))});
  st=await p;
  ok((st.garden.beds['0'].ripe||[]).length===0, 'после четырёх кругов земля встала — новых плодов нет');

  // подкормка: сравниваем ровно до и после, содержание за день уже взято выше
  const before=st.garden.coins|0, price=st.feedPrice;
  const fp=S.until(m=>m.t==='gardenData'&&m.fed); S.send({act:'feed',bed:0});
  const fed=await fp;
  ok(fed.fed.price===price, `подкормил за объявленную цену: ${nf(price)}`);
  ok((fed.garden.coins|0)===before-price, `списано ровно столько: ${nf(before)} → ${nf(fed.garden.coins)}`);
  ok((fed.garden.beds['0'].wear|0)===0, 'износ обнулён — земля снова в силе');
  S.close();
}

// ── 2. не хватает денег — подсказка, а не тупик ──
{
  const S=session(); await S.ready;
  let p=S.until(m=>m.t==='gardenData'&&m.garden); S.send({act:'restore',garden:garden(10,bedOf(4))});
  await p;
  const ep=S.until(m=>m.t==='err'); S.send({act:'feed',bed:0});
  const err=await ep;
  ok(/Выкорчуй/.test(err.msg||''), `подсказка вместо тупика: «${(err.msg||'').slice(0,70)}…»`);
  S.close();
}

// ── 3. содержание огорода: раз в день, с запаса сверх свободного ──
{
  const S=session(); await S.ready;
  const p=S.until(m=>m.t==='gardenData'&&m.garden); S.send({act:'restore',garden:garden(51000)});
  const st=await p;
  const free=st.upkeepFree|0, up=st.garden.upkeep;
  ok(!!up, 'содержание списано при первом заходе за день');
  if(up){
    ok(up.sum===Math.round((51000-free)*0.10), `списано ${nf(up.sum)} — 10% от запаса сверх ${nf(free)} свободных`);
    ok((st.garden.coins|0)===51000-up.sum, `баланс уменьшился: 51.0 тыс → ${nf(st.garden.coins)}`);
  }
  const was=st.garden.coins|0;
  const p2=S.until(m=>m.t==='gardenData'&&m.garden); S.send({act:'get'});
  ok(((await p2).garden.coins|0)===was, 'второй заход в тот же день не списывает повторно');
  S.close();
}

// ── 4. у новичка содержание не отнимает ничего ──
{
  const S=session(); await S.ready;
  const p=S.until(m=>m.t==='gardenData'&&m.garden); S.send({act:'restore',garden:garden(300)});
  const st=await p;
  ok((st.garden.coins|0)===300, `у новичка с 300 монетами не взяли ничего: ${st.garden.coins}`);
  S.close();
}

srv.kill(); fs.rmSync(DIR,{recursive:true,force:true});
