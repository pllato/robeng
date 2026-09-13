// Повтор жалобы: «сорвал плод, к тётушке Груше сдаю — кнопку жму, а деньги не приходят»
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

const L='ABCDEFGHJKLMNPQRSTUVWXYZ', CODE=Array.from({length:4},()=>L[Math.floor(Math.random()*L.length)]).join('');
const CLASS = process.argv[2]==='class';
if(CLASS){
  await p.evaluate(c=>eval(`sendWS({t:'switch',code:'${c}'})`),CODE);
  await p.waitForFunction(c=>window.game.code()===c,CODE,{timeout:20000});
  await p.waitForTimeout(2000);
}
console.log('       мир:', await p.evaluate(()=>window.game.code()));

// сад с полной корзиной — ровно как на скриншоте Платона
await p.evaluate(()=>eval(`sendWS({t:'garden',act:'restore',garden:{coins:271,
  seeds:{},openW:{'starter-01#apple':1},open:{'starter-01':1},
  beds:{},basket:{'starter-01':38},done:{'0':5},crops:{'starter-01':5},cropsW:{}}})`));
await p.waitForTimeout(1200);
let st=await p.evaluate(()=>({coins:myGarden.coins,basket:JSON.stringify(myGarden.basket)}));
ok(st.coins===271, `монет на входе: ${st.coins}`);
ok(/38/.test(st.basket), `в корзине: ${st.basket}`);

await p.evaluate(()=>openSell());
await p.waitForTimeout(900);
const ui=await p.evaluate(()=>({
  vis:getComputedStyle(document.getElementById('mSell')).display,
  go:document.getElementById('sellGo').textContent,
  goVis:getComputedStyle(document.getElementById('sellGo')).display,
  list:document.getElementById('sellList').textContent.replace(/\s+/g,' ').trim().slice(0,140) }));
ok(ui.vis!=='none','экран лавки открылся');
ok(ui.goVis!=='none',`кнопка видна: «${ui.go}»`);
console.log('       список:',ui.list);
await p.screenshot({path:'g-b34-sell-screen.png'});

const bx=await p.evaluate(()=>{const r=document.getElementById('sellGo').getBoundingClientRect();
  return {x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)};});
await p.touchscreen.tap(bx.x,bx.y).catch(e=>console.log('tap fail',e.message));
await p.waitForTimeout(1600);
st=await p.evaluate(()=>({coins:myGarden.coins,basket:JSON.stringify(myGarden.basket),
  toast:(document.getElementById('toast')||{}).textContent||'',
  hud:(document.getElementById('ghTop')||{}).textContent||'',
  hud2:(document.getElementById('hudCoins')||{}).textContent||''}));
ok(st.coins>271, `после продажи монет: ${st.coins} (было 271)`);
ok(st.basket==='{}', `корзина очищена: ${st.basket}`);
console.log('       тост:',st.toast);
console.log('       на экране сверху:',JSON.stringify(st.hud),JSON.stringify(st.hud2));
ok(st.hud.includes(String(st.coins)), `в шапке показано новое число монет: «${st.hud.trim()}»`);
await p.screenshot({path:'g-b34-sell-after.png'});
await b.close();
