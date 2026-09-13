// Переход в ту же комнату не должен разрывать мир: игроки обязаны видеть друг друга
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
async function player(){
  const ctx=await b.newContext({viewport:{width:900,height:600}});
  const p=await ctx.newPage();
  p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,160)));
  await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1300);
  await p.evaluate(()=>{const g=document.getElementById('spGo'); if(g&&g.offsetParent) g.click();});
  await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
  await p.evaluate(()=>{window.game.setPaused(false);});
  await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
  await p.waitForTimeout(2000);
  return p;
}
const A=await player();
// первый игрок ещё раз переходит в тот же мир — раньше это «уносило» комнату с собой
await A.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await A.waitForTimeout(2000);
ok((await A.evaluate(()=>window.game.code()))==='GARDEN','после повторного перехода игрок всё ещё в саду');
const B=await player();
await A.waitForTimeout(1800); await B.waitForTimeout(1800);
const seesB=await A.evaluate(()=>eval('peers').size);
const seesA=await B.evaluate(()=>eval('peers').size);
ok(seesB>0, `первый видит второго: соседей ${seesB}`);
ok(seesA>0, `второй видит первого: соседей ${seesA}`);
// и участки у них разные, а не два мира по одному игроку
const plotsA=await A.evaluate(()=>eval('plots').filter(Boolean).length);
ok(plotsA>=2, `на улице выданы участки обоим: занятых ${plotsA}`);
// действия одного долетают до другого
await B.evaluate(()=>{ window.__act=[]; eval("actPush = (function(o){ return function(m){ window.__act.push(m.text); return o(m); }; })(actPush)"); });
await A.evaluate(()=>openShop()); await A.waitForTimeout(900);
await A.evaluate(()=>{const c=document.querySelector('#shopGrid .seedCard[data-buy]'); if(c) c.click();});
await A.waitForTimeout(1500);
const heard=await B.evaluate(()=>window.__act||[]);
ok(heard.length>0, `лента второго игрока получила событие первого: «${heard[0]||'—'}»`);
await b.close();
