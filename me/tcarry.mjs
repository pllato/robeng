// Огород должен ехать с игроком: в групповой мир, в класс и обратно
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
async function player(guest){
  const ctx=await b.newContext({viewport:{width:960,height:620}});
  const p=await ctx.newPage();
  p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,160)));
  await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1300);
  if(guest){                       // без аккаунта: сад живёт в соединении
    await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
    await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
  } else {
    await p.evaluate(()=>{const g=document.getElementById('spGo'); if(g&&g.offsetParent) g.click();});
    await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
  }
  await p.evaluate(()=>{window.game.setPaused(false);});
  await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
  await p.waitForTimeout(2400);
  return p;
}
const beds=p=>p.evaluate(()=>{ const g=eval('myGarden');
  return Object.entries(g.beds||{}).map(([k,b])=>k+':'+(b.words||[]).map(w=>w.word).join('/')).sort(); });
const purse=p=>p.evaluate(()=>{ const g=eval('myGarden'); return {coins:g.coins|0, seeds:Object.keys(g.seeds||{}).length}; });

const GUEST = process.argv[2]==='guest';
const A=await player(GUEST);
ok(GUEST ? !(await A.evaluate(()=>!!eval('USER'))) : !!(await A.evaluate(()=>!!eval('USER'))),
   GUEST?'играем гостем, без аккаунта':`аккаунт заведён: ${await A.evaluate(()=>eval('USER').name)}`);

// растим настоящий огород: берём семя, сажаем, повторяем
await A.evaluate(()=>openShop()); await A.waitForTimeout(900);
await A.evaluate(()=>{const c=document.querySelector('#shopGrid .seedCard[data-buy]'); if(c) c.click();});
await A.waitForTimeout(1200); await A.evaluate(()=>closeShop()); await A.waitForTimeout(500);
await A.evaluate(()=>eval("sendWS({t:'garden',act:'plant',bed:0,lesson:Object.keys(myGarden.seeds)[0]})"));
await A.waitForTimeout(1300);
const home=await beds(A);
ok(home.length>0, `на огороде выросло: ${home.join(' · ')}`);
const money=await purse(A);

// ── уходим в класс ──
await A.evaluate(()=>eval("sendWS({t:'switch',code:'ENPY'})"));
await A.waitForFunction(()=>window.game.code()==='ENPY',null,{timeout:20000});
await A.waitForTimeout(2200);
await A.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await A.waitForTimeout(900);
let now=await beds(A);
ok(JSON.stringify(now)===JSON.stringify(home), `в классе огород тот же: ${now.join(' · ')||'ПУСТО'}`);

// ── групповой мир через зону сбора в лобби ──
await A.evaluate(()=>eval("sendWS({t:'switch',code:'LOBBY'})"));
await A.waitForFunction(()=>window.game.code()==='LOBBY',null,{timeout:20000});
await A.waitForTimeout(2200);
await A.evaluate(()=>{ const z=eval('partyZone'), P=window.game.P;
  P.x=(z.x0+z.x1)/2+0.5; P.z=(z.z0+z.z1)/2+0.5; });
await A.waitForTimeout(1200);
await A.evaluate(()=>{ const z=eval('partyZone');
  sendWS({t:'party', x0:z.x0, z0:z.z0, x1:z.x1, z1:z.z1}); });
await A.waitForTimeout(3000);
const code=await A.evaluate(()=>window.game.code());
ok(code!=='LOBBY' && code!=='GARDEN', `улетели в групповой мир: ${code}`);
// важнее всего: участок должен приехать уже в первом же пакете мира, без доп. запросов
const atOnce=await A.evaluate(()=>{ const i=myPlotIndex(), p=(eval('plots')||[])[i];
  return p ? Object.keys(p.beds||{}).length : -1; });
ok(atOnce>0, `участок приехал сразу с миром: грядок ${atOnce}`);
await A.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await A.waitForTimeout(1000);
now=await beds(A);
ok(JSON.stringify(now)===JSON.stringify(home), `и там огород тот же: ${now.join(' · ')||'ПУСТО'}`);
const m2=await purse(A);
ok(m2.coins===money.coins && m2.seeds===money.seeds,
   `монеты и семена на месте: ${m2.coins} 🪙, семян ${m2.seeds}`);
// грядка видна на своём участке, а не пустой
const drawn=await A.evaluate(()=>{ const i=myPlotIndex(); if(i<0) return -1;
  return Object.keys(myGarden.beds||{}).length; });
ok(drawn>0, `на своём участке в групповом мире грядок: ${drawn}`);

// ── и обратно домой ──
await A.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await A.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await A.waitForTimeout(2200);
await A.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await A.waitForTimeout(900);
now=await beds(A);
ok(JSON.stringify(now)===JSON.stringify(home), `вернулись — огород цел: ${now.join(' · ')||'ПУСТО'}`);
await b.close();
