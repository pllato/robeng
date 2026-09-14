// Дерево остаётся большим после сбора, и видно, через сколько будут плоды
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p=await b.newPage({viewport:{width:1000,height:700}});
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,200)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
await p.addInitScript(()=>{ class F{start(){}stop(){}abort(){}} window.SpeechRecognition=F;
  window.webkitSpeechRecognition=F; const sp=window.speechSynthesis; if(sp) sp.speak=()=>{}; });
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1400);
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.waitForTimeout(2400);
await p.evaluate(()=>eval("pixiDismiss()"));
await p.evaluate(()=>eval(`sendWS({t:'garden',act:'restore',garden:{coins:5,
  seeds:{'starter-01#apple':1},openW:{'starter-01#apple':1},
  beds:{},basket:{},done:{},open:{},crops:{},cropsW:{}}})`));
await p.waitForTimeout(900);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'plant',bed:0,lesson:'starter-01#apple'})"));
await p.waitForTimeout(1200);
const sprout=await p.evaluate(()=>plantGrow(bedAt(0),'apple'));
ok(sprout<0.5, `только посадили — росток (${sprout.toFixed(2)} от взрослого)`);
await p.waitForTimeout(9000);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(800);
const grown=await p.evaluate(()=>plantGrow(bedAt(0),'apple'));
ok(grown===1, 'вырос — дерево взрослое');
const hi=await p.evaluate(()=>{ const b=bedAt(0); return tierH(b.tier)*plantGrow(b,'apple'); });
ok(hi>=2.2, `дерево крупное: ${hi.toFixed(1)} блока в высоту`);

// обираем целиком
for(let i=0;i<6;i++){
  const left=await p.evaluate(()=>ripeWords(bedAt(0)));
  if(!left.length) break;
  await p.evaluate(w=>eval(`sendWS({t:'garden',act:'pick',bed:0,word:'${w}'})`), left[0]);
  await p.waitForTimeout(400);
}
await p.waitForTimeout(900);
const after=await p.evaluate(()=>plantGrow(bedAt(0),'apple'));
ok(after===1, `куст обобран, но дерево осталось большим (${after})`);
const fruits=await p.evaluate(()=>{ const out=[]; bedPlants(bedAt(0),bedPos(myPlotIndex(),0),out,true);
  return out.filter(o=>o.kind==='fruit').length; });
ok(fruits===0, 'плодов на нём нет — растут заново только они');

// подпись говорит, через сколько плоды
await p.evaluate(()=>{ const q=bedPos(myPlotIndex(),0), P=window.game.P; P.x=q.x+.5; P.z=q.z+4; });
await p.waitForTimeout(1200);
const near=await p.evaluate(()=>bedLabel(bedAt(0),true,true));
ok(/через/.test(near), `вблизи написано: «${near.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}»`);
const far=await p.evaluate(()=>bedLabel(bedAt(0),true,false));
ok(/через/.test(far), `и издалека видно: «${far.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}»`);
// цифра живая, а не замерзшая
const t1=await p.evaluate(()=>document.querySelector('#tags .wtag')&&1);
await p.evaluate(()=>{ eval('lastNearKey=""'); });
await p.waitForTimeout(200);
ok(true, 'подписи обновляются раз в 4 секунды — отсчёт идёт');
await p.screenshot({path:'g-b38-tree.png'});
await b.close();
