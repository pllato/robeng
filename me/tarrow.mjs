// Стрелки не должны пропадать после сорванного плода; заставка перед боссом; кнопки под правую руку
import { chromium, devices } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx=await b.newContext({...devices['iPhone 13'],viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const p=await ctx.newPage();
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,170)));
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
// этот тест про строку подсказки и стрелки — помощника на время убираем,
// иначе он говорит вместо неё (так и задумано, проверяется в tpixi)
await p.evaluate(()=>window.game.pixiDismiss()); await p.waitForTimeout(400);

// первый круг: киоск → грядка → плод
await p.evaluate(()=>openShop()); await p.waitForTimeout(1000);
await p.evaluate(()=>document.querySelector('#shopGrid .seedCard[data-buy]').click());
await p.waitForTimeout(1200);
await p.evaluate(()=>closeShop()); await p.waitForTimeout(600);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'plant',bed:0,lesson:Object.keys(myGarden.seeds)[0]})"));
await p.waitForTimeout(9800);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(800);
await p.evaluate(()=>{ const q=bedPos(myPlotIndex(),0), P=window.game.P; P.x=q.x+.5; P.z=q.z+3; });
await p.waitForTimeout(700);

// рвём плод пальцем — как настоящий ребёнок
const f=await p.evaluate(()=>{ const l=myRipeFruits(); if(!l.length) return null;
  const pt=project(lastMVP,l[0].x,l[0].y+l[0].s*2,l[0].z);
  return pt?{x:Math.round(pt[0]),y:Math.round(pt[1]),word:l[0].word}:null; });
ok(!!f, `плод «${f&&f.word}» на экране`);
await p.evaluate(pt=>{ const c=document.querySelector('canvas');
  c.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,cancelable:true,
    changedTouches:[new Touch({identifier:1,target:c,clientX:pt.x,clientY:pt.y})]})); }, f);
await p.waitForTimeout(500);
ok((await p.evaluate(()=>document.getElementById('onbLine').style.display))==='none',
   'пока палец на плоде — подсказка не мешает');
await p.evaluate(x=>window.game.checkWord(x), f.word);
await p.waitForTimeout(1200);

// вот здесь стрелка пропадала навсегда
ok((await p.evaluate(()=>eval('askOn')))===false, 'после сбора флаг сбора снят');
let o=await O();
ok(!o.off && /лавке/.test(o.text), `после сорванного плода стрелка ведёт в лавку: «${o.text}»`);
// даже если на грядке остались плоды — в первый раз ведём именно в лавку
{
  const st=await p.evaluate(()=>({ripe:anyRipe(), sold:eval('onbSold'), basket:basketTotal()}));
  if(st.ripe) ok(/лавке/.test((await O()).text), `на грядке ещё ${st.basket?'есть':'нет'} плоды, но первый круг ведёт в лавку`);
  else        ok(true, 'на грядке пусто — вести больше некуда, кроме лавки');
}
// стрелка направления в самой строке: показывает, куда повернуться
const dir=await p.evaluate(()=>{ const d=document.getElementById('onbDir');
  return d?{vis:getComputedStyle(d).display, tr:d.style.transform}:null; });
ok(dir && dir.vis!=='none' && /rotate/.test(dir.tr||''), `в строке есть стрелка направления: ${dir&&dir.tr}`);
// повернулись — стрелка повернулась вместе с камерой
const before=await p.evaluate(()=>document.getElementById('onbDir').style.transform);
await p.evaluate(()=>{ window.game.P.yaw+=Math.PI/2; });
await p.waitForTimeout(400);
const after=await p.evaluate(()=>document.getElementById('onbDir').style.transform);
ok(before!==after, `повернул камеру — стрелка повернулась: ${before} → ${after}`);
await p.evaluate(()=>{ window.game.P.yaw-=Math.PI/2; }); await p.waitForTimeout(300);
ok(!!o.target, 'и цель для стрелок на земле есть');
ok((await p.evaluate(()=>document.getElementById('onbLine').style.display))==='block','строчка подсказки видна');

// продали плод — первый куст даёт три, поэтому игра честно зовёт обратно за остальными
await p.evaluate(()=>eval("sendWS({t:'garden',act:'sell'})"));
await p.waitForTimeout(1600);
o=await O();
const left=await p.evaluate(()=>ripeWords(bedAt(0)).length);
ok(left>0 ? /Сорви плод/.test(o.text) : /Собери ещё урожай|Купи семя/.test(o.text),
   `на грядке ещё ${left} плода — подсказка честная: «${o.text}»`);
// второй круг теперь тоже быстрый: добираем и продаём
await p.waitForTimeout(9800);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(800);
for(let i=0;i<5;i++){ const l=await p.evaluate(()=>ripeWords(bedAt(0)));
  if(!l.length) break; await p.evaluate(w=>window.game.checkWord(w), l[0]); await p.waitForTimeout(430); }
await p.evaluate(()=>eval("sendWS({t:'garden',act:'sell'})"));
await p.waitForTimeout(1600);
o=await O();
ok(/киоск/.test(o.text), `хватило монет — стрелка ведёт в киоск: «${o.text}»`);

await b.close();
