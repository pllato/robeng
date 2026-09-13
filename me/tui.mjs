// Панель ресурсов, персонажи-торговцы, курсор и кнопки телепорта.
import { chromium } from 'playwright';
import { execSync } from 'child_process';
const acc = JSON.parse(execSync('node setup.mjs').toString().trim().split('\n').pop());
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{width:1280,height:760} });
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,200)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
await p.addInitScript(t=>localStorage.setItem('me_token',t), acc.studentToken);
await p.goto('http://localhost:8642',{waitUntil:'load'});
await p.waitForTimeout(1500);
await p.evaluate(()=>{ const g=document.getElementById('spGo'); if(g&&g.offsetParent) g.click(); });
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true); });
ok((await p.evaluate(()=>getComputedStyle(document.getElementById('gardenHud')).display))==='none','в лобби панели сада нет');
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(2600);
await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true); });
await p.waitForTimeout(900);
const hud = await p.evaluate(()=>({vis:getComputedStyle(document.getElementById('gardenHud')).display,
  top:document.getElementById('ghTop').textContent, seeds:document.getElementById('ghSeeds').textContent}));
ok(hud.vis!=='none','панель сада видна');
ok(/🪙/.test(hud.top),'баланс на виду: "'+hud.top.trim()+'"');
ok(/×1/.test(hud.seeds),'семена на виду: "'+hud.seeds.trim()+'"');
ok((await p.evaluate(()=>getComputedStyle(document.getElementById('gardenNav')).display))!=='none','кнопки перехода видны');

// телепорт
await p.evaluate(()=>{ const {sx,sz,H}=gardenOrigin(), P=window.game.P; P.x=sx; P.z=sz-40; P.y=H+1; P.vx=P.vy=P.vz=0; });
await p.waitForTimeout(500);
await p.evaluate(()=>document.querySelector('#gardenNav button[data-go="shop"]').click());
await p.waitForTimeout(700);
let near = await p.evaluate(()=>{const h=eval('hintNear'); return h?h.act:null;});
ok(near==='shop','кнопка «Киоск» перенесла прямо к продавцу семян');
await p.evaluate(()=>document.querySelector('#gardenNav button[data-go="sell"]').click());
await p.waitForTimeout(700);
near = await p.evaluate(()=>{const h=eval('hintNear'); return h?h.act:null;});
ok(near==='sell','кнопка «Лавка» перенесла к скупщице');
await p.evaluate(()=>document.querySelector('#gardenNav button[data-go="plot"]').click());
await p.waitForTimeout(700);
ok(await p.evaluate(()=>{ const c=plotPos(myPlotIndex()), P=window.game.P;
  return Math.abs(P.x-c.x)<=eval('PLOT_RX') && Math.abs(P.z-c.z)<=eval('PLOT_RZ'); }),'кнопка «Мой участок» вернула домой');

// разговор с торговцами
await p.evaluate(()=>{ const {sx,sz,H}=gardenOrigin(), P=window.game.P; P.x=sx-3; P.z=sz+11.5; P.y=H+1; P.vx=P.vy=P.vz=0; });
await p.waitForTimeout(700);
await p.evaluate(()=>window.game.doInteract());
await p.waitForTimeout(800);
const npc1 = await p.evaluate(()=>({open:!document.getElementById('mNpc').hidden,
  who:document.getElementById('npcWho').textContent, line:document.getElementById('npcLine').textContent,
  go:document.getElementById('npcGo').textContent}));
ok(npc1.open,'разговор с продавцом семян открылся');
ok(/Семён/.test(npc1.who),'это персонаж: '+npc1.who.trim());
ok(npc1.line.length>10,'он говорит: «'+npc1.line.trim()+'»');
await p.evaluate(()=>document.getElementById('npcGo').click());
await p.waitForTimeout(900);
ok((await p.evaluate(()=>!document.getElementById('mShop').hidden)),'из разговора попали в киоск: "'+npc1.go.trim()+'"');
await p.evaluate(()=>document.getElementById('shopClose').click());
await p.waitForTimeout(500);
await p.evaluate(()=>{ const {sx,sz,H}=gardenOrigin(), P=window.game.P; P.x=sx+3; P.z=sz+11.5; P.y=H+1; P.vx=P.vy=P.vz=0; });
await p.waitForTimeout(700);
await p.evaluate(()=>window.game.doInteract());
await p.waitForTimeout(800);
const npc2 = await p.evaluate(()=>({who:document.getElementById('npcWho').textContent, line:document.getElementById('npcLine').textContent}));
ok(/Груша/.test(npc2.who),'скупщица плодов: '+npc2.who.trim());
ok(/Корзина пустая/.test(npc2.line),'она видит пустую корзину: «'+npc2.line.trim()+'»');
await p.evaluate(()=>document.getElementById('npcBye').click());
await p.waitForTimeout(400);

// курсор виден всегда, отдельного режима больше нет
ok(await p.evaluate(()=>eval('dragMode')),'курсор виден всегда — мышь не захватывается');
ok(!(await p.evaluate(()=>!!document.getElementById('curBtn'))),'кнопки переключения курсора нет');
await p.screenshot({path:'g-ui.png'});
await b.close();
