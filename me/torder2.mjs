// Тупик «плоды продал, а новые не выросли» и понятные шаги заказа
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p=await b.newPage({viewport:{width:1000,height:760}});
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
const W=['apple','banana','orange','pear','grapes','lemon','watermelon','strawberry'];
const openW={}, cropsW={};
for(const w of W) openW['starter-01#'+w]=1;
for(const w of W.slice(0,-1)) cropsW['starter-01#'+w]=1;
await p.evaluate(o=>eval(`sendWS({t:'garden',act:'restore',garden:{coins:40,
  seeds:{'starter-01#${o.last}':3}, openW:${JSON.stringify(o.openW)}, cropsW:${JSON.stringify(o.cropsW)},
  open:{},beds:{},basket:{},done:{},crops:{}}})`), {openW,cropsW,last:W[7]});
await p.waitForTimeout(900);
// закрываем тему — приходит заказ
await p.evaluate(w=>eval(`sendWS({t:'garden',act:'plant',bed:0,lesson:'starter-01#${w}'})`), W[7]);
await p.waitForTimeout(9600);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(700);
const harvest=async bed=>{ for(let i=0;i<5;i++){
  const left=await p.evaluate(n=>{const b=myGarden.beds[String(n)]; return b?(b.ripe||[]).slice():[];}, bed);
  if(!left.length) break;
  await p.evaluate(o=>eval(`sendWS({t:'garden',act:'pick',bed:${o.b},word:'${o.w}'})`), {b:bed,w:left[0]});
  await p.waitForTimeout(360);
} };
await harvest(0);
await p.waitForTimeout(1000);
let g=await G();
ok(!!g.order, `заказ пришёл: ${g.order&&g.order.kind}`);
const need=Object.values(g.order.need).reduce((a,b)=>a+b,0);

// растим ещё плодов темы
for(const bed of [1,2]) await p.evaluate(o=>eval(`sendWS({t:'garden',act:'plant',bed:${o.b},lesson:'starter-01#${o.w}'})`), {b:bed,w:W[7]});
await p.waitForTimeout(9600);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(700);
await harvest(1); await harvest(2);
g=await G();
const inBasket=(g.basket['starter-01']|0);
ok(inBasket>=need, `в корзине ${inBasket} плодов темы, заказу нужно ${need}`);

// главное: тётушка Груша не забирает плоды, нужные для заказа
const before=g.coins;
await p.evaluate(()=>eval("sendWS({t:'garden',act:'sell'})"));
await p.waitForTimeout(1200);
g=await G();
ok((g.basket['starter-01']|0)===need,
   `после продажи в корзине осталось ровно ${g.basket['starter-01']|0} — столько и нужно заказу`);
ok(g.coins>before, `лишнее продалось: ${before} → ${g.coins} 🪙`);

// и заказ можно закрыть
const a=await p.evaluate(k=>interactables.find(x=>x.act==='phrase'&&x.kind===k), g.order.kind);
await p.evaluate(q=>{ const P=window.game.P; P.x=q.x; P.z=q.z; P.y=q.y; }, a);
await p.waitForTimeout(600);
await p.evaluate(()=>window.game.doInteract());
await p.waitForTimeout(1300);
for(let i=0;i<6;i++){
  const t=await p.evaluate(()=>eval('talkTask'));
  if(!t) break;
  await p.evaluate(x=>eval(`sendWS({t:'garden',act:'phraseSaid',kind:'${x.kind}',key:'${x.lesson}#${x.word}',said:${JSON.stringify(x.text)}})`), t);
  await p.waitForTimeout(650);
}
const ask=await p.evaluate(()=>document.getElementById('talkAsk').textContent);
const ru=await p.evaluate(()=>document.getElementById('talkRu').textContent);
ok(/Осталось принести плоды/.test(ask), `после фраз экран говорит: «${ask}»`);
ok(/Сдать плоды/.test(ru), `и подсказывает, что делать: «${ru}»`);
await p.evaluate(()=>document.getElementById('talkGive').click());
await p.waitForTimeout(1000);
const card=await p.evaluate(()=>eval('talkOrder'));
ok(card && card.ready, `плоды сданы, заказ готов`);
await p.screenshot({path:'g-b44-order.png'});
await b.close();
