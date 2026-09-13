import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{width:1100,height:620} });
const warns=[]; p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,160)));
// собираем всю грядку: на каждом кусте по 2–3 плода
async function harvestAll(page, bed){
  let got=0;
  for(let guard=0; guard<80; guard++){
    const left = await page.evaluate(n=>ripeWords(bedAt(n)), bed);
    if(!left.length) break;
    if(await page.evaluate(w=>window.game.checkWord(w), left[0])) got++;
    await page.waitForTimeout(360);
  }
  return got;
}
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
await p.goto('http://localhost:8642',{waitUntil:'load'});
await p.waitForTimeout(1300); await p.click('#spGo');           // ГОСТЬ, без аккаунта
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true);
  const o=eval('toast'); window.__t=[]; window.toast=function(m){ window.__t.push(m); return o(m); };
  try{ eval('toast = window.toast'); }catch(e){} });
await p.waitForTimeout(700);
ok(await p.evaluate(()=>!eval('USER')),'играем гостем, без аккаунта');

// зона сбора → мир занятия
await p.evaluate(()=>{ const z=eval('partyZone'), P=window.game.P;
  P.x=(z.x0+z.x1)/2; P.z=(z.z0+z.z1)/2; P.vx=P.vy=P.vz=0; });
await p.waitForTimeout(1600);
await p.evaluate(()=>window.game.doInteract());
await p.waitForFunction(()=>window.game.code()!=='LOBBY',null,{timeout:20000});
await p.waitForTimeout(2200);
await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true); });
ok((await p.evaluate(()=>eval('roomKind')))==='garden','гость попал на улицу огородов: '+await p.evaluate(()=>window.game.code()));
ok((await p.evaluate(()=>myPlotIndex()))>=0,'участок гостю выдан');

// киоск → семя → посадка
await p.evaluate(()=>{ const {sx,sz,H}=gardenOrigin(), P=window.game.P; P.x=sx-3; P.z=sz+11.5; P.y=H+1; P.vx=P.vy=P.vz=0; });
await p.waitForTimeout(700);
await p.evaluate(()=>window.game.doInteract());
await p.waitForTimeout(800);
await p.evaluate(()=>document.getElementById('npcGo').click());   // сначала разговор с дедом Семёном
await p.waitForTimeout(1200);
await p.click('#shopList button[data-take]');
await p.waitForTimeout(500);
await p.evaluate(()=>{ const q=bedPos(myPlotIndex(),0), P=window.game.P; P.x=q.x+2; P.z=q.z+2; P.y=q.y; P.vx=P.vy=P.vz=0; });
await p.waitForTimeout(800);
await p.evaluate(()=>window.game.doInteract());
await p.waitForTimeout(2200);
const tr=await p.evaluate(()=>bedAt(0));
ok(!!tr,'гость засеял грядку: '+JSON.stringify(tr&&tr.theme));
const t=await p.evaluate(()=>window.__t||[]);
ok(!t.some(x=>String(x).includes('старой версии')),'предупреждения о старом сервере нет');
ok(t.some(x=>String(x).includes('Посажено')),'подтверждение посадки пришло');

// растим до плода — проверяем, что рассылка по улице не стирает своё
await p.waitForFunction(()=>bedAt(0)&&ripeWords(bedAt(0)).length>0,null,{timeout:20000});
const grown=await p.evaluate(()=>bedAt(0));
const ripe=await p.evaluate(()=>ripeWords(bedAt(0)).length);
ok(ripe>=16, `грядка гостя выросла сама: созрело плодов ${ripe}`);
// собираем голосом — у гостя тоже должна расти корзина
const gw=await p.evaluate(()=>bedAt(0).words.map(w=>w.word));
await p.evaluate(()=>{ const q=bedPos(myPlotIndex(),0), P=window.game.P; P.x=q.x+2; P.z=q.z+2; P.y=q.y; P.vx=P.vy=P.vz=0; });
await p.waitForTimeout(700);
let got=0; got = await harvestAll(p,0);
ok(got>=16,'гость собрал урожай голосом: плодов '+got);
ok((await p.evaluate(()=>Object.values(myGarden.basket).reduce((a,b)=>a+b,0)))===got,'плоды у гостя в корзине: '+got);
await p.evaluate(()=>{ const c=plotPos(myPlotIndex()), P=window.game.P;
  P.x=c.x+.5; P.z=c.z+13; P.y=c.y+7; P.yaw=Math.PI; P.pitch=0.36; P.fly=true; P.vx=P.vy=P.vz=0; });
await p.waitForTimeout(1800);
await p.screenshot({path:'g-guestplot.png'});
await b.close();
