// Спутник — магическое животное: выбирается в персонаже, с ним можно поговорить
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
await p.waitForTimeout(2600);

const list=await p.evaluate(()=>eval('PETS_LIST').map(x=>x.n));
ok(list.length>=12, `магических зверей на выбор: ${list.length}`);
ok((await p.evaluate(()=>eval('petNow')().n))===list[0], `по умолчанию: ${list[0]}`);

// выбираем другого в конструкторе персонажа
await p.evaluate(()=>{ myAva=avaOf(Object.assign({},myAva,{pet:7})); sendWS({t:'setAvatar',ava:myAva}); });
await p.waitForTimeout(900);
ok((await p.evaluate(()=>eval('petNow')().n))===list[7], `выбрали другого: ${list[7]}`);

// он рисуется как зверь, а не как человечек
const verts=await p.evaluate(()=>{ const V=[]; pushPixi(V); return V.length; });
ok(verts>0, `модель зверя собрана: ${verts} чисел в меше`);

// к нему можно подойти и спросить, что делать
await p.evaluate(()=>{ const P=window.game.P; P.x=eval('pixiX'); P.z=eval('pixiZ')+1.5; });
await p.waitForTimeout(700);
const hint=await p.evaluate(()=>eval('hintNear')&&eval('hintNear').act);
ok(hint==='pixi', `рядом со спутником появляется подсказка «поговорить» (${hint})`);
const bar=await p.evaluate(()=>document.getElementById('hintBar').textContent);
ok(/спросить спутника/.test(bar), `в подсказке: «${bar.trim()}»`);
await p.evaluate(()=>window.game.doInteract());
await p.waitForTimeout(900);
const said=await p.evaluate(()=>eval('pixiSaid'));
ok(/Сейчас/.test(said||''), `спутник ответил, что делать: «${(said||'').slice(0,90)}…»`);
ok(/Потом/.test(said||''), 'и сказал, что будет дальше');
await p.screenshot({path:'g-b38-pet.png'});
await b.close();
