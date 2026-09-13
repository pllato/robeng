// Путь ученика с аккаунтом: сад → посадка → зона сбора → мир занятия → посадка снова.
// Именно на этом пути игрок жаловался «не смог посадить».
import { chromium } from 'playwright';
import { execSync } from 'child_process';
const acc = JSON.parse(execSync('node setup.mjs').toString().trim().split('\n').pop());
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{width:1100,height:620} });
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,180)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);

await p.addInitScript(t=>localStorage.setItem('me_token',t), acc.studentToken);
await p.goto('http://localhost:8642',{waitUntil:'load'});
await p.waitForTimeout(1400);
await p.evaluate(()=>{ const g=document.getElementById('spGo'); if(g&&g.offsetParent) g.click(); });
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true);
  window.__t=[]; const o=eval('toast'); eval('toast = m=>{ window.__t.push(m); return ('+o.toString()+')(m); }'); });
await p.waitForTimeout(700);
ok(await p.evaluate(()=>!!eval('USER')),'вошли с аккаунтом: '+await p.evaluate(()=>{const u=eval('USER');return u?u.name:'—';}));

const plant = async (bed) => {
  await p.evaluate(()=>{ const {sx,sz,H}=gardenOrigin(), P=window.game.P; P.x=sx-3; P.z=sz+11.5; P.y=H+1; P.vx=P.vy=P.vz=0; });
  await p.waitForTimeout(600);
  await p.evaluate(()=>window.game.doInteract());                    // разговор с продавцом семян
  await p.waitForTimeout(800);
  await p.evaluate(()=>document.getElementById('npcGo').click());     // → киоск
  await p.waitForTimeout(1200);
  await p.evaluate(()=>{ const el=document.querySelector('#shopList button[data-take]'); if(el) el.click(); });
  await p.waitForTimeout(600);
  const mi = await p.evaluate(()=>myPlotIndex());
  await p.evaluate(b=>{ const q=bedPos(myPlotIndex(),b), P=window.game.P;
    P.x=q.x+2; P.z=q.z+2; P.y=q.y; P.vx=P.vy=P.vz=0; }, bed);
  await p.waitForTimeout(800);
  await p.evaluate(()=>window.game.doInteract());
  await p.waitForTimeout(2200);
  return { mi, tree: await p.evaluate(b=>!!bedAt(b), bed) };
};

// 1. общий сад
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(2000);
await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true); });
let r = await plant(0);
ok(r.mi>=0,'участок в общем саду выдан (#'+r.mi+')');
ok(r.tree,'засеял грядку в общем саду');

// 2. лобби → зона сбора → отдельный мир занятия
await p.evaluate(()=>eval("sendWS({t:'switch',code:'LOBBY'})"));
await p.waitForFunction(()=>window.game.code()==='LOBBY',null,{timeout:20000});
await p.waitForTimeout(1800);
await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true);
  const z=eval('partyZone'), P=window.game.P; P.x=(z.x0+z.x1)/2; P.z=(z.z0+z.z1)/2; P.vx=P.vy=P.vz=0; });
await p.waitForTimeout(1500);
await p.evaluate(()=>window.game.doInteract());
await p.waitForFunction(()=>window.game.code()!=='LOBBY',null,{timeout:20000});
await p.waitForTimeout(2400);
await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true); });
const code = await p.evaluate(()=>window.game.code());
ok((await p.evaluate(()=>eval('roomKind')))==='garden','мир занятия '+code+' — улица огородов');
ok((await p.evaluate(()=>!!bedAt(0))),'грядка из общего сада приехала вместе с игроком');

// 3. ту же тему второй раз посадить нельзя — сервер обязан назвать причину
await p.evaluate(()=>{ window.__t=[]; });
const grown = await p.evaluate(()=>bedAt(0).lesson);
await p.evaluate(id=>eval(`sendWS({t:'garden',act:'plant',bed:2,lesson:'${id}'})`), grown);
await p.waitForTimeout(1500);
let toasts = await p.evaluate(()=>window.__t);
ok(toasts.some(t=>/уже растёт|нет в сумке/.test(t)),'вторую грядку той же темой не занять: '+JSON.stringify(toasts.filter(t=>/⚠/.test(t))));

// 4. и на занятую грядку тоже
await p.evaluate(()=>{ window.__t=[]; });
await p.evaluate(id=>eval(`sendWS({t:'garden',act:'plant',bed:0,lesson:'${id}'})`), grown);
await p.waitForTimeout(1500);
toasts = await p.evaluate(()=>window.__t);
ok(toasts.some(t=>/уже растёт/.test(t)),'сервер назвал причину отказа: '+JSON.stringify(toasts.filter(t=>/⚠/.test(t))));
ok(!toasts.some(t=>/старой версии|не ответил/.test(t)),'ложное «сервер не ответил» больше не показывается');

// 5. заборы на месте
const fence = await p.evaluate(()=>{ const c=plotPos(myPlotIndex()), RX=eval('PLOT_RX'), RZ=eval('PLOT_RZ'), H=c.y-1; let n=0;
  for(let x=c.x-RX;x<=c.x+RX;x++){ if(world[idx(x,H+1,c.z-RZ)]===5)n++; if(world[idx(x,H+1,c.z+RZ)]===5)n++; }
  return n; });
ok(fence>=2*(2*await p.evaluate(()=>eval('PLOT_RX'))+1)-2,'забор вокруг участка целый ('+fence+' брёвен)');
await p.screenshot({path:'treg.png'});
await b.close();
