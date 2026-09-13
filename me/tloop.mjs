// Полный садовый цикл: подарок → посадка → рост сам → сбор голосом → лавка → редкое семя.
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

await p.addInitScript(t=>localStorage.setItem('me_token',t), acc.studentToken);
await p.goto('http://localhost:8642',{waitUntil:'load'});
await p.waitForTimeout(1500);
await p.evaluate(()=>{ const g=document.getElementById('spGo'); if(g&&g.offsetParent) g.click(); });
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true);
  window.__t=[]; const o=eval('toast'); eval('toast = m=>{ window.__t.push(m); return ('+o.toString()+')(m); }'); });
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(2500);
await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true); });

let g = await G();
ok(Object.keys(g.seeds).length===0 && g.coins===0,'старт: сумка пуста и 0 монет — первое семя надо взять в киоске');
ok((await p.evaluate(()=>eval('PLOT_BEDS')))===6,'грядок на участке: '+await p.evaluate(()=>eval('PLOT_BEDS')));

// киоск: редкие заперты
await p.evaluate(()=>{ const {sx,sz,H}=gardenOrigin(), P=window.game.P; P.x=sx-5; P.z=sz+11; P.y=H+1; P.vx=P.vy=P.vz=0; });
await p.waitForTimeout(700);
await p.evaluate(()=>window.game.doInteract());
await p.waitForTimeout(1400);
await p.evaluate(()=>{const b=document.getElementById('npcGo'); if(b&&!document.getElementById('mNpc').hidden) b.click();});
await p.waitForTimeout(1000);
ok((await p.evaluate(()=>document.getElementById('mShop').hidden))===false,'киоск открылся');
const lockedTabs = await p.evaluate(()=>[...document.querySelectorAll('#shopLevels button')].filter(b=>/🔒/.test(b.textContent)).map(b=>b.dataset.l));
ok(lockedTabs.length===3,'редкие уровни заперты: '+lockedTabs.join(', '));
const shopCards = await p.evaluate(()=>({
  free:[...document.querySelectorAll('#shopGrid .seedCard[data-buy] .pr')].filter(e=>/бесплатно/.test(e.textContent)).length,
  lock:document.querySelectorAll('#shopGrid .seedCard.lock').length }));
ok(shopCards.free===1 && shopCards.lock>0,
   `на прилавке подарочное семя (${shopCards.free}) и закрытые темы без цен (${shopCards.lock})`);
await p.evaluate(()=>{ const b=document.querySelector('#shopGrid .seedCard[data-buy]'); if(b) b.click(); });
await p.waitForTimeout(1200);
await p.evaluate(()=>{ const b=document.querySelector('#shopGrid .seedCard[data-take]'); if(b) b.click(); });
await p.waitForTimeout(700);
const seed = await p.evaluate(()=>eval('seedInHand'));
ok(!!seed,'семя в руке: '+(seed&&(seed.theme||seed.id)));

// посадка
await p.evaluate(()=>{ const q=bedPos(myPlotIndex(),0), P=window.game.P; P.x=q.x+2; P.z=q.z+2; P.y=q.y; P.vx=P.vy=P.vz=0; });
await p.waitForTimeout(800);
await p.evaluate(()=>window.game.doInteract());
await p.waitForTimeout(1800);
ok(!!(await p.evaluate(()=>bedAt(0))),'грядка засеяна');
const words = await p.evaluate(()=>bedAt(0).words.map(w=>w.word));
ok(words.length>=1,'на грядке: '+words.join(', '));
ok((await p.evaluate(()=>ripeWords(bedAt(0)).length))===0,'сразу после посадки урожая нет');

// рост сам по себе
console.log('  … ждём, пока вырастет само');
await p.waitForFunction(()=>ripeWords(bedAt(0)).length>0,null,{timeout:20000});
const grew = await p.evaluate(()=>ripeWords(bedAt(0)).length);
ok(grew>=1,'выросло само, без единого нажатия: созрело плодов '+grew);

// сбор голосом
await p.evaluate(()=>{ const q=bedPos(myPlotIndex(),0), P=window.game.P; P.x=q.x+2; P.z=q.z+2; P.y=q.y; P.vx=P.vy=P.vz=0; });
await p.waitForTimeout(800);
let picked=0;
picked = await harvestAll(p,0);
ok(picked>=1,'собрано голосом плодов: '+picked);
g = await G();
ok(Object.values(g.basket).reduce((a,b)=>a+b,0)===picked,'плоды в корзине: '+JSON.stringify(g.basket));
ok((g.done['0']|0)===1,'урожай темы зачтён (открывает следующую редкость)');
const cyc = await p.evaluate(()=>bedAt(0).cycle);
const wait2 = await p.evaluate(()=>secsLeft(bedAt(0)));
ok(cyc===1 && wait2>=800,`куст ушёл на повторение: круг ${cyc}, следующий урожай через ${Math.round(wait2/60)} мин`);

// лавка плодов
await p.evaluate(()=>gardenGo('sell'));
await p.waitForTimeout(700);
await p.evaluate(()=>window.game.doInteract());
await p.waitForTimeout(800);
const npcLine = await p.evaluate(()=>document.getElementById('npcLine').textContent);
ok(/дам за них \d+ монет/.test(npcLine),'скупщица сама называет цену: «'+npcLine.trim()+'»');
await p.evaluate(()=>document.getElementById('npcGo').click());
await p.waitForTimeout(900);
ok((await p.evaluate(()=>document.getElementById('mSell').hidden))===false,'из разговора попали в лавку');
const sellTxt = await p.evaluate(()=>document.getElementById('sellGo').textContent);
await p.evaluate(()=>document.getElementById('sellGo').click());
await p.waitForTimeout(1200);
g = await G();
ok(g.coins>=1 && !Object.keys(g.basket).length,`сдал урожай: "${sellTxt.trim()}" → монет ${g.coins}, корзина пуста`);
await p.screenshot({path:'g-loop.png'});
await b.close();
