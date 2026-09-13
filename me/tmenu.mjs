import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{width:1100,height:620} });
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,180)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const vis=sel=>p.evaluate(s=>{
  const e=document.querySelector(s); if(!e) return false;
  if(getComputedStyle(e).display==='none') return false;
  const ov=e.closest('#overlay');           // элементы меню видны только вместе с оверлеем
  if(ov && getComputedStyle(ov).display==='none') return false;
  return true;
},sel);
await p.goto('http://localhost:8642',{waitUntil:'load'});
await p.waitForTimeout(1200); await p.click('#spGo');
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true); });
await p.waitForTimeout(900);
ok(await vis('#menuBtn'), 'кнопка «☰ Меню» видна в лобби');

await p.click('#menuBtn'); await p.waitForTimeout(600);
ok(await vis('#mPause'), 'меню открылось');
ok(await p.evaluate(()=>$('pmWhere').textContent.includes('Лобби')), 'меню знает, где мы: '+await p.evaluate(()=>$('pmWhere').textContent));
ok(!(await vis('#pmLobby')), 'в лобби кнопка «в лобби» скрыта');
ok(await vis('#pmGarden'), 'предложен переход в сад');
await p.screenshot({path:'g-menu.png'});

await p.click('#pmGarden');
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(1500);
ok(true,'из меню попали в сад: '+await p.evaluate(()=>window.game.code()));
await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true); });
await p.waitForTimeout(500);

await p.keyboard.press('Escape'); await p.waitForTimeout(600);
ok(await vis('#mPause'), 'Esc открыл меню в саду');
ok(await p.evaluate(()=>$('pmWhere').textContent.includes('сад')), 'подпись: '+await p.evaluate(()=>$('pmWhere').textContent));
ok(await vis('#pmLobby'), 'в саду предложен выход в лобби');
await p.keyboard.press('Escape'); await p.waitForTimeout(500);
ok(!(await vis('#mPause')), 'повторный Esc закрыл меню');

await p.click('#menuBtn'); await p.waitForTimeout(500);
await p.click('#pmLobby');
await p.waitForFunction(()=>window.game.code()==='LOBBY',null,{timeout:20000});
await p.waitForTimeout(1200);
ok(true,'из сада вернулись в лобби: '+await p.evaluate(()=>window.game.code()));
await b.close();
