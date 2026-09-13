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
await p.evaluate(()=>gardenGo('shop'));
await p.waitForTimeout(700);
await p.evaluate(()=>window.game.doInteract());
await p.waitForTimeout(800);
console.log('диалог открыт:', await p.evaluate(()=>!document.getElementById('mNpc').hidden));
await p.evaluate(()=>document.getElementById('npcGo').click());
await p.waitForTimeout(1200);
console.log('киоск открыт:', await p.evaluate(()=>!document.getElementById('mShop').hidden),
            'кнопок take:', await p.evaluate(()=>document.querySelectorAll('#shopList button[data-take]').length));
await p.evaluate(()=>{ const el=document.querySelector('#shopList button[data-take]'); if(el) el.click(); });
await p.waitForTimeout(700);
console.log('seedInHand:', await p.evaluate(()=>{const s=eval('seedInHand'); return s?s.id:null;}), 'paused:', await p.evaluate(()=>eval('paused')));
await p.evaluate(()=>{ const q=bedPos(myPlotIndex(),0), P=window.game.P; P.x=q.x+.5; P.z=q.z+7.5; P.y=q.y; P.vx=P.vy=P.vz=0; });
await p.waitForTimeout(900);
console.log('hintNear:', await p.evaluate(()=>{const h=eval('hintNear'); return h?JSON.stringify({act:h.act,plot:h.plot,bed:h.bed}):null;}),
            'pos:', await p.evaluate(()=>{const P=window.game.P;return [+P.x.toFixed(1),+P.y.toFixed(1),+P.z.toFixed(1)];}));
await p.evaluate(()=>window.game.doInteract());
await p.waitForTimeout(2000);
console.log('bedAt(0):', await p.evaluate(()=>!!bedAt(0)));
await b.close();
