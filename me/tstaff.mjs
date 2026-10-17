// Стойка сотрудника на ресепшене: вернуть ребёнку сад. Сад цел и лежит на
// сервере — теряется только ключ. Проверяем, что ключ выдаётся ТОЛЬКО после
// PIN, что подбор PIN наказывается, и что телефоны родителей не утекают.
import { WebSocket } from 'ws';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const PIN='staff-secret-9900';
const PORT=8791;
const DIR=fs.mkdtempSync(path.join(os.tmpdir(),'staff-'));
// сад ребёнка, у которого «пропал огород»: он на месте, потерян только ключ
fs.writeFileSync(path.join(DIR,'db.json'), JSON.stringify({ users:{
  u1:{ id:'u1', role:'student', name:'Алия', token:'kluch-alii', pin:null,
       phone:'+77010000001', createdAt:Date.parse('2026-09-20'),
       garden:{ coins:12450, beds:{0:{},1:{},2:{}}, cropsW:{'starter-01#apple':3},
                days:{'2026-10-10':1,'2026-10-14':1} } },
  u2:{ id:'u2', role:'student', name:'Игрок-K3F9', token:'kluch-bezymyannogo', pin:null,
       createdAt:Date.now(), garden:{ coins:80, beds:{0:{}}, cropsW:{}, days:{'2026-10-16':1} } },
  t1:{ id:'t1', role:'teacher', name:'Алия Петровна', token:'kluch-uchitelya',
       phone:'+77010000002', status:'active' },
}, leads:[], classes:{}, seq:4 }));

function run(env){ return spawn('node',['server.js'],
  { env:{...process.env, PORT:String(PORT), DATA_DIR:DIR, ...env}, stdio:['ignore','pipe','pipe'] }); }
let log=''; const srv=run({ STAFF_PIN:PIN });
srv.stdout.on('data',d=>log+=d); srv.stderr.on('data',d=>log+=d);
await new Promise(r=>setTimeout(r,1800));

function session(){
  const ws=new WebSocket(`ws://127.0.0.1:${PORT}`); const waiting=[];
  ws.on('message',raw=>{ let m; try{ m=JSON.parse(raw); }catch(_){ return; }
    for(let i=waiting.length-1;i>=0;i--) if(waiting[i].want(m)) waiting.splice(i,1)[0].go(m); });
  const until=(want,ms=8000)=>new Promise((res,rej)=>{ const e={want,go:res}; waiting.push(e);
    setTimeout(()=>{ const i=waiting.indexOf(e); if(i>=0){waiting.splice(i,1); rej(new Error('молчит; лог:\n'+log));} },ms); });
  const send=o=>ws.send(JSON.stringify(o));
  const ready=new Promise(r=>ws.on('open',()=>{ send({t:'join',code:'LOBBY',name:'Админ'}); r(); }))
    .then(()=>until(m=>m.t==='init'));
  return { until, send, ready, close:()=>{ try{ws.close();}catch(_){} } };
}

// ── 1. без PIN ключи не выдаются ──
{
  const S=session(); await S.ready;
  const p=S.until(m=>m.t==='staffErr'||m.t==='staffList');
  S.send({t:'staffFind', q:'Алия'});
  const r=await p;
  ok(r.t==='staffErr', `без PIN поиск отвергнут: «${r.msg||''}»`);
  S.close();
}

// ── 2. неверный PIN не пускает ──
{
  const S=session(); await S.ready;
  const p=S.until(m=>m.t==='staffErr'||m.t==='staffOk');
  S.send({t:'staffAuth', pin:'не тот'});
  const r=await p;
  ok(r.t==='staffErr' && /Неверный/.test(r.msg||''), `неверный PIN отвергнут: «${r.msg||''}»`);
  ok(/неверный PIN/.test(log), 'и попытка записана в журнал сервера');
  S.close();
}

// ── 3. верный PIN открывает стойку и находит ребёнка ──
let card=null;
{
  const S=session(); await S.ready;
  const p1=S.until(m=>m.t==='staffOk'||m.t==='staffErr');
  S.send({t:'staffAuth', pin:PIN});
  ok((await p1).t==='staffOk', 'верный PIN открывает стойку');
  const p2=S.until(m=>m.t==='staffList');
  S.send({t:'staffFind', q:'Алия'});
  const r=await p2;
  card=(r.list||[])[0];
  ok(r.total===1, `нашёлся ровно один ребёнок (учителя с тем же именем в выдаче нет): ${r.total}`);
  ok(card && card.name==='Алия' && card.key==='kluch-alii', 'ключ от сада выдан');
  ok(card && card.last==='2026-10-14' && card.beds===3 && card.coins===12450,
     `приметы сада на месте: играл ${card&&card.last}, грядок ${card&&card.beds}, монет ${card&&card.coins}`);
  ok(!JSON.stringify(r).includes('7701'), 'телефонов родителей в выдаче нет');

  // ── 4. без запроса показывает тех, кто играл недавно: так находят безымянных ──
  const p3=S.until(m=>m.t==='staffList');
  S.send({t:'staffFind', q:''});
  const all=await p3;
  ok(all.total===2, `без запроса видно всех учеников: ${all.total}`);
  ok(all.list[0] && all.list[0].name==='Игрок-K3F9',
     `первым идёт тот, кто играл позже всех — так находят ребёнка без имени: ${all.list[0]&&all.list[0].name}`);
  ok(!all.list.some(x=>x.name==='Алия Петровна'), 'учителя в списке учеников нет');
  S.close();
}

// ── 5. ключ действительно открывает тот самый сад ──
{
  const S=session(); await S.ready;
  const p=S.until(m=>m.t==='authok'||m.t==='autherr');
  S.send({t:'auth', token:card.key});
  const r=await p;
  ok(r.t==='authok' && r.user && r.user.name==='Алия',
     `по ключу открывается сад того самого ребёнка: ${r.user&&r.user.name}`);
  S.close();
}

srv.kill(); await new Promise(r=>setTimeout(r,400));

// ── 6. без STAFF_PIN стойка выключена ──
{
  let log2=''; const s2=run({});
  s2.stdout.on('data',d=>log2+=d); s2.stderr.on('data',d=>log2+=d);
  await new Promise(r=>setTimeout(r,1800));
  const S=session(); await S.ready;
  const p=S.until(m=>m.t==='staffErr'||m.t==='staffOk');
  S.send({t:'staffAuth', pin:'что угодно'});
  const r=await p;
  ok(r.t==='staffErr' && /не настроена/.test(r.msg||''), `без STAFF_PIN стойка закрыта: «${r.msg||''}»`);
  ok(/стойка администратора выключена/.test(log2), 'и сервер сказал об этом при запуске');
  S.close(); s2.kill();
}
fs.rmSync(DIR,{recursive:true,force:true});
