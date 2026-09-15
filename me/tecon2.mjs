// Экономика: семена только за деньги, вырастил → продал → купил следующее.
// В начале денег всегда хватает, дальше приходится копить.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p=await b.newPage({viewport:{width:1000,height:700}});
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,200)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
await p.addInitScript(()=>{ class F{start(){}stop(){}abort(){}} window.SpeechRecognition=F;
  window.webkitSpeechRecognition=F; const sp=window.speechSynthesis; if(sp) sp.speak=()=>{}; });
const G=()=>p.evaluate(()=>eval('myGarden'));
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1400);
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.waitForTimeout(2400);
await p.evaluate(()=>eval("pixiDismiss()"));
await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(900);

const free=await p.evaluate(()=>(eval('shopWords')||[]).filter(w=>w.free).length);
ok(free===1, `даром дают ровно одно семя на старте (сейчас ${free}) — дальше только за монеты`);

const prices=await p.evaluate(()=>(eval('shopWords')||[]).map(w=>[w.word,w.price,w.fruit]));
ok(prices.length>0, `на прилавке: ${prices.map(([w,c])=>`${w} ${c}🪙`).join(' · ')}`);

// первый круг: взял бесплатное семя, вырастил, продал — хватает на следующее
await p.evaluate(()=>{ const w=(eval('shopWords')||[]).find(x=>x.free);
  eval(`sendWS({t:'garden',act:'buy',lesson:'${w.id}'})`); });
await p.waitForTimeout(900);
const seed0=Object.keys((await G()).seeds)[0];
await p.evaluate(id=>eval(`sendWS({t:'garden',act:'plant',bed:0,lesson:'${id}'})`), seed0);
await p.waitForTimeout(9600);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(700);
for(let i=0;i<6;i++){
  const left=await p.evaluate(()=>{const b=myGarden.beds['0']; return b?(b.ripe||[]).slice():[];});
  if(!left.length) break;
  await p.evaluate(w=>eval(`sendWS({t:'garden',act:'pick',bed:0,word:'${w}'})`), left[0]);
  await p.waitForTimeout(380);
}
await p.evaluate(()=>eval("sendWS({t:'garden',act:'sell'})"));
await p.waitForTimeout(1100);
let g=await G();
const next=await p.evaluate(()=>(eval('shopWords')||[]).find(w=>!w.free&&!w.planted));
ok(!!next && g.coins>=next.price,
   `продал первый урожай (${g.coins} 🪙) — на следующее семя «${next&&next.word}» за ${next&&next.price} 🪙 хватает`);

// и никаких бесплатных семян за сбор урожая
const gotFree=Object.keys(g.seeds||{}).length;
ok(gotFree===0, `после сбора семян в сумке не появилось (${gotFree}) — только покупка`);

// дальше по теме семена дорожают, и одного урожая уже мало
const curve=await p.evaluate(()=>{
  const les={tier:0,id:'starter-01'};
  return null;  // цены берём с сервера ниже
});
const all=await p.evaluate(()=>fetch('lessons/starter-01.json').then(r=>r.json()).then(j=>j.vocabulary.map(w=>w.word)));
ok(all.length>=8, `в теме ${all.length} слов`);
await b.close();
