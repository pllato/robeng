// Сбор нажатием на сам плод: держишь сколько нужно, не вышло — пишешь
import { chromium, devices } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx=await b.newContext({...devices['iPhone 13'],viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const p=await ctx.newPage();
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,180)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
await p.addInitScript(()=>{
  window.__log={said:[],starts:0,stops:0,cont:0};
  class FakeSR{ start(){ window.__log.starts++; if(this.continuous) window.__log.cont++; window.__SR=this; }
    stop(){ window.__log.stops++; if(this.onend) this.onend(); } abort(){ this.stop(); } }
  window.SpeechRecognition=FakeSR; window.webkitSpeechRecognition=FakeSR;
  const sp=window.speechSynthesis; if(sp){ sp.speak=u=>{ window.__log.said.push(u&&u.text); }; }
});
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1400);
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(2200);
await p.evaluate(()=>eval(`sendWS({t:'garden',act:'restore',garden:{coins:0,
  seeds:{'starter-01#apple':1},openW:{'starter-01#apple':1},
  beds:{},basket:{},done:{},open:{},crops:{},cropsW:{}}})`));
await p.waitForTimeout(1000);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'plant',bed:0,lesson:'starter-01#apple'})"));
await p.waitForTimeout(9600);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(800);

// нижней плашки больше нет в разметке
ok(!(await p.evaluate(()=>!!document.getElementById('askBox'))), 'нижняя плашка убрана из игры');

// встаём так, чтобы плод был перед носом
await p.evaluate(()=>{ const q=bedPos(myPlotIndex(),0), P=window.game.P;
  P.x=q.x+.5; P.z=q.z+3.5; P.yaw=0; P.pitch=0.25; });
await p.waitForTimeout(900);
const f=await p.evaluate(()=>{ const list=myRipeFruits(); if(!list.length) return null;
  const pt=project(lastMVP,list[0].x,list[0].y+list[0].s*2,list[0].z);
  return pt?{x:Math.round(pt[0]),y:Math.round(pt[1]),word:list[0].word}:null; });
ok(!!f, `плод «${f&&f.word}» виден на экране в точке ${f&&f.x},${f&&f.y}`);

// тычем пальцем прямо в плод и держим
await p.touchscreen.tap(f.x, f.y).catch(()=>{});
await p.evaluate(pt=>{ const c=document.querySelector('canvas');
  c.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,cancelable:true,
    changedTouches:[new Touch({identifier:1,target:c,clientX:pt.x,clientY:pt.y})]})); }, f);
await p.waitForTimeout(900);
let L=await p.evaluate(()=>window.__log);
ok((await p.evaluate(()=>!!holdFruit)), 'палец попал в плод — начался сбор');
ok(L.said.includes(f.word), `слово произнесено: «${f.word}»`);
ok(L.starts>=1 && L.cont>=1, 'запись пошла и она непрерывная — говорить можно сколько угодно');
const tag=await p.evaluate(()=>({on:getComputedStyle(document.getElementById('pickTag')).display,
  txt:document.getElementById('pickTag').textContent}));
ok(tag.on!=='none', `над плодом ярлык: «${tag.txt}»`);

// держим долго — запись не обрывается: после onend она перезапускается
await p.evaluate(()=>{ if(window.__SR&&window.__SR.onend) window.__SR.onend(); });
await p.waitForTimeout(700);
L=await p.evaluate(()=>window.__log);
ok(L.starts>=2, `распознавание само продолжилось (запусков ${L.starts}) — палец ещё держит`);

// отпускаем, слово не распозналось → сразу предлагаем написать
await p.evaluate(()=>{ const c=document.querySelector('canvas');
  c.dispatchEvent(new TouchEvent('touchend',{bubbles:true,cancelable:true,
    changedTouches:[new Touch({identifier:1,target:c,clientX:0,clientY:0})]})); });
await p.waitForTimeout(1400);
ok((await p.evaluate(()=>getComputedStyle(document.getElementById('pickWrite')).display))!=='none',
   'не вышло с первого раза — сразу появилась кнопка «Написать»');
ok((await p.evaluate(()=>window.__askMiss()))===1, 'промах засчитан один, а не три');

// пишем слово — плод собран (на кусте их три, значит должно остаться два)
const wasRipe=await p.evaluate(()=>ripeWords(bedAt(0)).length);
await p.evaluate(()=>document.getElementById('pickWrite').click());
await p.waitForTimeout(400);
await p.evaluate(w=>{ document.getElementById('pickInput').value=w; askSubmit(); }, f.word);
await p.waitForTimeout(1200);
const nowRipe=await p.evaluate(()=>ripeWords(bedAt(0)).length);
ok(nowRipe===wasRipe-1, `плод сорван вводом: было ${wasRipe}, осталось ${nowRipe}`);
ok((await p.evaluate(()=>getComputedStyle(document.getElementById('pickTag')).display))==='none',
   'ярлык убрался после сбора');
await b.close();
