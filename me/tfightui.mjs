// Экран боя на телефоне: кнопки под правую руку, плашка не закрывает игру, лишнее спрятано
import { chromium, devices } from 'playwright';
import { restoreBossGarden } from './bossgard.mjs';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx=await b.newContext({...devices['iPhone 13'],viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const p=await ctx.newPage();
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,170)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const G=()=>p.evaluate(()=>eval('myGarden'));
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1500);
// входим гостем: сперва переход в сад, потом ждём мир — так аккаунт не заводится
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(2400);
await restoreBossGarden(p);
await p.evaluate(()=>{ const q=bedPos(myPlotIndex(),0), P=window.game.P; P.x=q.x+.5; P.z=q.z+3; });
await p.waitForTimeout(700);
for(let i=0;i<9;i++){ const l=await p.evaluate(()=>bedAt(0)?ripeWords(bedAt(0)):[]);
  if(!l.length) break; await p.evaluate(x=>window.game.checkWord(x), l[0]); await p.waitForTimeout(340); }
await p.waitForTimeout(1400);
let g=await G();
ok(!!g.boss, 'босс пришёл');
ok(await p.evaluate(()=>window.game.bossIntro().on), 'сперва заставка с правилами');
const rules=await p.evaluate(()=>[...document.querySelectorAll('#biRules div')].map(d=>d.textContent.trim()));
ok(rules.some(r=>/скажи это слово вслух/i.test(r)), 'в правилах написано, что нажимать никуда не надо');
ok(rules.some(r=>/первые секунды/.test(r)), 'и про супер-удар за быстрый ответ');
await p.evaluate(()=>document.getElementById('biGo').click()); await p.waitForTimeout(1200);

// кнопки под правой рукой
const geo=await p.evaluate(()=>{ const r=id=>{const e=document.getElementById(id), b=e.getBoundingClientRect();
    return {x:Math.round(b.left),y:Math.round(b.top),w:Math.round(b.width),h:Math.round(b.height),
            vis:getComputedStyle(e).display}; };
  return {acts:r('bossActs'), fight:r('bFight'), bar:r('bossBar'), vw:innerWidth, vh:innerHeight}; });
ok(geo.fight.vis!=='none', 'кнопка «БЕЙ» видна');
ok(geo.fight.x>geo.vw*0.5 && geo.fight.y>geo.vh*0.6, `«БЕЙ» под большим пальцем: ${geo.fight.x},${geo.fight.y}`);
ok(geo.acts.x>geo.vw*0.55 && geo.acts.y>geo.vh*0.4, `кирка и «убежать» там же справа: ${geo.acts.x},${geo.acts.y}`);
ok(geo.bar.h<geo.vh*0.14, `полоса босса тонкая: ${geo.bar.h}px из ${geo.vh}`);
const cover=Math.round(geo.bar.w*geo.bar.h/(geo.vw*geo.vh)*100);
ok(cover<10, `и закрывает ${cover}% экрана`);

// лишнее на время боя спрятано
const hidden=await p.evaluate(()=>['gardenNav','gardenHud','onbLine','hotbar','bMine','bTalk']
  .map(id=>({id, d:getComputedStyle(document.getElementById(id)).display})));
ok(hidden.every(h=>h.d==='none'), 'меню сада, монеты, подсказки и стройка на время боя убраны: '
   +hidden.map(h=>h.id+'='+h.d).join(' '));

// как только ослаб — слово и таймер, без нажатий
for(let i=0;i<9;i++){
  await p.evaluate(()=>{ const bs=eval('bossServer'); if(bs){const P=window.game.P; P.x=bs.x+1.2; P.z=bs.z+1.2;} });
  await p.evaluate(()=>eval("sendWS({t:'garden',act:'bossHit'})")); await p.waitForTimeout(360);
  if(await p.evaluate(()=>window.game.bossWeak())) break;
}
await p.waitForTimeout(600);
const todo=await p.evaluate(()=>window.game.bossTodo());
ok(todo.weak, 'босс ослаб');
ok(todo.word && todo.words.includes(todo.word), `показано слово: «${todo.word}»`);
ok(/осталось \d+ с/.test(todo.sec), `и таймер: «${todo.sec}»`);
ok(await p.evaluate(()=>eval('bossTapOn')), 'игра уже слушает — нажимать на босса не надо');
await p.screenshot({path:'g-b26-fight.png'});
await b.close();
