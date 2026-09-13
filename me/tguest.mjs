// Ребёнок посадил грядку, вышел и вернулся — сад должен быть на месте.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport:{width:1100,height:640} });   // общий контекст = общий localStorage
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);

async function enter(){
  const p = await ctx.newPage();
  p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,160)));
  await p.goto('http://localhost:8642',{waitUntil:'load'});
  await p.waitForTimeout(1200);
  await p.evaluate(()=>{ const g=document.getElementById('spGo'); if(g&&g.offsetParent) g.click(); });
  await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
  await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true); });
  await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
  await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
  await p.waitForTimeout(2000);
  return p;
}
const G=p=>p.evaluate(()=>eval('myGarden'));

// ---- первый вход
let p = await enter();
let g = await G(p);
// первое семя лежит не в сумке, а в киоске — берём его там
ok(!!g && !Object.keys(g.seeds).length && Object.keys(g.openW||{}).length===1,
   'гостю открыт киоск с подарочным семенем: '+Object.keys(g.openW||{}).join(','));
await p.evaluate(()=>openShop()); await p.waitForTimeout(1000);
await p.evaluate(()=>document.querySelector('#shopGrid .seedCard[data-buy]').click());
await p.waitForTimeout(1200);
await p.evaluate(()=>closeShop()); await p.waitForTimeout(500);
g = await G(p);
ok(Object.keys(g.seeds).length===1, 'семя из киоска легло в сумку: '+Object.keys(g.seeds||{}).join(','));
const seed = Object.keys(g.seeds)[0];
await p.evaluate(id=>eval(`sendWS({t:'garden',act:'plant',bed:0,lesson:'${id}'})`), seed);
await p.waitForTimeout(1200);
g = await G(p);
ok(!!g.beds['0'], 'грядка 0 засеяна: '+(g.beds['0']?g.beds['0'].theme:'НЕТ'));
console.log('      открытых семян:', Object.keys(g.openW||{}).length, '· монет:', g.coins);
// сад больше не лежит в браузере: аккаунт заводится молча, а грядки хранит сервер по ключу
const tok = await p.evaluate(()=>localStorage.getItem('me_token'));
ok(!!tok && tok.length>=16, 'браузер сохранил ключ от сада (аккаунт завёлся молча)');
await p.close();

// ---- второй вход, тот же браузер
p = await enter();
g = await G(p);
ok(!!(g.beds && g.beds['0']), 'ПОСЛЕ ПЕРЕЗАХОДА грядка на месте: '+(g.beds&&g.beds['0']?g.beds['0'].theme:'ПРОПАЛА'));
ok(Object.keys(g.openW||{}).length>0, 'открытые семена сохранились: '+Object.keys(g.openW||{}).join(', '));
console.log('      семена:',JSON.stringify(g.seeds),'· монеты:',g.coins,'· gifted:',g.gifted);
await b.close();
