// Ретранслятор голоса (TURN). Проверяем, что сервер выдаёт временные ключи,
// что они честно считаются по секрету, и что без настройки ничего не ломается.
import { WebSocket } from 'ws';
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const SECRET='test-secret-не-попадает-в-браузер';

function initOf(port, env){
  return new Promise((res,rej)=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'turn-'));
    const srv=spawn('node',['server.js'],{ env:{...process.env, PORT:String(port), DATA_DIR:dir, ...env},
                                           stdio:['ignore','pipe','pipe'] });
    let log=''; srv.stdout.on('data',d=>log+=d); srv.stderr.on('data',d=>log+=d);
    const done=(fn)=>{ try{srv.kill();}catch(_){} fs.rmSync(dir,{recursive:true,force:true}); fn(); };
    setTimeout(()=>{
      const ws=new WebSocket(`ws://127.0.0.1:${port}`);
      const to=setTimeout(()=>done(()=>rej(new Error('молчит; лог:\n'+log))),10000);
      ws.on('open',()=>ws.send(JSON.stringify({t:'join',code:'GARDEN',name:'Тестик'})));
      ws.on('error',e=>{ clearTimeout(to); done(()=>rej(e)); });
      ws.on('message',raw=>{ let m; try{ m=JSON.parse(raw); }catch(_){ return; }
        if(m.t!=='init') return;
        clearTimeout(to); try{ws.close();}catch(_){}
        done(()=>res({init:m, log}));
      });
    },1800);
  });
}

// ── 1. не настроен: всё как раньше, ничего не падает ──
const plain=await initOf(8751,{});
ok(Array.isArray(plain.init.ice), 'сервер присылает список серверов связи');
ok(plain.init.ice.length===1 && /^stun:/.test(plain.init.ice[0].urls),
   `без настройки — только публичный STUN: ${JSON.stringify(plain.init.ice[0].urls)}`);
ok(/TURN не настроен/.test(plain.log), 'и честно пишет об этом в журнал');

// ── 2. настроен: временные ключи ──
const tur=await initOf(8752,{TURN_HOST:'turn.example.kz', TURN_SECRET:SECRET, TURN_PORT:'3478'});
const ice=tur.init.ice;
const relay=ice.find(x=>JSON.stringify(x.urls).includes('turn:'));
ok(!!relay, 'в списке появился ретранслятор');
ok(JSON.stringify(relay.urls).includes('transport=udp') && JSON.stringify(relay.urls).includes('transport=tcp'),
   'доступен и по UDP, и по TCP — второй проходит там, где первый режут');
const now=Math.floor(Date.now()/1000);
const exp=+relay.username;
ok(exp>now+11*3600 && exp<now+13*3600, `ключ временный, живёт около полусуток (истекает через ${Math.round((exp-now)/3600)} ч)`);
const want=crypto.createHmac('sha1',SECRET).update(relay.username).digest('base64');
ok(relay.credential===want, 'пароль посчитан по секрету, а не выдуман');
ok(!JSON.stringify(ice).includes(SECRET), 'сам секрет в браузер не уходит');
ok(/TURN включён: turn\.example\.kz:3478/.test(tur.log), 'журнал показывает, что ретранслятор включён');

// ── 3. защищённый порт добавляется, только если задан ──
const tls=await initOf(8753,{TURN_HOST:'turn.example.kz', TURN_SECRET:SECRET, TURN_TLS_PORT:'5349'});
ok(JSON.stringify(tls.init.ice).includes('turns:'), 'с TURN_TLS_PORT появляется защищённый turns://');
ok(!JSON.stringify(tur.init.ice).includes('turns:'), 'а без него — не появляется');

// ── 4. браузер правда берёт этот список, а не держит свой ──
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'turn-'));
const srv=spawn('node',['server.js'],{ env:{...process.env, PORT:'8754', DATA_DIR:dir,
  TURN_HOST:'turn.example.kz', TURN_SECRET:SECRET, TURN_PORT:'3478'}, stdio:'ignore' });
await new Promise(r=>setTimeout(r,2000));
const b=await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
try{
  const p2=await b.newPage({viewport:{width:800,height:520}});
  await p2.goto('http://localhost:8754',{waitUntil:'load'});
  await p2.waitForTimeout(1400);
  await p2.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
  await p2.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
  await p2.waitForTimeout(800);
  const cfg=await p2.evaluate(()=>JSON.stringify(eval('RTC_CFG')));
  ok(/turn:turn\.example\.kz/.test(cfg), `игра взяла ретранслятор от сервера: ${cfg.slice(0,110)}…`);
  ok(!cfg.includes(SECRET), 'и секрета в браузере нет');
}finally{
  await b.close(); try{srv.kill();}catch(_){} fs.rmSync(dir,{recursive:true,force:true});
}
