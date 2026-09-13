import { chromium } from 'playwright';
const ST=process.argv[2];
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport:{width:1100,height:640} });
const p = await ctx.newPage();
await p.addInitScript(t=>localStorage.setItem('me_token',t), ST);
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,180)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
await p.goto('http://localhost:8642',{waitUntil:'load'});
await p.waitForTimeout(1500);
await p.click('#spGo');
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true); });
await p.waitForTimeout(1200);
ok((await p.evaluate(()=>window.game.code()))==='LOBBY','ученик в лобби');

// подходим к стойке сада
await p.evaluate(()=>{ const sp=eval('spawnPt'), P=window.game.P;
  P.x=sp.x-8.6; P.z=sp.z-5; P.y=sp.y; P.vy=0; P.yaw=Math.atan2(-1,0); P.pitch=0.05; });
await p.waitForTimeout(700);
const near=await p.evaluate(()=>{ const h=eval('hintNear'); return h&&h.act; });
ok(near==='garden','стойка «Английский сад» найдена в лобби, подсказка: '+near);
await p.screenshot({path:'g-stand.png'});

await p.evaluate(()=>window.game.doInteract());
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(2000);
await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true); });
ok(true,'телепорт в сад сработал, мир: '+await p.evaluate(()=>window.game.code()));

const toBed=async i=>{ await p.evaluate(n=>{ const b=gardenBedPos(n), P=window.game.P;
  P.x=b.x+2.2; P.z=b.z+2.2; P.y=b.y; P.vy=0; }, i); await p.waitForTimeout(700); };
await toBed(0);
ok((await p.evaluate(()=>{const h=eval('hintNear'); return h&&h.act;}))==='bed','стою у грядки');

await p.evaluate(()=>window.game.doInteract());
await p.waitForTimeout(900);
let pl=await p.evaluate(()=>gardenPlantAt(0));
ok(pl&&pl.stage===0,'посадил: '+JSON.stringify(pl));

for(let i=1;i<=3;i++){
  await p.evaluate(w=>window.game.checkWord(w), pl.word);
  await p.waitForTimeout(700);
  pl=await p.evaluate(()=>gardenPlantAt(0));
  ok(pl&&pl.stage===i, `полил произношением ${i} раз → стадия ${pl&&pl.stage}`);
}
await p.waitForTimeout(600);
await p.evaluate(()=>{ const b=gardenBedPos(0), P=window.game.P;
  P.x=b.x+5.5; P.z=b.z+5.5; P.y=b.y+2; P.yaw=Math.atan2(b.x-P.x,-(b.z-P.z)); P.pitch=0.1; });
await p.waitForTimeout(1500);
await p.screenshot({path:'g-ripe.png'});

const starsBefore=await p.evaluate(()=>window.game.taskState().stars);
await p.evaluate(()=>{ const b=gardenBedPos(0), P=window.game.P; P.x=b.x+2.2; P.z=b.z+2.2; P.y=b.y; });
await p.waitForTimeout(700);
await p.evaluate(()=>window.game.doInteract());
await p.waitForTimeout(900);
const after=await p.evaluate(()=>({ plant:gardenPlantAt(0), stars:window.game.taskState().stars }));
ok(after.plant===null, 'урожай собран, грядка снова пустая');
ok(after.stars>starsBefore, `звёзды: ${starsBefore} → ${after.stars}`);

// сажаем ещё несколько для картинки
for(let i=1;i<=5;i++){ await toBed(i); await p.evaluate(()=>window.game.doInteract()); await p.waitForTimeout(400);
  const q=await p.evaluate(n=>gardenPlantAt(n), i);
  for(let k=0;k<i%4;k++){ await p.evaluate(w=>window.game.checkWord(w), q.word); await p.waitForTimeout(350); } }
await p.evaluate(()=>{ const sp=eval('spawnPt'), P=window.game.P;
  P.x=sp.x+1; P.z=sp.z+16; P.y=sp.y+7; P.yaw=0; P.pitch=0.35; P.fly=true; P.vy=0; });
await p.waitForTimeout(2000);
await p.screenshot({path:'g-overview.png'});
await b.close();
