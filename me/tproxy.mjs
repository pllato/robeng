// Полный игровой цикл через обратный прокси — так будет работать на сервере за Caddy.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{width:1100,height:640} });
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,200)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
await p.goto('http://localhost:8700',{waitUntil:'load'});
await p.waitForTimeout(1500);
ok(/✓/.test(await p.evaluate(()=>document.getElementById('spBuild').textContent)),'страница отдана через прокси, версия сошлась');
await p.click('#spGo');
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:30000});
ok(true,'WebSocket прошёл через прокси — вошли в мир: '+await p.evaluate(()=>window.game.code()));
await p.evaluate(()=>{ window.game.setPaused(false); window.startListen=()=>{}; });
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(2600);
await p.evaluate(()=>window.game.setPaused(false));
ok((await p.evaluate(()=>myPlotIndex()))>=0,'участок выдан — обмен по сокету живой');
await p.evaluate(()=>{ const id=Object.keys(myGarden.seeds)[0];
  const it=(shopIndex||[]).find(x=>x.id===id)||{id,title:id,theme:id};
  eval('seedInHand='+JSON.stringify({id:it.id,title:it.title,theme:it.theme})); });
await p.evaluate(()=>{ const q=bedPos(myPlotIndex(),0), P=window.game.P; P.x=q.x+2; P.z=q.z+2; P.y=q.y; P.vx=P.vy=P.vz=0; });
await p.waitForTimeout(800);
await p.evaluate(()=>window.game.doInteract());
await p.waitForTimeout(1800);
ok(!!(await p.evaluate(()=>bedAt(0))),'посадка через прокси прошла');
await p.waitForFunction(()=>bedAt(0)&&ripeWords(bedAt(0)).length>0,null,{timeout:20000});
let got=0;
for(let g=0;g<60;g++){
  const left=await p.evaluate(()=>ripeWords(bedAt(0)));
  if(!left.length) break;
  if(await p.evaluate(w=>window.game.checkWord(w), left[0])) got++;
  await p.waitForTimeout(320);
}
ok(got>=16,'урожай собран через прокси: плодов '+got);
ok((await p.evaluate(()=>Object.values(myGarden.basket).reduce((a,b)=>a+b,0)))===got,'корзина сошлась');
await b.close();
