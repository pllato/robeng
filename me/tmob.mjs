// Телефон: грядки видно, подсказка нажимается, окно сбора не закрывает экран.
import { chromium, devices } from 'playwright';
import { execSync } from 'child_process';
const acc = JSON.parse(execSync('node setup.mjs').toString().trim().split('\n').pop());
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ ...devices['iPhone 13'], hasTouch:true, isMobile:true });
const p = await ctx.newPage();
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,200)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
await p.addInitScript(t=>localStorage.setItem('me_token',t), acc.studentToken);
await p.goto('http://localhost:8642',{waitUntil:'load'});
await p.waitForTimeout(1600);
ok(await p.evaluate(()=>document.documentElement.classList.contains('touch')),'игра поняла, что это телефон');
await p.evaluate(()=>{ const g=document.getElementById('spGo'); if(g&&g.offsetParent) g.click(); });
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:30000});
await p.evaluate(()=>{ window.game.setPaused(false); window.startListen=()=>{}; });
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(2800);
await p.evaluate(()=>window.game.setPaused(false));
await p.waitForTimeout(900);

// грядки видно даже пустыми
const soil = await p.evaluate(()=>{ const q=bedPos(myPlotIndex(),3), H=q.y-1; let n=0;
  for(let dz=-3;dz<=3;dz++) for(let dx=-3;dx<=3;dx++) if(window.game.getB(q.x+dx,H,q.z+dz)===2) n++;
  return n; });
ok(soil>=40,'пустая грядка видна: земли '+soil+' блоков');
ok((await p.evaluate(()=>getComputedStyle(document.getElementById('bMine')).display))==='none','в саду убраны кнопки стройки');
ok((await p.evaluate(()=>getComputedStyle(document.getElementById('hotbar')).display))==='none','панель блоков спрятана');

// первое семя лежит в киоске — берём его оттуда
await p.evaluate(()=>openShop()); await p.waitForTimeout(1000);
await p.evaluate(()=>document.querySelector('#shopGrid .seedCard[data-buy]').click());
await p.waitForTimeout(1200);
await p.evaluate(()=>closeShop()); await p.waitForTimeout(600);
await p.evaluate(()=>{ const q=bedPos(myPlotIndex(),0), P=window.game.P; P.x=q.x+2; P.z=q.z+2; P.y=q.y; P.vx=P.vy=P.vz=0; });
await p.waitForTimeout(900);
const hint1 = await p.evaluate(()=>({txt:document.getElementById('hintBar').textContent,
  vis:getComputedStyle(document.getElementById('hintBar')).display,
  click:getComputedStyle(document.getElementById('hintBar')).pointerEvents}));
ok(hint1.vis!=='none' && /Посадить/.test(hint1.txt),'подсказка говорит, что делать: «'+hint1.txt.trim()+'»');
ok(hint1.click!=='none','по подсказке можно нажать пальцем');
await p.tap('#hintBar');                       // сажаем нажатием на надпись
await p.waitForTimeout(1800);
ok(!!(await p.evaluate(()=>bedAt(0))),'грядка засеяна нажатием на подсказку');

await p.waitForFunction(()=>bedAt(0)&&ripeWords(bedAt(0)).length>0,null,{timeout:20000});
await p.waitForTimeout(600);
const hint2 = await p.evaluate(()=>document.getElementById('hintBar').textContent);
ok(/Нажми на плод/.test(hint2),'у созревшей грядки: «'+hint2.trim()+'»');
await p.screenshot({path:'g-mob-1.png'});
ok(!(await p.evaluate(()=>!!document.getElementById('askBox'))),
   'нижней плашки сбора на телефоне нет — экран свободен');
await p.screenshot({path:'g-mob-2.png'});
// проверяем, что элементы не наезжают друг на друга
const overlap = await p.evaluate(()=>{
  const r=id=>document.getElementById(id).getBoundingClientRect();
  const a=r('menuBtn'), b=r('gardenNav'), c=r('gardenHud');
  const hit=(x,y)=>!(x.right<y.left||x.left>y.right||x.bottom<y.top||x.top>y.bottom);
  return {menuNav:hit(a,b), hudNav:hit(c,b)};
});
ok(!overlap.menuNav && !overlap.hudNav,'кнопки не налезают друг на друга');
// сбор пальцем: тычем прямо в плод на экране
const f = await p.evaluate(()=>{ const list=myRipeFruits(); if(!list.length) return null;
  const pt=project(lastMVP,list[0].x,list[0].y+list[0].s*2,list[0].z);
  return pt?{x:Math.round(pt[0]),y:Math.round(pt[1]),word:list[0].word}:null; });
ok(!!f, `плод «${f&&f.word}» виден на экране телефона`);
await p.evaluate(pt=>{ const c=document.querySelector('canvas');
  c.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,cancelable:true,
    changedTouches:[new Touch({identifier:1,target:c,clientX:pt.x,clientY:pt.y})]})); }, f);
await p.waitForTimeout(700);
ok((await p.evaluate(()=>!!holdFruit)), 'палец попал в плод — сбор начался');
await p.evaluate(x=>window.game.checkWord(x), f.word);
await p.waitForTimeout(700);
ok((await p.evaluate(()=>Object.values(myGarden.basket).reduce((a,b)=>a+b,0)))===1,'плод сорван с телефона');
await ctx.close(); await b.close();
