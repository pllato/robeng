// Киоск показывает всю цепочку: слова → задание на станции → следующая тема
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p=await b.newPage({viewport:{width:1000,height:760}});
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,200)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
await p.addInitScript(()=>{ class F{start(){}stop(){}abort(){}} window.SpeechRecognition=F;
  window.webkitSpeechRecognition=F; const sp=window.speechSynthesis; if(sp) sp.speak=()=>{}; });
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1400);
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.waitForTimeout(2400);
await p.evaluate(()=>eval("pixiDismiss()"));
const W=['apple','banana','orange','pear','grapes','lemon','watermelon','strawberry'];
const openW={}, cropsW={};
for(const w of W) openW['starter-01#'+w]=1;
for(const w of W.slice(0,-1)) cropsW['starter-01#'+w]=1;

// 1) тема ещё идёт — киоск заранее показывает, какая практика будет дальше
await p.evaluate(o=>eval(`sendWS({t:'garden',act:'restore',garden:{coins:60,
  seeds:{}, openW:${JSON.stringify(o.openW)}, cropsW:${JSON.stringify(o.cropsW)},
  open:{},beds:{},basket:{},done:{},crops:{}}})`), {openW,cropsW});
await p.waitForTimeout(900);
await p.evaluate(()=>openShop()); await p.waitForTimeout(1200);
const soon=await p.evaluate(()=>{const c=[...document.querySelectorAll('.seedCard.lock')]
  .find(x=>/после темы/.test(x.textContent)); return c?c.textContent.replace(/\s+/g,' ').trim():'';});
ok(/после темы/.test(soon), `пока тема идёт, видно следующую ступень: «${soon}»`);
await p.evaluate(()=>closeShop()); await p.waitForTimeout(400);

// 2) тема пройдена — в списке появляется само задание
await p.evaluate(w=>eval(`sendWS({t:'garden',act:'buy',lesson:'starter-01#${w}'})`), W[7]);
await p.waitForTimeout(800);
await p.evaluate(w=>eval(`sendWS({t:'garden',act:'plant',bed:0,lesson:'starter-01#${w}'})`), W[7]);
await p.waitForTimeout(9600);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(700);
for(let i=0;i<6;i++){
  const left=await p.evaluate(()=>{const b=myGarden.beds['0']; return b?(b.ripe||[]).slice():[];});
  if(!left.length) break;
  await p.evaluate(w=>eval(`sendWS({t:'garden',act:'pick',bed:0,word:'${w}'})`), left[0]);
  await p.waitForTimeout(380);
}
await p.waitForTimeout(900);
await p.evaluate(()=>openShop()); await p.waitForTimeout(1400);
const q=await p.evaluate(()=>{const c=document.querySelector('.seedCard.quest');
  return c?c.textContent.replace(/\s+/g,' ').trim():'';});
ok(/задание/.test(q), `в списке появилась ступень-задание: «${q}»`);
ok(/0\/2/.test(q) && /0\/4/.test(q), 'на карточке видно, сколько плодов принести и сколько фраз сказать');
ok(/🍎|🍌|🍊/.test(q), 'плоды показаны своими значками, а не заглушкой');
const order=await p.evaluate(()=>[...document.querySelectorAll('#shopGrid .seedCard')]
  .map(c=>c.classList.contains('quest')?'ЗАДАНИЕ':(c.classList.contains('lock')?'замок':'слово')));
const qi=order.indexOf('ЗАДАНИЕ'), li=order.indexOf('замок');
ok(qi>=0 && li>qi, `порядок правильный: слова → задание (№${qi+1}) → закрытые темы (№${li+1})`);
const locked=await p.evaluate(()=>{const c=document.querySelector('.seedCard.lock');
  return c?c.textContent.replace(/\s+/g,' ').trim():'';});
ok(/после задания/.test(locked), `закрытая тема объясняет причину: «${locked}»`);
const foot=await p.evaluate(()=>document.getElementById('shopFoot').textContent.replace(/\s+/g,' ').trim());
ok(/Сейчас задание/.test(foot), `внизу написано, что делать сейчас: «${foot.slice(0,90)}…»`);

// 3) по карточке можно перейти прямо к станции
const was=await p.evaluate(()=>[+window.game.P.x.toFixed(1), +window.game.P.z.toFixed(1)]);
await p.evaluate(()=>document.querySelector('.seedCard.quest').click());
await p.waitForTimeout(900);
const now=await p.evaluate(()=>[+window.game.P.x.toFixed(1), +window.game.P.z.toFixed(1)]);
const a=await p.evaluate(()=>interactables.find(x=>x.act==='phrase'&&x.kind===myGarden.order.kind));
ok(Math.hypot(now[0]-a.x, now[1]-a.z)<5, `нажал на карточку — оказался у станции (${was} → ${now})`);
await p.screenshot({path:'g-b39-kiosk.png'});
await b.close();
