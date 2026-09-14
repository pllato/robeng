// Жалоба: «ничего кроме яблок собрать не могу» — проверяем каждое слово темы
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p=await b.newPage({viewport:{width:1100,height:760}});
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,200)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
await p.addInitScript(()=>{
  window.__err=[];
  class F{ start(){window.__SR=this;} stop(){ if(this.onend) this.onend(); } abort(){this.stop();} }
  window.SpeechRecognition=F; window.webkitSpeechRecognition=F;
  const sp=window.speechSynthesis; if(sp) sp.speak=()=>{};
});
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1400);
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.waitForTimeout(2400);
await p.evaluate(()=>eval("pixiDismiss()"));
await p.evaluate(()=>{ const o=eval('toast'); window.__t=[];
  eval('toast = m=>{ window.__t.push(m); return ('+o.toString()+')(m); }'); });
const W=['apple','banana','orange','pear'];
const seeds={}, openW={};
for(const w of W){ seeds['starter-01#'+w]=1; openW['starter-01#'+w]=1; }
await p.evaluate(o=>eval(`sendWS({t:'garden',act:'restore',garden:{coins:5,
  seeds:${JSON.stringify(o.seeds)}, openW:${JSON.stringify(o.openW)},
  beds:{},basket:{},done:{},open:{},crops:{},cropsW:{}}})`), {seeds,openW});
await p.waitForTimeout(900);
// каждое слово на свою грядку — как у ребёнка
for(let i=0;i<W.length;i++){
  await p.evaluate(o=>eval(`sendWS({t:'garden',act:'plant',bed:${o.i},lesson:'starter-01#${o.w}'})`), {i,w:W[i]});
  await p.waitForTimeout(500);
}
await p.waitForTimeout(9600);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(900);
for(let i=0;i<W.length;i++){
  const r=await p.evaluate(n=>{const b=myGarden.beds[String(n)]; return b?(b.ripe||[]).slice():[];}, i);
  ok(r.length>0, `грядка ${i}: созрело ${r.length} × ${W[i]}`);
}
// подходим к каждой грядке, тыкаем в плод и говорим его слово
for(let i=0;i<W.length;i++){
  await p.evaluate(n=>{ const q=bedPos(myPlotIndex(),n), P=window.game.P;
    P.x=q.x+.5; P.z=q.z+5; P.y=q.y; P.yaw=0; P.pitch=0.22; }, i);
  await p.waitForTimeout(800);
  const f=await p.evaluate(w=>{ const list=myRipeFruits().filter(x=>x.word===w);
    if(!list.length) return {err:'плода не видно'};
    const pt=project(lastMVP,list[0].x,list[0].y+list[0].s*2,list[0].z);
    return pt?{x:Math.round(pt[0]),y:Math.round(pt[1]),bed:list[0].bed}:{err:'не проецируется'}; }, W[i]);
  if(f.err){ ok(false, `${W[i]}: ${f.err}`); continue; }
  const started=await p.evaluate(pt=>pickStart(pt.x,pt.y), f);
  const held=await p.evaluate(()=>holdFruit?{w:holdFruit.word,bed:holdFruit.bed}:null);
  ok(started && held && held.w===W[i], `${W[i]}: взял в руку (${JSON.stringify(held)})`);
  await p.waitForFunction(()=>eval('listening')||!eval('holdFruit'),null,{timeout:6000}).catch(()=>{});
  await p.evaluate(()=>{ window.__t.length=0; });
  const got=await p.evaluate(w=>window.game.checkWord(w), W[i]);
  await p.waitForTimeout(1100);
  const msgs=await p.evaluate(()=>window.__t);
  ok(got===true, `${W[i]}: сорван${got?'':' — НЕТ. Игра сказала: '+JSON.stringify(msgs)}`);
  await p.evaluate(()=>pickDone());
}
const basket=await p.evaluate(()=>Object.values(myGarden.basket||{}).reduce((a,b)=>a+b,0));
ok(basket===W.length, `в корзине ${basket} плодов из ${W.length}`);
await b.close();
