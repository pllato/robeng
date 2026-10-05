// Жалоба Платона: «что-то со связью, иногда не работает, иногда работает».
// Самый злой случай — сокет-зомби: браузер держит его открытым, send() не падает,
// а до сервера не доходит ничего. Проверяем, что нажатие в этом случае НЕ теряется:
// игра сама замечает тишину, переподключается и доносит действие до сервера.
import { chromium, devices } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx=await b.newContext({...devices['iPhone 13'],viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const p=await ctx.newPage();
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,200)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
await p.addInitScript(()=>{
  class FakeSR{ start(){ window.__SR=this; } stop(){ if(this.onend) this.onend(); } abort(){ this.stop(); } }
  window.SpeechRecognition=FakeSR; window.webkitSpeechRecognition=FakeSR;
  const sp=window.speechSynthesis; if(sp) sp.speak=()=>{};
});
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1400);
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.waitForTimeout(2200);

await p.evaluate(()=>eval(`sendWS({t:'garden',act:'restore',garden:{coins:271,
  seeds:{},openW:{'starter-01#apple':1},open:{'starter-01':1},
  beds:{},basket:{'starter-01':38},done:{'0':5},crops:{'starter-01':5},cropsW:{}}})`));
await p.waitForTimeout(1400);
ok(await p.evaluate(()=>myGarden.coins)===271,'сад поднят: 271 монета, в корзине 38 яблок');
ok(await p.evaluate(()=>eval('ackSeen'))===true,'сервер объявил, что подтверждает действия');
ok(await p.evaluate(()=>eval('outbox.size'))===0,'исходящие пусты: всё подтверждено');

// ── делаем сокет зомби: open, send() молчит, до сервера не доходит ничего ──
await p.evaluate(()=>eval("ws.send=function(){}"));
ok(await p.evaluate(()=>eval('ws.readyState'))===1,'сокет притворяется живым (readyState=1)');

await p.evaluate(()=>eval("sendWS({t:'garden',act:'sell'})"));
await p.waitForTimeout(600);
ok(await p.evaluate(()=>eval('outbox.size'))===1,'продажа легла в исходящие и ждёт подтверждения');
ok(await p.evaluate(()=>myGarden.coins)===271,'монет пока столько же — сервер действие не получил');

// ── теперь игра обязана выкарабкаться сама ──
await p.waitForFunction(()=>myGarden.coins>271,null,{timeout:20000})
  .then(()=>ok(true,'игра сама переподключилась и донесла продажу до сервера'))
  .catch(()=>ok(false,'ПРОДАЖА ПОТЕРЯНА: монеты так и не пришли'));
const st=await p.evaluate(()=>({coins:myGarden.coins,basket:JSON.stringify(myGarden.basket),
  out:eval('outbox.size'), banner:(document.getElementById('netOff')||{}).textContent||''}));
console.log('       монет после восстановления:',st.coins,'корзина:',st.basket);
ok(st.coins>271,`монеты зачислены: ${st.coins}`);
ok(st.basket==='{}','корзина очищена');
ok(st.out===0,'исходящие пусты: подтверждение получено');
ok(!/Нет связи/.test(st.banner),'баннер «нет связи» убран');

// ── повтор не должен применяться дважды ──
const before=st.coins;
await p.evaluate(()=>eval(`sendWS({t:'garden',act:'restore',garden:{coins:500,
  seeds:{},openW:{'starter-01#apple':1},open:{'starter-01':1},
  beds:{},basket:{'starter-01':10},done:{'0':5},crops:{'starter-01':5},cropsW:{}}})`));
await p.waitForTimeout(1200);
const mid=await p.evaluate(()=>myGarden.coins);
const raw=await p.evaluate(()=>{ const aid=eval('nextAid()');
  const s=JSON.stringify({t:'garden',act:'sell',aid});
  eval('ws.send(s)'); return s; });
await p.waitForTimeout(1200);
const one=await p.evaluate(()=>myGarden.coins);
await p.evaluate(s=>eval('ws.send(s)'),raw);   // то же действие с тем же номером — это повтор
await p.waitForTimeout(1200);
const two=await p.evaluate(()=>myGarden.coins);
console.log('       было',mid,'после продажи',one,'после повтора того же номера',two);
ok(one>mid,'продажа применилась');
ok(two===one,'повтор с тем же номером денег второй раз не начислил');
await b.close();
