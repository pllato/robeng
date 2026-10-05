// «Связь должна быть стабильной и чёткой, а если её нет — чтобы можно было быстро исправить».
// Проверяем три дыры, которые раньше оставляли ребёнка один на один с мёртвым соединением,
// и то, что состояние связи теперь видно словами и исправимо нажатием.
import { chromium, devices } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx=await b.newContext({...devices['iPhone 13'],viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const p=await ctx.newPage();
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,200)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
await p.addInitScript(()=>{
  class FakeSR{ start(){ window.__SR=this; } stop(){ if(this.onend) this.onend(); } abort(){ this.stop(); } }
  window.SpeechRecognition=FakeSR; window.webkitSpeechRecognition=FakeSR;
  const sp=window.speechSynthesis; if(sp) sp.speak=()=>{};
});
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1400);
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.waitForTimeout(2200);

const menu=()=>p.evaluate(()=>{ netMenuLine();
  return { txt:(document.getElementById('pmNet')||{}).innerHTML||'',
           fixHidden:(document.getElementById('pmNetFix')||{}).hidden }; });
const ban=()=>p.evaluate(()=>({ shown:getComputedStyle(document.getElementById('netOff')).display!=='none',
  txt:document.getElementById('netOff').textContent||'',
  now:!!document.getElementById('netNow'), reload:!!document.getElementById('netReload') }));

// ── 1. связь описана словами, а не догадками ──
await p.evaluate(()=>eval("ws.send(JSON.stringify({t:'ping',k:Date.now()}))"));
await p.waitForTimeout(900);
let m=await menu();
ok(/Связь есть/.test(m.txt), `в меню видно состояние: «${m.txt.replace(/<[^>]*>/g,'')}»`);
ok(/задержка \d+ мс/.test(m.txt), 'и задержка до сервера измерена');
ok(m.fixHidden===true, 'кнопка «Переподключиться» спрятана, пока всё хорошо');

// ── 2. телефон проснулся, сокет «открыт», но мёртвый: игра не должна верить на слово ──
await p.evaluate(()=>eval("ws.send=function(){}"));          // сокет-зомби
await p.evaluate(()=>{
  Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});
  document.dispatchEvent(new Event('visibilitychange',{bubbles:true}));
});
await p.waitForFunction(()=>eval('netLost')===true,null,{timeout:9000})
  .then(()=>ok(true,'после пробуждения игра окликнула сервер и за секунды поняла, что связи нет'))
  .catch(()=>ok(false,'мёртвый сокет после пробуждения не распознан'));
await p.waitForFunction(()=>eval('ws && ws.readyState===1 && !netLost'),null,{timeout:20000})
  .then(()=>ok(true,'и сама восстановила соединение'))
  .catch(()=>ok(false,'соединение не восстановилось'));

// ── 3. нет интернета — так и сказать, а не «нет связи с игрой» ──
await p.evaluate(()=>{
  Object.defineProperty(navigator,'onLine',{value:false,configurable:true});
  window.dispatchEvent(new Event('offline'));
});
await p.waitForTimeout(700);
let v=await ban();
ok(v.shown,'плашка показана');
ok(/Нет интернета/.test(v.txt), `и названа настоящая причина: «${v.txt.replace(/\s+/g,' ').trim().slice(0,70)}»`);
ok(/Wi-Fi/.test(v.txt), 'с понятным ребёнку и родителю советом');

// ── 4. нажатия, не доехавшие до сервера, видны и не потеряны ──
await p.evaluate(()=>eval(`sendWS({t:'garden',act:'restore',garden:{coins:50,seeds:{},
  openW:{'starter-01#apple':1},open:{'starter-01':1},beds:{},basket:{'starter-01':5},
  done:{},crops:{},cropsW:{}}})`));
await p.waitForTimeout(1200);
await p.evaluate(()=>eval("ws.send=function(){}"));
await p.evaluate(()=>eval("sendWS({t:'garden',act:'sell'})"));
await p.waitForTimeout(600);
await p.evaluate(()=>eval("netShow(true)"));
await p.waitForTimeout(600);
v=await ban();
ok(/Ждут отправки: 1/.test(v.txt), `плашка считает неотправленное: «${v.txt.replace(/\s+/g,' ').trim().slice(0,90)}»`);
ok(/не потеряет/.test(v.txt), "и обещает, что они не пропадут");

// ── 5. починить можно нажатием, не дожидаясь отсчёта ──
ok(v.now, 'на плашке есть кнопка «Попробовать сейчас»');
await p.evaluate(()=>{
  Object.defineProperty(navigator,'onLine',{value:true,configurable:true});
  window.dispatchEvent(new Event('online'));
});
await p.waitForTimeout(400);
await p.evaluate(()=>{ const btn=document.getElementById('netNow'); if(btn) btn.click(); });
await p.waitForFunction(()=>myGarden.coins>50,null,{timeout:20000})
  .then(()=>ok(true,'нажал «сейчас» — связь вернулась и продажа доехала'))
  .catch(()=>ok(false,'после нажатия продажа так и не дошла'));
ok((await p.evaluate(()=>eval('outbox.size')))===0,'исходящие пусты');

// ── 6. зависшее подключение не должно залипать навсегда ──
await p.evaluate(()=>{
  window.__RealWS=window.WebSocket;
  window.WebSocket=function(){ this.readyState=0; this.close=()=>{ this.readyState=3; if(this.onclose) this.onclose(); };
    this.send=()=>{}; };            // «подключаюсь» и никогда не открывается
  eval("if(ws){ try{ ws.close(); }catch(e){} }");
});
await p.waitForTimeout(1500);
const t0=await p.evaluate(()=>eval('netTries'));
await p.waitForFunction(n=>eval('netTries')>n, t0, {timeout:25000})
  .then(()=>ok(true,`зависшее подключение разорвано по тайм-ауту и начата новая попытка (было ${t0})`))
  .catch(()=>ok(false,'игра залипла в состоянии «подключаюсь» навсегда'));
await p.evaluate(()=>{ window.WebSocket=window.__RealWS; });
await p.waitForFunction(()=>eval('ws && ws.readyState===1'),null,{timeout:25000})
  .then(()=>ok(true,'когда сеть ожила — соединение поднялось само'))
  .catch(()=>ok(false,'после возврата сети соединение не поднялось'));
await b.close();
