// Прогрессия: два обычных урожая → хватает монет → открывается и покупается необычное семя.
import { chromium } from 'playwright';
import { execSync } from 'child_process';
const acc = JSON.parse(execSync('node setup.mjs').toString().trim().split('\n').pop());
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{width:1100,height:640} });
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,200)));
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
const G=()=>p.evaluate(()=>eval('myGarden'));
const atKiosk=async()=>{ await p.evaluate(()=>{ const {sx,sz,H}=gardenOrigin(), P=window.game.P; P.x=sx-2; P.z=sz+8; P.y=H+1; P.vx=P.vy=P.vz=0; }); await p.waitForTimeout(600); };
const atShop =async()=>{ await p.evaluate(()=>{ const {sx,sz,H}=gardenOrigin(), P=window.game.P; P.x=sx+2; P.z=sz+8; P.y=H+1; P.vx=P.vy=P.vz=0; }); await p.waitForTimeout(600); };

await p.addInitScript(t=>localStorage.setItem('me_token',t), acc.studentToken);
await p.goto('http://localhost:8642',{waitUntil:'load'});
await p.waitForTimeout(1500);
await p.evaluate(()=>{ const g=document.getElementById('spGo'); if(g&&g.offsetParent) g.click(); });
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true); });
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(2500);
await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true); });

async function harvestBed(bed){
  await atKiosk(); await p.evaluate(()=>window.game.doInteract()); await p.waitForTimeout(700);
  await p.evaluate(()=>{const b=document.getElementById('npcGo'); if(b&&!document.getElementById('mNpc').hidden) b.click();}); await p.waitForTimeout(1000);
  await p.evaluate(()=>{ const b=document.querySelector('#shopList button[data-take]'); if(b) b.click(); });
  await p.waitForTimeout(600);
  await p.evaluate(n=>{ const q=bedPos(myPlotIndex(),n), P=window.game.P; P.x=q.x+2; P.z=q.z+2; P.y=q.y; P.vx=P.vy=P.vz=0; }, bed);
  await p.waitForTimeout(700);
  await p.evaluate(()=>window.game.doInteract());
  await p.waitForTimeout(1600);
  await p.waitForFunction(n=>bedAt(n)&&ripeWords(bedAt(n)).length>0, bed, {timeout:20000});
  await p.evaluate(n=>{ const q=bedPos(myPlotIndex(),n), P=window.game.P; P.x=q.x+2; P.z=q.z+2; P.y=q.y; P.vx=P.vy=P.vz=0; }, bed);
  await p.waitForTimeout(700);
  const ws = await p.evaluate(n=>bedAt(n).words.map(w=>w.word), bed);
  let got=0;
  got = await harvestAll(p,0);
  return got;
}

ok(await harvestBed(0)===8,'первый урожай собран');
ok(await harvestBed(1)===8,'второй урожай собран (другая тема)');
await atShop(); await p.evaluate(()=>window.game.doInteract()); await p.waitForTimeout(700);
  await p.evaluate(()=>{const b=document.getElementById('npcGo'); if(b&&!document.getElementById('mNpc').hidden) b.click();}); await p.waitForTimeout(900);
await p.evaluate(()=>document.getElementById('sellGo').click());
await p.waitForTimeout(1200);
let g = await G();
ok(g.coins>=80,'после двух урожаев монет: '+g.coins);
ok((g.done['0']|0)===2,'обычных тем закрыто: '+(g.done['0']|0));

await atKiosk(); await p.evaluate(()=>window.game.doInteract()); await p.waitForTimeout(700);
  await p.evaluate(()=>{const b=document.getElementById('npcGo'); if(b&&!document.getElementById('mNpc').hidden) b.click();}); await p.waitForTimeout(1000);
await p.evaluate(()=>{ const b=[...document.querySelectorAll('#shopLevels button')].find(x=>x.dataset.l==='A1'); if(b) b.click(); });
await p.waitForTimeout(600);
const btn = await p.evaluate(()=>{const b=document.querySelector('#shopList button'); return {txt:b.textContent.trim(), off:b.disabled};});
ok(!btn.off && /купить 60/.test(btn.txt),'необычное семя открылось и по карману: "'+btn.txt+'"');
await p.evaluate(()=>{ const b=document.querySelector('#shopList button[data-buy]'); if(b) b.click(); });
await p.waitForTimeout(1400);
g = await G();
const bought = Object.keys(g.seeds).find(id=>/a1/.test(id));
ok(g.coins>=0 && !!bought,`куплено «${bought}», осталось ${g.coins} 🪙`);
ok(!!(await p.evaluate(()=>eval('seedInHand'))),'купленное семя сразу в руке');

// А2 всё ещё заперто — нужен урожай необычной темы
await p.evaluate(()=>{ const b=[...document.querySelectorAll('#shopLevels button')].find(x=>x.dataset.l==='A2'); if(b) b.click(); });
await p.waitForTimeout(500);
const a2 = await p.evaluate(()=>document.querySelector('#shopList button').textContent);
ok(/🔒/.test(a2),'редкое пока закрыто — сначала вырасти необычное');
await p.screenshot({path:'g-loop2.png'});
await b.close();
