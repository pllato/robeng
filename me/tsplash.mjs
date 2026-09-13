// Первый экран: огород, ресепшн, персонаж с именем — и без одиночного режима
import { chromium, devices } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const NAME='Тимур-'+Math.random().toString(36).slice(2,6);   // имена уникальны — берём новое на каждый прогон
const ctx=await b.newContext({...devices['iPhone 13'],viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const p=await ctx.newPage();
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,170)));
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1600);

const btns=await p.evaluate(()=>[...document.querySelectorAll('#splashBox button')]
  .map(x=>({id:x.id, t:x.textContent.trim()})));
ok(!btns.some(x=>/Одиночн/i.test(x.t)), 'одиночного режима на первом экране нет');
ok(btns.some(x=>x.id==='spGo' && /огород/i.test(x.t)), `главная кнопка: «${(btns.find(x=>x.id==='spGo')||{}).t}»`);
ok(btns.some(x=>x.id==='spDesk' && /Ресепшн/i.test(x.t)), `есть кнопка: «${(btns.find(x=>x.id==='spDesk')||{}).t}»`);
ok(btns.some(x=>x.id==='spAva' && /имя/i.test(x.t)), `персонаж и имя одной кнопкой: «${(btns.find(x=>x.id==='spAva')||{}).t}»`);

// имя правится прямо в конструкторе персонажа
await p.evaluate(()=>document.getElementById('spAva').click());
await p.waitForTimeout(900);
ok((await p.evaluate(()=>!document.getElementById('mAva').hidden)), 'конструктор персонажа открылся');
const fld=await p.evaluate(()=>{ const e=document.getElementById('avaName');
  return e?{ph:e.placeholder, vis:getComputedStyle(e).display}:null; });
ok(fld && fld.vis!=='none', `в нём есть поле имени: «${fld&&fld.ph}»`);

await p.evaluate(()=>eval("sendWS({t:'autoUser',name:''})")); await p.waitForTimeout(1200);
const was=await p.evaluate(()=>eval('USER')&&eval('USER').name);
await p.evaluate(n=>{ const e=document.getElementById('avaName'); e.value=n; }, NAME);
await p.evaluate(()=>document.getElementById('avaSave').click());
await p.waitForTimeout(1500);
const now=await p.evaluate(()=>eval('USER')&&eval('USER').name);
ok(now===NAME, `имя сохранилось вместе с персонажем: было «${was}», стало «${now}»`);
ok((await p.evaluate(()=>document.getElementById('splashBox').textContent)).includes(NAME),
   'и сразу видно на первом экране');
// заново открыли — поле подставило текущее имя
await p.evaluate(()=>document.getElementById('spAva').click()); await p.waitForTimeout(700);
ok((await p.evaluate(()=>document.getElementById('avaName').value))===NAME,'при повторном заходе имя подставлено');
await p.evaluate(()=>{ const bk=document.querySelector('#mAva .mBack'); if(bk) bk.click(); });
await p.waitForTimeout(600);

// «Ресепшн школы» ведёт в лобби
await p.evaluate(()=>document.getElementById('spDesk').click());
await p.waitForFunction(()=>window.game&&window.game.ready()&&window.game.code()==='LOBBY',null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.waitForTimeout(2200);
ok((await p.evaluate(()=>window.game.code()))==='LOBBY','кнопка «Ресепшн школы» приводит на ресепшн');
ok(/Ресепшн/.test(await p.evaluate(()=>document.getElementById('classinfo').textContent)),
   `и наверху написано: «${(await p.evaluate(()=>document.getElementById('classinfo').textContent)).trim()}»`);
// имя игрока в мире то самое
ok((await p.evaluate(()=>eval('USER').name))===NAME,'в мире игрок под своим именем');
await b.close();
