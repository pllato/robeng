// Заказ станции — конечное задание и обязательная ступень: пока не выполнишь, новая тема не откроется
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

// сад, в котором тема пройдена целиком: остаётся собрать последнее слово
const W=['apple','banana','orange','pear','grapes','lemon','watermelon','strawberry'], LAST=W[W.length-1];
const openW={}, cropsW={};
for(const w of W) openW['starter-01#'+w]=1;
for(const w of W.slice(0,-1)) cropsW['starter-01#'+w]=1;
await p.evaluate(o=>eval(`sendWS({t:'garden',act:'restore',garden:{coins:10,
  seeds:{'starter-01#${o.last}':4},
  openW:${JSON.stringify(o.openW)}, cropsW:${JSON.stringify(o.cropsW)},
  open:{},beds:{},basket:{},done:{},crops:{}}})`), {openW,cropsW,last:LAST});
await p.waitForTimeout(1100);
// сажаем последнее слово темы и обираем его целиком
await p.evaluate(w=>eval(`sendWS({t:'garden',act:'plant',bed:0,lesson:'starter-01#${w}'})`), LAST);
await p.waitForTimeout(9800);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(700);
for(let i=0;i<6;i++){
  const left=await p.evaluate(()=>{const b=myGarden.beds['0']; return b?(b.ripe||[]).slice():[];});
  if(!left.length) break;
  await p.evaluate(w=>eval(`sendWS({t:'garden',act:'pick',bed:0,word:'${w}'})`), left[0]);
  await p.waitForTimeout(420);
}
await p.waitForTimeout(900);
let g=await G();
ok(!!g.order, `тема пройдена — появился заказ: ${g.order&&g.order.kind} по теме «${g.order&&g.order.theme}»`);
const nextOpen=Object.keys(g.openW||{}).some(id=>!id.startsWith('starter-01#'));
ok(!nextOpen, 'следующая тема пока НЕ открыта — сперва заказ');

// подходим к станции заказа
if(!g.order){ console.log(' FAIL заказа нет — дальше проверять нечего'); await b.close(); process.exit(0); }
const kind=g.order.kind;
const a=await p.evaluate(k=>interactables.find(x=>x.act==='phrase'&&x.kind===k), kind);
ok(!!a, `на улице есть станция «${kind}»`);
await p.evaluate(q=>{ const P=window.game.P; P.x=q.x; P.z=q.z; P.y=q.y; }, a);
await p.waitForTimeout(700);
await p.evaluate(()=>window.game.doInteract());
await p.waitForTimeout(1400);
let card=await p.evaluate(()=>eval('talkOrder'));
ok(!!card, `станция показала заказ: ${card&&card.items.map(i=>i.emoji+' '+i.gave+'/'+i.need).join(' ')} · фраз ${card&&card.said}/${card&&card.say}`);
ok((await p.evaluate(()=>document.getElementById('talkOrder').textContent)).includes('Заказ'),
   'карточка заказа на экране');

// чужая станция честно отправляет к нужной
const other=await p.evaluate(k=>interactables.find(x=>x.act==='phrase'&&x.kind!==k), kind);
await p.evaluate(()=>closeTalk()); await p.waitForTimeout(400);
await p.evaluate(q=>{ const P=window.game.P; P.x=q.x; P.z=q.z; P.y=q.y; }, other);
await p.waitForTimeout(600);
await p.evaluate(()=>window.game.doInteract());
await p.waitForTimeout(1300);
const txt=await p.evaluate(()=>document.getElementById('talkRu').textContent+' | '+document.getElementById('talkAsk').textContent);
ok(/не у меня|Заказов пока нет/.test(txt), `на чужой станции заказа нет: «${txt.trim()}»`);
ok((await p.evaluate(()=>getComputedStyle(document.getElementById('talkSay')).display))==='none',
   'и бесконечных фраз там не дают — кнопка спрятана');

// возвращаемся и выполняем: фразы
await p.evaluate(()=>closeTalk()); await p.waitForTimeout(300);
await p.evaluate(q=>{ const P=window.game.P; P.x=q.x; P.z=q.z; P.y=q.y; }, a);
await p.waitForTimeout(500);
await p.evaluate(()=>window.game.doInteract());
await p.waitForTimeout(1300);
for(let i=0;i<6;i++){
  const t=await p.evaluate(()=>eval('talkTask'));
  if(!t) break;
  await p.evaluate(x=>eval(`sendWS({t:'garden',act:'phraseSaid',kind:'${x.kind}',key:'${x.lesson}#${x.word}',said:${JSON.stringify(x.text)}})`), t);
  await p.waitForTimeout(700);
}
card=await p.evaluate(()=>eval('talkOrder'));
ok(card && card.sayDone, `фразы сказаны: ${card&&card.said}/${card&&card.say}`);
ok((await p.evaluate(()=>getComputedStyle(document.getElementById('talkSay')).display))==='none',
   'больше фраз не просят — задание конечное');

// плоды: собираем урожай темы и сдаём
await p.evaluate(()=>closeTalk()); await p.waitForTimeout(300);
for(let round=0; round<3; round++){
  await p.evaluate(o=>eval(`sendWS({t:'garden',act:'plant',bed:${o.b},lesson:'starter-01#${o.w}'})`), {b:round+1,w:LAST});
  await p.waitForTimeout(300);
}
await p.waitForTimeout(9500);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(700);
for(const bed of [1,2,3]) for(let i=0;i<4;i++){
  const left=await p.evaluate(b=>{const x=myGarden.beds[String(b)]; return x?(x.ripe||[]).slice():[];}, bed);
  if(!left.length) break;
  await p.evaluate(o=>eval(`sendWS({t:'garden',act:'pick',bed:${o.b},word:'${o.w}'})`), {b:bed,w:left[0]});
  await p.waitForTimeout(330);
}
g=await G();
const inBasket=Object.values(g.basket||{}).reduce((a,b)=>a+b,0);
ok(inBasket>=6, `в корзине ${inBasket} плодов темы — хватит на заказ`);
await p.evaluate(q=>{ const P=window.game.P; P.x=q.x; P.z=q.z; P.y=q.y; }, a);
await p.waitForTimeout(500);
await p.evaluate(()=>window.game.doInteract());
await p.waitForTimeout(1300);
for(let i=0;i<4;i++){
  await p.evaluate(()=>document.getElementById('talkGive').click());
  await p.waitForTimeout(800);
  const c=await p.evaluate(()=>eval('talkOrder'));
  if(c && c.bringDone) break;
}
card=await p.evaluate(()=>eval('talkOrder'));
ok(card && card.ready, `плоды сданы, заказ готов: ${card&&card.items.map(i=>i.gave+'/'+i.need).join(' ')}`);
ok((await p.evaluate(()=>getComputedStyle(document.getElementById('talkPrize')).display))!=='none',
   'появилась кнопка «Забрать приз»');

const coinsBefore=(await G()).coins;
await p.evaluate(()=>document.getElementById('talkPrize').click());
await p.waitForTimeout(1500);
g=await G();
ok(g.coins>coinsBefore, `приз выдан: ${coinsBefore} → ${g.coins} 🪙`);
ok(!g.order, 'заказ закрыт — станция снова молчит');
const opened=Object.keys(g.openW||{}).filter(id=>!id.startsWith('starter-01#'));
ok(opened.length>0, `и только теперь открылась новая тема: ${opened.join(', ')}`);
ok(Object.keys(g.items||{}).length>0, `в рюкзаке трофей: ${Object.keys(g.items||{}).join(', ')}`);
await p.screenshot({path:'g-b37-order.png'});
await b.close();
