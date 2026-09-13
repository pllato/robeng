import { chromium } from 'playwright';
const ST=process.argv[2];
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{width:900,height:560} });
await p.addInitScript(t=>localStorage.setItem('me_token',t), ST);
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,200)));
p.on('console',m=>{ if(m.type()==='error') console.log('CONSOLE:',m.text().slice(0,150)); });
await p.goto('http://localhost:8642',{waitUntil:'load'});
await p.waitForTimeout(1500);
await p.click('#spGo');
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true);
  const w=eval('ws'); w.addEventListener('close',e=>{ window.__closed={code:e.code,reason:e.reason,wasClean:e.wasClean}; }); });
await p.evaluate(()=>{ const sp=eval('spawnPt'), P=window.game.P; P.x=sp.x-10.5; P.z=sp.z-4.5; P.y=sp.y; });
await p.waitForTimeout(600);
await p.evaluate(()=>window.game.doInteract());
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(1500);
await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true);
  const w=eval('ws'); w.addEventListener('close',e=>{ window.__closed={code:e.code,reason:e.reason,wasClean:e.wasClean}; }); });
for(let i=0;i<9;i++){
  await p.evaluate(n=>{ const b=gardenBedPos(n), P=window.game.P; P.x=b.x+2.2; P.z=b.z+2.2; P.y=b.y; P.vy=0; }, i);
  await p.waitForTimeout(450);
  await p.evaluate(()=>window.game.doInteract());
  await p.waitForTimeout(450);
  const st=await p.evaluate(()=>({ closed:window.__closed||null, rs:eval('ws').readyState, plants:Object.keys(gardenState||{}).length }));
  console.log('грядка',i,JSON.stringify(st));
  if(st.closed) break;
}
await b.close();
