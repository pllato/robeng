// Боссов больше нет. Проверяем три вещи сразу:
//  1) сервер не знает боевых действий — старый клиент не сможет их вызвать;
//  2) купленная кирка возвращается монетами, и ровно один раз;
//  3) трофей станции с эффектом coin действительно прибавляет к цене плодов.
import { WebSocket } from 'ws';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const PORT=8743;
const DIR=fs.mkdtempSync(path.join(os.tmpdir(),'noboss-'));
const TOKEN='testtoken0123456789abcdef';
// сад ребёнка, который успел купить пятую кирку: 40+110+240+430+700 = 1520 монет
const TOKEN2='testtoken9876543210fedcba';
const garden=(extra)=>Object.assign({ coins:100, seeds:{}, basket:{'starter-01':10},
  beds:{}, done:{}, open:{'starter-01':1}, crops:{}, openW:{}, cropsW:{}, items:{},
  days:{}, said:{}, soldOnce:1 }, extra);
fs.writeFileSync(path.join(DIR,'db.json'), JSON.stringify({ users:{
  u1:{ id:'u1', role:'student', name:'Тестик', pin:'x', token:TOKEN, stars:0, createdAt:Date.now(),
       garden: garden({ weapon:5, bossDone:2, sinceBoss:1 }) },
  u2:{ id:'u2', role:'student', name:'Трофейка', pin:'x', token:TOKEN2, stars:0, createdAt:Date.now(),
       garden: garden({ items:{a5:1} }) },
}, leads:[], classes:{}, seq:3 }));

const srv=spawn('node',['server.js'],{ env:{...process.env, PORT:String(PORT), DATA_DIR:DIR}, stdio:['ignore','pipe','pipe'] });
let log=''; srv.stdout.on('data',d=>log+=d); srv.stderr.on('data',d=>log+=d);
await new Promise(r=>setTimeout(r,1500));

function session(steps){
  return new Promise((res,rej)=>{
    const ws=new WebSocket(`ws://127.0.0.1:${PORT}`);
    const got=[]; let i=0;
    const to=setTimeout(()=>{ try{ws.close();}catch(_){} rej(new Error('сервер молчит; лог:\n'+log)); },12000);
    const step=()=>{ if(i>=steps.length){ clearTimeout(to); try{ws.close();}catch(_){} return res(got); }
                     ws.send(JSON.stringify(steps[i].send)); };
    ws.on('open',step);
    ws.on('error',e=>{ clearTimeout(to); rej(e); });
    ws.on('message',raw=>{ let m; try{ m=JSON.parse(raw); }catch(_){ return; }
      if(i>=steps.length || m.t!==steps[i].want) return;
      got.push(m); i++; step(); });
  });
}

try{
  // первый вход: сервер обязан вернуть деньги за кирку
  let [, , g1] = await session([
    {send:{t:'auth',token:TOKEN}, want:'authok'},
    {send:{t:'join',code:'GARDEN',name:'Тестик'}, want:'init'},
    {send:{t:'garden',act:'get'}, want:'gardenData'},
  ]);
  ok(g1.garden.coins===1620, `за кирку возвращено: было 100, стало ${g1.garden.coins} (ждём 1620)`);
  ok(g1.garden.weapon===undefined, 'поле weapon из сада убрано');
  ok(g1.garden.bossDone===undefined && g1.garden.boss===undefined, 'поля боссов из сада убраны');
  ok(/возврат за кирку: Тестик — 1520 монет/.test(log), 'возврат записан в журнал сервера');

  // второй вход: второй раз возвращать нельзя
  let [, , g2] = await session([
    {send:{t:'auth',token:TOKEN}, want:'authok'},
    {send:{t:'join',code:'GARDEN',name:'Тестик'}, want:'init'},
    {send:{t:'garden',act:'get'}, want:'gardenData'},
  ]);
  ok(g2.garden.coins===1620, `повторного возврата нет: ${g2.garden.coins}`);

  // боевые действия сервер больше не понимает
  for(const act of ['bossHit','bossWord','bossMove','bossFlee','buyWeapon']){
    const [, , err] = await session([
      {send:{t:'auth',token:TOKEN}, want:'authok'},
      {send:{t:'join',code:'GARDEN',name:'Тестик'}, want:'init'},
      {send:{t:'garden',act}, want:'err'},
    ]);
    ok(/не знает действия/.test(err.msg||''), `«${act}» отвергнуто: ${err.msg}`);
  }

  // трофей «за плоды дают больше» наконец работает: a5 даёт +15%
  const sell=tok=>session([
    {send:{t:'auth',token:tok}, want:'authok'},
    {send:{t:'join',code:'GARDEN',name:'кто-то'}, want:'init'},
    {send:{t:'garden',act:'sell'}, want:'gardenData'},
  ]).then(r=>r[2].sold.coins);
  const plain=await sell(TOKEN);
  const withArt=await sell(TOKEN2);
  ok(plain>0, `без трофея за 10 плодов дали ${plain} 🪙`);
  ok(withArt===Math.round(plain*1.15),
     `с трофеем «Ледяная линза» дали ${withArt} 🪙 — это ${plain} +15%`);
}finally{
  srv.kill();
  fs.rmSync(DIR,{recursive:true,force:true});
}
