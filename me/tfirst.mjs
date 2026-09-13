// Первый заход: киоск → грядка → плод → лавка → поздравление
import { chromium, devices } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx=await b.newContext({...devices['iPhone 13'],viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const p=await ctx.newPage();
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,160)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const O=()=>p.evaluate(()=>window.game.onb());
const G=()=>p.evaluate(()=>eval('myGarden'));
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1400);
await p.evaluate(()=>{const g=document.getElementById('spGo'); if(g&&g.offsetParent) g.click();});
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(2400);
await p.evaluate(()=>window.game.pixiDismiss()); await p.waitForTimeout(400);

let g=await G();
ok(Object.keys(g.seeds).length===0, 'в сумке пусто — семя надо взять в киоске');
let o=await O();
ok(/киоске/.test(o.text), `шаг 1: «${o.text}»`);
ok(await p.evaluate(()=>!!document.querySelector('#gardenNav button[data-go="shop"].onbGlow')), 'подсвечен «Киоск семян»');

// стрелки мелкие, а не во весь экран
const arrow=await p.evaluate(()=>{
  const V=[]; pushGuideArrows(V);
  let minx=1e9,maxx=-1e9,minz=1e9,maxz=-1e9;
  for(let i=0;i<V.length;i+=9){ minx=Math.min(minx,V[i]); maxx=Math.max(maxx,V[i]); minz=Math.min(minz,V[i+2]); maxz=Math.max(maxz,V[i+2]); }
  return {boxes:V.length/9/4};
});
ok(arrow.boxes>0, `дорожка из ${arrow.boxes} меток`);
const chev=await p.evaluate(()=>{ const V=[]; pushChevron(V,0,0,0,0,1,[1,1,1]);
  let mx=-1e9,mn=1e9; for(let i=0;i<V.length;i+=9){ mx=Math.max(mx,V[i]); mn=Math.min(mn,V[i]); } return +(mx-mn).toFixed(2); });
ok(chev<0.8, `одна стрелка шириной ${chev} блока — не перегораживает грядку`);

// текстовая плашка микрофона в саду скрыта
ok((await p.evaluate(()=>getComputedStyle(document.getElementById('micBtn')).display))==='none',
   'плашка микрофона в саду убрана — не налезает на подсказку');

// берём бесплатное семя
await p.evaluate(()=>openShop()); await p.waitForTimeout(1200);
const free=await p.evaluate(()=>{ const c=document.querySelector('#shopGrid .seedCard[data-buy]');
  return c?{name:c.querySelector('.nm').textContent, price:c.querySelector('.pr').textContent}:null; });
ok(free && /бесплатно/.test(free.price), `в киоске первое семя «${free&&free.name}» — ${free&&free.price}`);
await p.evaluate(()=>document.querySelector('#shopGrid .seedCard[data-buy]').click());
await p.waitForTimeout(1200);
g=await G();
ok(Object.keys(g.seeds).length===1 && (g.coins|0)===0, 'семя в сумке, монеты не списались');

await p.evaluate(()=>closeShop()); await p.waitForTimeout(500);
o=await O(); ok(/Посади/.test(o.text), `шаг 2: «${o.text}»`);

const seed=Object.keys(g.seeds)[0];
await p.evaluate(id=>eval(`sendWS({t:'garden',act:'plant',bed:0,lesson:'${id}'})`), seed);
await p.waitForTimeout(9800);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(800);
o=await O(); ok(/Сорви/.test(o.text), `шаг 3: «${o.text}»`);

await p.evaluate(()=>{ const q=bedPos(myPlotIndex(),0), P=window.game.P; P.x=q.x+.5; P.z=q.z+3; });
await p.waitForTimeout(600);
const w=await p.evaluate(()=>ripeWords(bedAt(0))[0]);
await p.evaluate(x=>window.game.checkWord(x), w);
await p.waitForTimeout(1100);
o=await O(); ok(/лавке/.test(o.text), `шаг 4: «${o.text}»`);

await p.evaluate(()=>{ window.__t=[]; const o=eval('toast'); eval('toast = m=>{ window.__t.push(m); return ('+o.toString()+')(m); }'); });
await p.evaluate(()=>eval("sendWS({t:'garden',act:'sell'})"));
await p.waitForTimeout(1600);
const msgs=await p.evaluate(()=>window.__t);
ok(msgs.some(m=>/можешь купить новые семена/.test(m)), 'поздравление: «'+(msgs.find(m=>/новые семена/.test(m))||'—')+'»');
o=await O();
// первый куст даёт сразу три плода: продал один — подсказка честно зовёт обратно за остальными
const left=await p.evaluate(()=>ripeWords(bedAt(0)).length);
ok(left>0 ? /Сорви плод/.test(o.text) : /Собери ещё урожай/.test(o.text),
   `на грядке ещё ${left} плода — подсказка честная: «${o.text}»`);
// добираем со второго круга и покупаем (второй урожай зреет столько же — 8 с — ждём по-настоящему)
await p.waitForTimeout(9800);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(800);
for(let i=0;i<4;i++){
  const left=await p.evaluate(()=>ripeWords(bedAt(0)));
  if(!left.length) break;
  await p.evaluate(x=>window.game.checkWord(x), left[0]);
  await p.waitForTimeout(350);
}
await p.evaluate(()=>eval("sendWS({t:'garden',act:'sell'})"));
await p.waitForTimeout(1400);
o=await O(); ok(/киоске/.test(o.text), `хватило на семя → «${o.text}»`);
await p.evaluate(()=>openShop()); await p.waitForTimeout(1000);
await p.evaluate(()=>{ const c=document.querySelector('#shopGrid .seedCard[data-buy]:not(.poor)'); if(c) c.click(); });
await p.waitForTimeout(1200);
await p.evaluate(()=>closeShop()); await p.waitForTimeout(900);
o=await O(); ok(o.off, 'купил новое семя — подсказки закончились сами');
await b.close();
