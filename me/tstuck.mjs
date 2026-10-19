// Жалоба учителей: «дед Семён не даёт новые темы; задания в разговорном квартале
// выполняют — и там тоже ничего». Проверяем тупик и выход из него.
//
// Как получался тупик. Заказ выдаётся ровно в тот миг, когда собрано последнее
// слово темы, и только если другого заказа нет. Ребёнок, у которого в этот миг
// висел заказ по прошлой теме, оставался без продолжения насовсем: слова темы
// кончились, заказа по ней не будет, а следующая тема открывается только из него.
import { WebSocket } from 'ws';
import { spawn } from 'child_process';
import fs from 'fs'; import os from 'os'; import path from 'path';
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const PORT=8796, DIR=fs.mkdtempSync(path.join(os.tmpdir(),'stuck-'));
const srv=spawn('node',['server.js'],{ env:{...process.env, PORT:String(PORT), DATA_DIR:DIR}, stdio:['ignore','pipe','pipe'] });
let log=''; srv.stdout.on('data',d=>log+=d); srv.stderr.on('data',d=>log+=d);
await new Promise(r=>setTimeout(r,1800));
const ws=new WebSocket(`ws://127.0.0.1:${PORT}`); const waiting=[];
ws.on('message',raw=>{ let m; try{ m=JSON.parse(raw); }catch(_){ return; }
  for(let i=waiting.length-1;i>=0;i--) if(waiting[i].want(m)) waiting.splice(i,1)[0].go(m); });
const until=(want,ms=9000)=>new Promise((res,rej)=>{ const e={want,go:res}; waiting.push(e);
  setTimeout(()=>{ const i=waiting.indexOf(e); if(i>=0){waiting.splice(i,1); rej(new Error('молчит; лог:\n'+log)); } },ms); });
const send=o=>ws.send(JSON.stringify(Object.assign({t:'garden'},o)));
const act=o=>{ const p=until(m=>m.t==='gardenData'); send(o); return p; };
await new Promise(r=>ws.on('open',r));
ws.send(JSON.stringify({t:'join',code:'GARDEN',name:'Ученик'}));
await until(m=>m.t==='init');

const wordsOf=id=>JSON.parse(fs.readFileSync(`public/lessons/${id}.json`,'utf8')).vocabulary.map(v=>String(v.word).toLowerCase());
const A='starter-01', B='starter-02';
const wa=wordsOf(A), wb=wordsOf(B);
const bed=(lesson,word)=>({'0':{seed:`${lesson}#${word}`, lesson, cycle:0, wear:0, ripe:[word], readyAt:1,
  words:[{word}], st:{[word]:{c:0,r:1,n:1,k:1}}}});
const base=extra=>Object.assign({coins:900000, seeds:{}, basket:{}, open:{}, crops:{}, done:{}, days:{},
  soldN:{}, dayK:'', dayN:0, upKey:'', openW:{}, cropsW:{}, beds:{}}, extra);

async function finishOrder(){                 // сдать плоды и сказать фразы до победы
  const st=await act({act:'get'});
  const o=st.garden.order; if(!o) return null;
  await act({act:'restore', garden:Object.assign({}, st.garden, {basket:{[o.lesson]:40}})});
  await act({act:'orderGive'});
  for(let i=0;i<8;i++){
    const r=await act({act:'phrase', kind:o.kind});
    if(!r.phrase) break;
    await act({act:'phraseSaid', kind:o.kind, key:`${r.phrase.lesson}#${r.phrase.word}`, said:r.phrase.text});
  }
  return act({act:'orderTake'});
}

// ── тема A дособрана: выдан заказ ──
{
  const openW={}, cropsW={};
  for(const w of wa){ openW[`${A}#${w}`]=1; cropsW[`${A}#${w}`]=3; }
  const last=wa[wa.length-1]; delete cropsW[`${A}#${last}`];
  await act({act:'restore', garden:base({openW, cropsW, beds:bed(A,last)})});
  const r=await act({act:'pick', bed:0, word:last});
  ok(!!r.garden.order, `собрал последнее слово темы «Фрукты» — выдан заказ: ${r.garden.order&&r.garden.order.kind}`);
}

// ── пока заказ висит, ребёнок дособирает вторую тему (её открыл уровневый замок) ──
{
  const openW={}, cropsW={};
  for(const w of wa){ openW[`${A}#${w}`]=1; cropsW[`${A}#${w}`]=3; }
  for(const w of wb){ openW[`${B}#${w}`]=1; cropsW[`${B}#${w}`]=3; }
  const last=wb[wb.length-1]; delete cropsW[`${B}#${last}`];
  await act({act:'restore', garden:base({open:{[A]:1}, openW, cropsW, beds:bed(B,last)})});
  const r=await act({act:'pick', bed:0, word:last});
  ok(r.garden.order && r.garden.order.lesson===A,
     'вторая тема дособрана, но заказ всё ещё по первой — второго заказа сервер не выдаёт');
}

// ── выполняем первый заказ: вот здесь ребёнок раньше и застревал ──
{
  const done=await finishOrder();
  ok(!!done, 'первый заказ выполнен');
  const st=await act({act:'get'});
  const free=(st.shopWords||[]).filter(w=>!w.done);
  ok(free.length>0 || !!st.garden.order,
     `после заказа ребёнку есть чем заняться: семян ${free.length}, заказ ${st.garden.order?'есть':'нет'}`);
  ok(st.garden.order && st.garden.order.lesson===B,
     `продолжение выдано по второй теме: ${st.garden.order&&st.garden.order.theme}`);
}

// ── и цепочка идёт дальше: за вторым заказом открывается третья тема ──
{
  const done=await finishOrder();
  const st=await act({act:'get'});
  const free=(st.shopWords||[]).filter(w=>!w.done);
  ok(free.length>0, `после второго заказа на прилавке появились семена: ${free.map(w=>w.word).join(', ')||'нет'}`);
  ok(free.some(w=>w.lesson==='starter-03'), 'и это слова следующей темы — «Животные»');
  ok(/тупик расчищен/.test(log), 'сервер записал в журнал, что расчистил тупик');
}

// ── здоровому саду ничего не навязываем ──
{
  const openW={}, cropsW={};
  for(const w of wa) openW[`${A}#${w}`]=1;
  cropsW[`${A}#${wa[0]}`]=1;                       // собрано одно слово из темы
  await act({act:'restore', garden:base({openW, cropsW})});
  const st=await act({act:'get'});
  ok(!st.garden.order, 'у ребёнка посреди темы заказ из воздуха не появляется');
  ok((st.shopWords||[]).filter(w=>!w.done).length>0, 'и семена на прилавке у него свои');
}

ws.close(); srv.kill(); fs.rmSync(DIR,{recursive:true,force:true});
