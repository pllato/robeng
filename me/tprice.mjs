// Кривая цен: начало мягкое, к середине курса — сотни тысяч и миллионы
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p=await b.newPage({viewport:{width:1000,height:760}});
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
await p.evaluate(()=>loadShopIndex()); await p.waitForTimeout(900);

const row=async id=>p.evaluate(x=>{ const it=(shopIndex||[]).find(y=>y.id===x);
  return it?{fruit:fruitPrice(it), seed:seedPrice(it)}:null; }, id);
const a=await row('starter-01'), b5=await row('starter-05'), c=await row('a1-12'), d=await row('a2-12'), e=await row('b1-12');
ok(a && a.fruit===2, `начало не тронуто: плод «Фрукты» стоит ${a&&a.fruit} 🪙`);
ok(b5 && b5.fruit<=6, `первые темы дешёвые: starter-05 плод ${b5&&b5.fruit} 🪙`);
ok(c && c.fruit>1000, `A1-12: плод ${c&&c.fruit} 🪙 — уже тысячи`);
ok(d && d.fruit>100000, `A2-12 (середина курса): плод ${d&&d.fruit} 🪙 — сотни тысяч`);
// последнее слово темы — самое дорогое: вот там уже миллионы
const last=await p.evaluate(()=>{ const it=(shopIndex||[]).find(y=>y.id==='a2-12');
  return Math.round(seedPrice(it)*(0.22+0.16*7)); });
ok(last>1000000, `последнее слово темы A2-12 стоит ${last} 🪙 — миллионы`);
ok(e && e.fruit>1000000, `B1-12: плод ${e&&e.fruit} 🪙`);

// большие числа читаются
const fmt=await p.evaluate(()=>[nfmt(6),nfmt(4300),nfmt(45501),nfmt(405702),nfmt(13572037),nfmt(1294721002)]);
ok(fmt[0]==='6'&&/тыс|млн|млрд/.test(fmt[3]), `числа показываются по-человечески: ${fmt.join(' · ')}`);
const coins=await p.evaluate(()=>[coinsWord(6),coinsWord(1268495)]);
ok(/монет/.test(coins[0]) && /млн/.test(coins[1]), `в тексте: «${coins[0]}» и «${coins[1]}»`);

// сервер и клиент считают одинаково
await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(800);
const sw=await p.evaluate(()=>(eval('shopWords')||[]).map(w=>({word:w.word,price:w.price,fruit:w.fruit})));
const mine=await p.evaluate(()=>{ const it=(shopIndex||[]).find(y=>y.id==='starter-01'); return fruitPrice(it); });
ok(sw.length && sw[0].fruit===mine, `цены сервера и клиента сходятся: плод ${sw[0].fruit} = ${mine}`);
await p.evaluate(()=>openShop()); await p.waitForTimeout(1200);
await p.screenshot({path:'g-b45-shop.png'});
await b.close();
