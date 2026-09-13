// Обрыв связи: телефон заснул, сокет умер. Игра обязана это показать и сама вернуться в строй.
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
ok((await p.evaluate(()=>myGarden.coins))===271,'до обрыва: 271 монета и полная корзина');

// телефон заснул — сокет закрылся
await p.evaluate(()=>eval('ws').close());
await p.waitForTimeout(400);
const down=await p.evaluate(()=>({rs:eval('ws').readyState,
  ban:(()=>{const e=document.getElementById('netOff'); return e?getComputedStyle(e).display:'нет плашки';})()}));
ok(down.ban!=='none' && down.ban!=='нет плашки', `игра честно говорит об обрыве (плашка: ${down.ban})`);

// сама возвращается в строй, без перезагрузки
await p.waitForFunction(()=>eval('ws').readyState===1,null,{timeout:15000}).catch(()=>{});
await p.waitForTimeout(2500);
const up=await p.evaluate(()=>({rs:eval('ws').readyState, code:window.game.code(),
  coins:myGarden.coins, basket:JSON.stringify(myGarden.basket),
  ban:(()=>{const e=document.getElementById('netOff'); return e?getComputedStyle(e).display:'нет плашки';})()}));
ok(up.rs===1,'связь восстановилась сама');
ok(up.code==='GARDEN',`игрок остался в своём мире: ${up.code}`);
ok(up.ban==='none','плашка обрыва убралась');
ok(up.coins===271,`сад вернулся целым: ${up.coins} монет, корзина ${up.basket}`);
ok(/38/.test(up.basket),'корзина не потерялась при переподключении');

// и теперь продажа доходит до сервера
await p.evaluate(()=>openSell()); await p.waitForTimeout(700);
await p.evaluate(()=>document.getElementById('sellGo').click());
await p.waitForTimeout(1800);
const sold=await p.evaluate(()=>({coins:myGarden.coins,basket:JSON.stringify(myGarden.basket),
  hud:(document.getElementById('ghTop')||{}).textContent||''}));
ok(sold.coins>271,`после обрыва продажа прошла: ${sold.coins} монет (было 271)`);
ok(sold.basket==='{}','корзина очистилась');
ok(sold.hud.includes(String(sold.coins)),`в шапке новое число: «${sold.hud.trim()}»`);

// а действие, нажатое ПОКА связи нет, не должно пропасть
await p.evaluate(()=>eval(`sendWS({t:'garden',act:'restore',garden:{coins:50,
  seeds:{},openW:{},open:{'starter-01':1},beds:{},basket:{'starter-01':4},
  done:{},crops:{},cropsW:{}}})`));
await p.waitForTimeout(1200);
await p.evaluate(()=>eval('ws').close());
await p.waitForTimeout(300);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'sell'})"));
await p.waitForFunction(()=>eval('ws').readyState===1,null,{timeout:15000}).catch(()=>{});
await p.waitForTimeout(3000);
const late=await p.evaluate(()=>({coins:myGarden.coins,basket:JSON.stringify(myGarden.basket)}));
ok(late.coins>50 && late.basket==='{}', `нажатие в момент обрыва не пропало: ${late.coins} монет, корзина ${late.basket}`);
await p.screenshot({path:'g-b35-net.png'});
await b.close();
