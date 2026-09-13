// «Начать заново» и порядок подсказок после продажи
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p=await b.newPage({viewport:{width:1050,height:660}});
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,160)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const G=()=>p.evaluate(()=>eval('myGarden'));
const O=()=>p.evaluate(()=>window.game.onb());
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1400);
await p.evaluate(()=>{const g=document.getElementById('spGo'); if(g&&g.offsetParent) g.click();});
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(2400);

// проходим круг: взял → посадил → собрал → продал
await p.evaluate(()=>openShop()); await p.waitForTimeout(1100);
await p.evaluate(()=>document.querySelector('#shopGrid .seedCard[data-buy]').click());
await p.waitForTimeout(1100);
await p.evaluate(()=>closeShop()); await p.waitForTimeout(400);
const seed=Object.keys(await p.evaluate(()=>eval('myGarden.seeds')))[0];
await p.evaluate(id=>eval(`sendWS({t:'garden',act:'plant',bed:0,lesson:'${id}'})`), seed);
await p.waitForTimeout(9600);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(700);
await p.evaluate(()=>{ const q=bedPos(myPlotIndex(),0), P=window.game.P; P.x=q.x+.5; P.z=q.z+3; });
await p.waitForTimeout(600);
// первый куст даёт сразу три плода — обираем весь, как это делает ребёнок
for(let i=0;i<6;i++){
  const left=await p.evaluate(()=>ripeWords(bedAt(0)));
  if(!left.length) break;
  await p.evaluate(x=>window.game.checkWord(x), left[0]);
  await p.waitForTimeout(450);
}
await p.waitForTimeout(700);
let o=await O(); ok(/лавке/.test(o.text), `в корзине плод → «${o.text}»`);

await p.evaluate(()=>eval("sendWS({t:'garden',act:'sell'})"));
await p.waitForTimeout(1600);
o=await O();
// после первой продажи монет ещё мало — подсказка честно шлёт добирать урожай
ok(!/Сорви/.test(o.text), `после продажи не гонит обратно рвать: «${o.text}»`);
// добавим монет и проверим, что теперь ведёт именно в киоск
await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})"));
await p.waitForTimeout(600);
const rich=await p.evaluate(()=>{ eval('myGarden').coins=99; onbTick();
  const t=window.game.onb().target, s=onbSpot('shop');
  return {text:window.game.onb().text, atShop:!!(t&&s&&Math.abs(t.x-s.x)<0.1&&Math.abs(t.z-s.z)<0.1)}; });
ok(/киоске/.test(rich.text), `когда монет хватает — ведёт в киоск: «${rich.text}»`);
ok(rich.atShop, 'и стрелки показывают именно на киоск');

// обнуление
let g=await G();
ok((g.coins|0)>0 && Object.keys(g.beds).length>0, `до обнуления: монет ${g.coins}, грядок ${Object.keys(g.beds).length}`);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'reset'})"));
await p.waitForTimeout(1200);
g=await G();
ok((g.coins|0)===0 && !Object.keys(g.beds).length && !Object.keys(g.seeds).length,
   `после обнуления: монет ${g.coins}, грядок ${Object.keys(g.beds).length}, семян ${Object.keys(g.seeds).length}`);
ok(Object.keys(g.openW||{}).length===1, 'открыто снова только первое слово');
ok(!!g.freeSeed, 'и подарочное семя опять лежит в киоске');
await b.close();
