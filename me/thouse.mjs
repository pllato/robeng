import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport:{width:1100,height:620} });
const p = await ctx.newPage();
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,180)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const enter = async () => {
  await p.goto('http://localhost:8642',{waitUntil:'load'});
  await p.waitForTimeout(1200); await p.click('#spGo');
  await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
  await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true); });
  await p.waitForTimeout(700);
  await p.evaluate(()=>{ const sp=eval('spawnPt'), P=window.game.P; P.x=sp.x-8.6; P.z=sp.z-5; P.y=sp.y; P.vx=P.vy=P.vz=0; });
  await p.waitForTimeout(600);
  await p.evaluate(()=>window.game.doInteract());
  await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
  await p.waitForTimeout(1800);
  await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true); });
};
await enter();
// вырастить и собрать
await p.evaluate(()=>{ const q=gardenBedPos(0), P=window.game.P; P.x=q.x+2.2; P.z=q.z+2.2; P.y=q.y; P.vx=P.vy=P.vz=0; });
await p.waitForTimeout(700);
await p.evaluate(()=>window.game.doInteract());
await p.waitForTimeout(800);
const w=(await p.evaluate(()=>gardenPlantAt(0))).word;
for(let i=0;i<3;i++){ await p.evaluate(x=>window.game.checkWord(x),w); await p.waitForTimeout(600); }
await p.evaluate(()=>window.game.doInteract());
await p.waitForTimeout(900);
const h=await p.evaluate(()=>eval('gardenHarvest'));
ok(!!h[w], `собрал «${w}» → он в теплице: ${JSON.stringify(h[w]&&{reps:h[w].reps})}`);
ok((await p.evaluate(()=>eval('potWhen')(eval('Object.keys(gardenHarvest)[0]')))).includes('свежее'),
   'сразу после сбора слово свежее: '+await p.evaluate(()=>eval('potWhen')(Object.keys(eval('gardenHarvest'))[0])));

// смотрим теплицу
await p.evaluate(()=>{ const {sx,sz,H}=gardenOrigin(), P=window.game.P;
  P.x=sx+.5; P.z=sz-3; P.y=H+2; P.yaw=Math.PI; P.pitch=0.05; P.vx=P.vy=P.vz=0; });
await p.waitForTimeout(1500);
await p.screenshot({path:'g-house.png'});

// «прошла неделя» — слово подвяло
await p.evaluate(x=>localStorage.setItem('me_garden_guest', JSON.stringify({garden:{}, harvest:{[x]:{reps:1,due:Date.now()-1000}}})), w);
await enter();
ok(await p.evaluate(x=>potDue(x), w), 'через неделю слово подвяло');
ok((await p.evaluate(x=>potWhen(x),w)).includes('пора полить'), 'подпись: '+await p.evaluate(x=>potWhen(x),w));
await p.evaluate(()=>{ const q=potPos(0), P=window.game.P; P.x=q.x+.5; P.z=q.z+1.6; P.y=q.y; P.vx=P.vy=P.vz=0; });
await p.waitForTimeout(800);
const near=await p.evaluate(()=>{ const n=eval('hintNear'); return n&&n.act+':'+n.word; });
ok(near==='pot:'+w, 'стою у горшка: '+near);
const s0=await p.evaluate(()=>window.game.taskState().stars);
await p.evaluate(x=>window.game.checkWord(x), w);
await p.waitForTimeout(900);
const after=await p.evaluate(x=>({ it:eval('gardenHarvest')[x], due:potDue(x), when:potWhen(x) }), w);
ok(after.it && after.it.reps===2 && !after.due, `повторил → повтор ${after.it&&after.it.reps}, ${after.when}`);
ok((await p.evaluate(()=>window.game.taskState().stars))>s0, 'за повторение начислена звезда');
await p.evaluate(()=>{ const {sx,sz,H}=gardenOrigin(), P=window.game.P;
  P.x=sx+.5; P.z=sz-3; P.y=H+2; P.yaw=Math.PI; P.pitch=0.05; P.vx=P.vy=P.vz=0; });
await p.waitForTimeout(1200);
await p.screenshot({path:'g-house2.png'});
await b.close();
