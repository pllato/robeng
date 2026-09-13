import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p=await b.newPage({viewport:{width:900,height:600}});
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,200)));
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1400);
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(2200);
console.log(await p.evaluate(()=>{
  const g=eval('myGarden');
  g.boss={i:17,hp:100,max:200,stage:'rage',meter:0,need:3};
  const sp=bossSpot();
  const V=[]; pushBossMesh(V,{i:17,x:sp.x,z:sp.z,yaw:0});
  let miny=1e9,maxy=-1e9;
  for(let i=0;i<V.length;i+=9){ miny=Math.min(miny,V[i+1]); maxy=Math.max(maxy,V[i+1]); }
  return { bossHere:bossHere(), spot:sp, boxes:V.length/9/4, yFrom:+miny.toFixed(2), yTo:+maxy.toFixed(2),
           playerY:+window.game.P.y.toFixed(2), gardenH:gardenOrigin().H };
}));
await b.close();
