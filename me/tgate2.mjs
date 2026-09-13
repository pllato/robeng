// Связка: посадил — открылось следующее; босс приходит по числу растений
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p=await b.newPage({viewport:{width:1000,height:640}});
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,160)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const G=()=>p.evaluate(()=>eval('myGarden'));
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1400);
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(2400);
let g=await G();
ok(Object.keys(g.openW).length===1, `в начале открыто одно семя: ${Object.keys(g.openW)[0]}`);

// берём подарок и сажаем — должно открыться следующее
await p.evaluate(()=>openShop()); await p.waitForTimeout(1000);
await p.evaluate(()=>document.querySelector('#shopGrid .seedCard[data-buy]').click());
await p.waitForTimeout(1100);
await p.evaluate(()=>closeShop()); await p.waitForTimeout(400);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'plant',bed:0,lesson:'starter-01#apple'})"));
await p.waitForTimeout(1300);
g=await G();
ok(Object.keys(g.openW).length===2 && g.openW['starter-01#banana'],
   `посадил apple → в киоске появилось следующее: ${Object.keys(g.openW).join(', ')}`);
ok(!g.boss, 'босс пока не пришёл — сперва надо собрать первый плод');
// собираем первый плод — но босса всё ещё нет: новичок не замкнул круг
await p.waitForTimeout(9600);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(700);
await p.evaluate(()=>{ const q=bedPos(myPlotIndex(),0), P=window.game.P; P.x=q.x+.5; P.z=q.z+3; });
await p.waitForTimeout(500);
await p.evaluate(()=>window.game.checkWord('apple'));
await p.waitForTimeout(1300);
g=await G();
ok(!g.boss, 'сорвал первый плод, но не продал — босс не мешает обучению');
// продал урожай — но босс всё равно не приходит: огород ещё крошечный
await p.evaluate(()=>eval("sendWS({t:'garden',act:'sell'})")); await p.waitForTimeout(1200);
await p.waitForTimeout(9800);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(700);
for(let i=0;i<6;i++){
  const left=await p.evaluate(()=>ripeWords(bedAt(0)));
  if(!left.length) break;
  await p.evaluate(x=>window.game.checkWord(x), left[0]);
  await p.waitForTimeout(400);
}
await p.waitForTimeout(1000);
g=await G();
const need=await p.evaluate(()=>window.game.bossNeed());
ok(!g.boss, `огород из ${need.have} растения — босс не приходит, ему нужно ${need.need}`);
ok((need.needDays|0)>=5, `и ждать его надо не меньше ${need.needDays} дней работы с огородом`);
ok(/разных растений/.test(await p.evaluate(()=>window.game.bossProgressText())),
   'в меню видно, чего не хватает до босса');
await b.close();
