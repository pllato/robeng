// Пока открыто меню — на экране не должно быть ни одной игровой кнопки
import { chromium, devices } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx=await b.newContext({...devices['iPhone 13'],viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const p=await ctx.newPage();
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,160)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const vis=async ids=>p.evaluate(list=>list.filter(id=>{
  const e=document.getElementById(id)||document.querySelector(id);
  if(!e) return false; const r=e.getBoundingClientRect();
  return r.width>0 && r.height>0 && getComputedStyle(e).display!=='none' && getComputedStyle(e).visibility!=='hidden';
}), ids);
const CTRL=['joy','bJump','bMine','bBuild','bView','bTalk','hotbar','crosshair','micBtn','menuBtn'];

await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1600);
let shown=await vis(CTRL);
ok(shown.length===0, `на первом экране управления нет${shown.length?': '+shown.join(', '):''}`);
ok((await p.evaluate(()=>document.querySelector('.sub2').textContent)).includes('пиксельный'),
   'подпись: '+await p.evaluate(()=>document.querySelector('.sub2').textContent));

// входим в игру — управление появляется
await p.evaluate(()=>{const g=document.getElementById('spGo'); if(g&&g.offsetParent) g.click();});
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.waitForTimeout(1200);
shown=await vis(['joy','bJump']);
ok(shown.length===2, 'в игре джойстик и прыжок на месте');

// открыли меню — снова прячется
await p.evaluate(()=>overlayView('mPause')); await p.waitForTimeout(600);
shown=await vis(CTRL);
ok(shown.length===0, `в меню паузы управления нет${shown.length?': '+shown.join(', '):''}`);

// закрыли — вернулось
await p.evaluate(()=>resumeGame()); await p.waitForTimeout(600);
shown=await vis(['joy','bJump']);
ok(shown.length===2, 'вышли из меню — управление вернулось');

// киоск тоже перекрывает управление
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(2200);
await p.evaluate(()=>openShop()); await p.waitForTimeout(900);
shown=await vis(CTRL);
ok(shown.length===0, `в киоске управления нет${shown.length?': '+shown.join(', '):''}`);
await p.screenshot({path:'g-splash.png'});
await b.close();
