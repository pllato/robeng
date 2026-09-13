// Экономика: у каждой темы своя цена, урожай окупает семя, редкое открывается и стоит дорого.
import { chromium } from 'playwright';
import { execSync } from 'child_process';
const acc = JSON.parse(execSync('node setup.mjs').toString().trim().split('\n').pop());
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{width:1200,height:700} });
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
await p.addInitScript(t=>localStorage.setItem('me_token',t), acc.studentToken);
await p.goto('http://localhost:8642',{waitUntil:'load'});
await p.waitForTimeout(1500);
await p.evaluate(()=>{ const g=document.getElementById('spGo'); if(g&&g.offsetParent) g.click(); });
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true); });
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(2600);
await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true); });

let g = await G();
ok(Object.keys(g.seeds).length===1 && g.coins===0, `на старте: ${Object.keys(g.seeds).length} семени и ${g.coins} монет`);
await p.evaluate(()=>gardenGo('shop')); await p.waitForTimeout(600);
await p.evaluate(()=>window.game.doInteract()); await p.waitForTimeout(700);
await p.evaluate(()=>document.getElementById('npcGo').click()); await p.waitForTimeout(1100);
const rows = await p.evaluate(()=>[...document.querySelectorAll('#shopRowsProbe, #shopList .shopRow')].map(r=>r.textContent.replace(/\s+/g,' ').trim()));
ok(rows.length===1,'в киоске видно только открытую тему: '+rows.length);
ok(!rows.some(r=>/бесплатно/.test(r)),'бесплатных семян не осталось');
const p1 = await p.evaluate(()=>{const it=shopIndex.find(x=>x.id==='starter-01'); return seedPrice(it);});
const p9 = await p.evaluate(()=>{const it=shopIndex.find(x=>x.id==='starter-09'); return seedPrice(it);});
ok(p9>p1, `внутри уровня темы дорожают: №1 = ${p1} 🪙, №9 = ${p9} 🪙`);
const pay = await p.evaluate(()=>{const it=shopIndex.find(x=>x.id==='starter-01'); return fruitPrice(it)*19;});
ok(pay>p1*1.8, `урожай окупает семя: ${pay} 🪙 против ${p1} 🪙`);
const a1 = await p.evaluate(()=>{const it=shopIndex.find(x=>x.id==='a1-01'); return seedPrice(it);});
const a2 = await p.evaluate(()=>{const it=shopIndex.find(x=>x.id==='a2-01'); return seedPrice(it);});
ok(a1>p1*3 && a2>a1*3, `редкость стоит дороже: обычное ${p1}, необычное ${a1}, редкое ${a2} 🪙`);
await p.screenshot({path:'g-shop-prices.png'});
await p.evaluate(()=>document.getElementById('shopClose').click());
await p.waitForTimeout(500);

// цикл: посадил → собрал → продал → купил следующее
const own = Object.keys(g.seeds)[0];
await p.evaluate(id=>{ const it=shopIndex.find(x=>x.id===id); eval('seedInHand='+JSON.stringify({id:'X'})); }, own);
await p.evaluate(()=>gardenGo('shop')); await p.waitForTimeout(500);
await p.evaluate(()=>window.game.doInteract()); await p.waitForTimeout(700);
await p.evaluate(()=>document.getElementById('npcGo').click()); await p.waitForTimeout(1000);
await p.evaluate(()=>{ const el=document.querySelector('#shopList button[data-take]'); if(el) el.click(); });
await p.waitForTimeout(700);
await p.evaluate(()=>{ const q=bedPos(myPlotIndex(),0), P=window.game.P; P.x=q.x+2; P.z=q.z+2; P.y=q.y; P.vx=P.vy=P.vz=0; });
await p.waitForTimeout(700);
await p.evaluate(()=>window.game.doInteract());
await p.waitForTimeout(1600);
ok(!!(await p.evaluate(()=>bedAt(0))),'грядка засеяна подаренным семенем');
const sc0 = await p.evaluate(()=>tierScale(bedAt(0).tier));
ok(sc0<=0.14, `обычное растение мелкое: кубик ${sc0} блока`);
await p.waitForFunction(()=>ripeWords(bedAt(0)).length>0,null,{timeout:20000});
const ws = await p.evaluate(()=>bedAt(0).words.map(w=>w.word));
await harvestAll(p,0);
await p.evaluate(()=>gardenGo('sell')); await p.waitForTimeout(600);
await p.evaluate(()=>window.game.doInteract()); await p.waitForTimeout(700);
await p.evaluate(()=>document.getElementById('npcGo').click()); await p.waitForTimeout(900);
await p.evaluate(()=>document.getElementById('sellGo').click());
await p.waitForTimeout(1200);
g = await G();
ok(g.coins>=p1, `после первого урожая монет ${g.coins} — хватает на следующее семя (${p1} 🪙)`);
await b.close();
