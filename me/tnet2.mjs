// Обрыв связи у ученика с аккаунтом: сеанс должен собраться сам, монеты — лечь на счёт
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx=await b.newContext({viewport:{width:960,height:620}});
const p=await ctx.newPage();
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,200)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
await p.addInitScript(()=>{
  class FakeSR{ start(){ window.__SR=this; } stop(){ if(this.onend) this.onend(); } abort(){ this.stop(); } }
  window.SpeechRecognition=FakeSR; window.webkitSpeechRecognition=FakeSR;
  const sp=window.speechSynthesis; if(sp) sp.speak=()=>{};
});
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1300);
await p.evaluate(()=>{const g=document.getElementById('spGo'); if(g&&g.offsetParent) g.click();});
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(2400);
const who=await p.evaluate(()=>eval('USER')&&eval('USER').name);
ok(!!who, `аккаунт заведён: ${who}`);

// растим и срываем по-настоящему: семя → грядка → плод
await p.evaluate(()=>openShop()); await p.waitForTimeout(1100);
await p.evaluate(()=>{const c=document.querySelector('#shopGrid .seedCard[data-buy]'); if(c) c.click();});
await p.waitForTimeout(1200); await p.evaluate(()=>closeShop()); await p.waitForTimeout(400);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'plant',bed:0,lesson:Object.keys(myGarden.seeds)[0]})"));
await p.waitForTimeout(10000);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(900);
const ripe=await p.evaluate(()=>{ const b=myGarden.beds['0']; return b?(b.ripe||[]).slice():[]; });
ok(ripe.length>0, `на грядке созрело: ${ripe.join(', ')}`);
for(const w of ripe) await p.evaluate(x=>eval(`sendWS({t:'garden',act:'pick',bed:0,word:'${x}'})`),w);
await p.waitForTimeout(1200);
const before=await p.evaluate(()=>({coins:myGarden.coins, n:Object.values(myGarden.basket||{}).reduce((a,b)=>a+b,0)}));
ok(before.n===ripe.length, `в корзине ${before.n} плодов, монет ${before.coins}`);

// телефон заснул
await p.evaluate(()=>eval('ws').close());
await p.waitForTimeout(400);
ok(await p.evaluate(()=>getComputedStyle(document.getElementById('netOff')).display)!=='none',
   'плашка обрыва показана');
// ребёнок в это время жмёт «Сдать всё»
await p.evaluate(()=>openSell()); await p.waitForTimeout(500);
await p.evaluate(()=>document.getElementById('sellGo').click());
await p.waitForFunction(()=>eval('ws').readyState===1,null,{timeout:20000}).catch(()=>{});
await p.waitForTimeout(3500);
const after=await p.evaluate(()=>({coins:myGarden.coins, n:Object.values(myGarden.basket||{}).reduce((a,b)=>a+b,0),
  user:eval('USER')&&eval('USER').name, code:window.game.code(),
  ban:getComputedStyle(document.getElementById('netOff')).display,
  hud:(document.getElementById('ghTop')||{}).textContent||''}));
ok(after.user===who, `аккаунт остался тот же: ${after.user}`);
ok(after.code==='GARDEN', `мир тот же: ${after.code}`);
ok(after.ban==='none', 'плашка обрыва убралась');
ok(after.coins>before.coins, `монеты дошли до счёта: ${before.coins} → ${after.coins}`);
ok(after.n===0, 'корзина пуста — продажа прошла');
ok(after.hud.includes(String(after.coins)), `в шапке новое число: «${after.hud.trim()}»`);

// сад на сервере действительно обновился, а не только на экране
await p.reload({waitUntil:'load'}); await p.waitForTimeout(1800);
await p.evaluate(()=>{const g=document.getElementById('spGo'); if(g&&g.offsetParent) g.click();});
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.waitForTimeout(2600);
const back=await p.evaluate(()=>({coins:myGarden.coins,user:eval('USER')&&eval('USER').name}));
ok(back.user===who && back.coins===after.coins,
   `после перезахода монеты на месте: ${back.coins} у ${back.user}`);
await b.close();
