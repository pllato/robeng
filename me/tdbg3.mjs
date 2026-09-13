import { chromium } from 'playwright';
import { execSync } from 'child_process';
const acc = JSON.parse(execSync('node setup.mjs').toString().trim().split('\n').pop());
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{width:1100,height:640} });
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,200)));
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
console.log('прилавки:', JSON.stringify(await p.evaluate(()=>eval('interactables').filter(a=>a.act==='shop'||a.act==='sell').map(a=>({act:a.act,x:a.x,z:a.z,r:a.r})))));
for(const go of ['shop','sell']){
  await p.evaluate(g=>gardenGo(g), go);
  await p.waitForTimeout(900);
  const st = await p.evaluate(()=>{ const P=window.game.P; const h=eval('hintNear');
    return {x:+P.x.toFixed(2), z:+P.z.toFixed(2), y:+P.y.toFixed(2), near:h?h.act:null,
      d:eval('interactables').filter(a=>a.act==='shop'||a.act==='sell').map(a=>a.act+':'+Math.hypot(P.x-a.x,P.z-a.z).toFixed(2)+' dy='+Math.abs(P.y-a.y).toFixed(2))}; });
  console.log(go, '→', JSON.stringify(st));
}
await b.close();
