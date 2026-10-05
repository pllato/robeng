// Рюкзак: посадка из него, трофей со станции, подарок соседу
import { chromium } from 'playwright';
import { restoreBigGarden, bigGarden } from './biggard.mjs';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
async function player(){
  const ctx=await b.newContext({viewport:{width:980,height:640}});
  const p=await ctx.newPage();
  p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,160)));
  await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1300);
  await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
  await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
  await p.evaluate(()=>{window.game.setPaused(false);});
  await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
  await p.waitForTimeout(2300);
  return p;
}
const A=await player();
const G=pg=>pg.evaluate(()=>eval('myGarden'));

// в киоске берём подарочное семя — оно попадает в рюкзак
await A.evaluate(()=>openShop()); await A.waitForTimeout(1000);
await A.evaluate(()=>document.querySelector('#shopGrid .seedCard[data-buy]').click());
await A.waitForTimeout(1100);
await A.evaluate(()=>closeShop()); await A.waitForTimeout(500);
await A.evaluate(()=>openBag()); await A.waitForTimeout(600);
let cards=await A.evaluate(()=>[...document.querySelectorAll('#bagGrid .bagCard .nm')].map(e=>e.textContent));
ok(cards.includes('apple'), `в рюкзаке лежит семя: ${cards.join(', ')}`);

// встаём у грядки и сажаем прямо из рюкзака
await A.evaluate(()=>{ resumeGame(); const q=bedPos(myPlotIndex(),0), P=window.game.P; P.x=q.x+1.5; P.z=q.z+1.5; });
await A.waitForTimeout(900);
await A.evaluate(()=>openBag()); await A.waitForTimeout(600);
await A.evaluate(()=>document.querySelector('#bagGrid .bagCard').click());
await A.waitForTimeout(1500);
ok(!!(await A.evaluate(()=>bedAt(0))), 'нажал на семя в рюкзаке у грядки — оно посажено');

// трофей выдаёт станция за выполненный заказ (это проверяет torder).
// Здесь важно другое: что трофей виден в рюкзаке и его можно подарить.
await A.evaluate(g=>eval(`sendWS({t:'garden',act:'restore',garden:${g}})`),
                 bigGarden({extra:{items:{a1:1}}}));
await A.waitForTimeout(1300);
let g=await G(A);
ok((g.items&&g.items.a1)===1, `трофей со станции в саду: ${Object.keys(g.items||{}).join(', ')}`);
await A.evaluate(()=>openBag()); await A.waitForTimeout(600);
cards=await A.evaluate(()=>[...document.querySelectorAll('#bagGrid .bagCard .nm')].map(e=>e.textContent));
ok(cards.some(c=>/Перчатка/.test(c)), `трофей виден в рюкзаке: ${cards.join(', ')}`);

// второй игрок рядом — дарим ему трофей
const B2=await player();
await A.evaluate(()=>resumeGame());
const pos=await A.evaluate(()=>({x:window.game.P.x,z:window.game.P.z}));
await B2.evaluate(pt=>{ const P=window.game.P; P.x=pt.x+1; P.z=pt.z+1; }, pos);
await B2.waitForTimeout(1500);
await A.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await A.waitForTimeout(1000);
const near=await A.evaluate(()=>eval('bagNear'));
ok(near.length>0, `сосед виден рядом: ${near.map(n=>n.name).join(', ')}`);
await A.evaluate(id=>eval(`sendWS({t:'garden',act:'gift',to:${id},item:'a1'})`), near[0].id);
await A.waitForTimeout(1200);
g=await G(A);
ok(!Object.keys(g.items||{}).length, 'трофей ушёл из моего рюкзака');
await B2.waitForTimeout(1500);
const gb=await G(B2);
ok((gb.items&&gb.items.a1)===1, 'и появился у соседа: '+JSON.stringify(gb.items||{}));
await b.close();
