// Перебор PIN должен упираться в паузу, а не подбираться за секунды.
import WebSocket from 'ws';
import { execSync } from 'child_process';
const acc = JSON.parse(execSync('node setup.mjs').toString().trim().split('\n').pop());
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const once = (ws,pred) => new Promise(res=>{ const h=d=>{const m=JSON.parse(d); if(pred(m)){ ws.off('message',h); res(m);} }; ws.on('message',h); });
const open = () => new Promise(r=>{ const w=new WebSocket('ws://localhost:8642'); w.on('open',()=>r(w)); });

// имя ученика узнаём из его токена
const w0 = await open();
w0.send(JSON.stringify({t:'auth', token:acc.studentToken}));
const me = await once(w0, m=>m.t==='authok');
const name = me.user.name;
w0.close();

const ws = await open();
let blockedAt = 0, msgs = [];
for(let i=1;i<=8;i++){
  ws.send(JSON.stringify({t:'login', name, pin:'0000'}));
  const r = await once(ws, m=>m.t==='err'||m.t==='authok');
  msgs.push(r.msg||'вошёл');
  if(/Слишком много попыток/.test(r.msg||'') && !blockedAt) blockedAt = i;
}
ok(blockedAt>0 && blockedAt<=6, `перебор упирается в паузу с ${blockedAt}-й попытки`);
ok(msgs[blockedAt-1].includes('Подожди'), 'сервер называет, сколько ждать: «'+msgs[blockedAt-1]+'»');
ok(!msgs.some(m=>m==='вошёл'), 'ни одна попытка подбора не прошла');

// верный PIN после блокировки тоже не пускает — значит окно действительно закрыто
ws.send(JSON.stringify({t:'login', name, pin:'1111'}));
const r2 = await once(ws, m=>m.t==='err'||m.t==='authok');
ok(r2.t==='err', 'даже верный PIN во время паузы не принимается: «'+(r2.msg||'')+'»');

// а вход по токену не трогаем — ребёнок не должен страдать
const ws2 = await open();
ws2.send(JSON.stringify({t:'auth', token:acc.studentToken}));
const r3 = await once(ws2, m=>m.t==='authok'||m.t==='err');
ok(r3.t==='authok', 'вход по сохранённому токену работает как прежде');
ws.close(); ws2.close();
