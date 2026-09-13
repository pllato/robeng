// Нагрузочный тест: N «игроков» шлют движение 8 раз в секунду, как настоящий клиент,
// часть из них сажает и собирает урожай. Меряем процессор, память и трафик сервера.
import WebSocket from 'ws';
import fs from 'fs';
const N = +(process.argv[2]||10);            // сколько игроков
const ROOMS = +(process.argv[3]||1);         // на сколько комнат разложить
const SECONDS = +(process.argv[4]||20);
const PID = +fs.readFileSync('/tmp/mepid','utf8').trim();

const cpuOf = () => { const p=fs.readFileSync(`/proc/${PID}/stat`,'utf8').split(') ').pop().split(' ');
  return (+p[11]+ +p[12])/100; };                       // utime+stime в секундах
const rssOf = () => +(/VmRSS:\s+(\d+)/.exec(fs.readFileSync(`/proc/${PID}/status`,'utf8'))[1])/1024;
const netOf = () => { const t=fs.readFileSync('/proc/net/dev','utf8').split('\n').find(l=>l.includes('lo:'));
  const f=t.trim().split(/\s+/); return {rx:+f[1], tx:+f[9]}; };

let sentMsgs=0, recvMsgs=0, recvBytes=0, opened=0, inRoom=0;
const clients=[];
for(let i=0;i<N;i++){
  const ws=new WebSocket('ws://localhost:8642');
  const room = ROOMS>1 ? 'R'+String.fromCharCode(65+(i%ROOMS))+'XX' : null;
  ws.on('open',()=>{ opened++;
    ws.send(JSON.stringify({t:'guest'}));                 // как обычный гость
    setTimeout(()=>{ ws.send(JSON.stringify({t:'switch',code:'GARDEN'})); }, 300+i*20);
  });
  ws.on('message',d=>{ recvMsgs++; recvBytes+=d.length;   // разбираем только у первого — остальные просто считают байты
    if(i===0 && d.length<4000){ try{ const m=JSON.parse(d); if(m.t==='init') inRoom=(m.players||[]).length+1; }catch(e){} } });
  ws.on('error',()=>{});
  clients.push(ws);
}
await new Promise(r=>setTimeout(r,3000));

const t0=Date.now();
const timers=clients.map((ws,i)=>setInterval(()=>{        // движение — 8.3 раза в секунду, как в игре
  if(ws.readyState!==1) return;
  const t=Date.now()/1000;
  ws.send(JSON.stringify({t:'move',x:+(64+Math.sin(t+i)*8).toFixed(2),y:27,z:+(64+Math.cos(t+i)*8).toFixed(2),
    yaw:+(t%6.28).toFixed(2),pitch:0}));
  sentMsgs++;
},120));
// каждые 2 секунды часть игроков что-то делает в саду
const act=setInterval(()=>{
  for(let i=0;i<clients.length;i+=3){
    const ws=clients[i]; if(ws.readyState!==1) continue;
    ws.send(JSON.stringify({t:'garden',act:'get'})); sentMsgs++;
  }
},2000);

await new Promise(r=>setTimeout(r,SECONDS*1000));
timers.forEach(clearInterval); clearInterval(act);
const dt=(Date.now()-t0)/1000;
console.log(`\n  игроков: ${N} · подключилось ${opened} · в одной комнате ${inRoom} · замер ${dt.toFixed(0)} с`);
console.log(`  отправлено серверу: ${sentMsgs} сообщений`);
console.log(`  получено от сервера: ${recvMsgs} сообщений, ${(recvBytes/1024/dt).toFixed(0)} КБ/с всего`);
console.log(`  на одного игрока: ${(recvBytes/1024/dt/N*8).toFixed(0)} кбит/с`);
clients.forEach(w=>{ try{w.close();}catch(e){} });
process.exit(0);
