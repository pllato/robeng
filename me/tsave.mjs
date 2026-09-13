// Сад не теряется: аккаунт заводится сам, ссылка возвращает его на другом устройстве
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const NAME='Аня-'+Math.random().toString(36).slice(2,5);
async function fresh(url){                       // каждый раз чистый браузер = «другое устройство»
  const ctx=await b.newContext({viewport:{width:1050,height:660}});
  const p=await ctx.newPage();
  p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,160)));
  await p.goto(url,{waitUntil:'load'}); await p.waitForTimeout(1300);
  await p.evaluate(()=>{const g=document.getElementById('spGo'); if(g&&g.offsetParent) g.click();});
  await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
  await p.evaluate(()=>{window.game.setPaused(false);});
  await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
  await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
  await p.waitForTimeout(2300);
  return {ctx,p};
}
// ── первый заход: ничего не заполняли ──
let {ctx,p}=await fresh('http://localhost:8642');
const u=await p.evaluate(()=>eval('USER'));
ok(!!u && !!u.id, `аккаунт завёлся сам, без единой формы: ${u&&u.name}`);
ok(!!(await p.evaluate(()=>localStorage.getItem('me_token'))), 'ключ сохранён в браузере');

// сперва берём бесплатное семя в киоске, потом сажаем
await p.evaluate(()=>openShop()); await p.waitForTimeout(1100);
await p.evaluate(()=>document.querySelector('#shopGrid .seedCard[data-buy]').click());
await p.waitForTimeout(1100);
await p.evaluate(()=>closeShop()); await p.waitForTimeout(400);
const seed=Object.keys(await p.evaluate(()=>eval('myGarden.seeds')))[0];
await p.evaluate(id=>eval(`sendWS({t:'garden',act:'plant',bed:0,lesson:'${id}'})`), seed);
await p.waitForTimeout(1200);
ok(!!(await p.evaluate(()=>bedAt(0))), 'грядка засеяна');

// вписываем имя и берём ссылку
await p.evaluate(()=>openSave()); await p.waitForTimeout(500);
await p.evaluate(n=>{ document.getElementById('svName').value=n; }, NAME);
await p.evaluate(()=>document.getElementById('svDone').click());
await p.waitForTimeout(1000);
const link=await p.evaluate(()=>myLink());
ok(/#k=/.test(link), 'ссылка с ключом получена: '+link.replace(/#k=.*/,'#k=…'));
const named=await p.evaluate(()=>eval('USER').name);
ok(named===NAME, 'имя сохранено: '+named);

// текст для WhatsApp собирается
const wa=await p.evaluate(()=>waText());
ok(wa.includes(NAME)&&/#k=/.test(wa), 'сообщение для WhatsApp готово и содержит ссылку');
await ctx.close();

// ── другое устройство: открываем ту же ссылку в чистом браузере ──
({ctx,p}=await fresh(link));
const u2=await p.evaluate(()=>eval('USER'));
ok(u2 && u2.name===NAME, 'на другом устройстве вошли тем же ребёнком: '+(u2&&u2.name));
ok(!!(await p.evaluate(()=>bedAt(0))), 'и сад на месте — грядка та же');
ok(!/k=/.test(await p.evaluate(()=>location.hash)), 'ключ убран из адресной строки');
await ctx.close();

// ── чистый браузер без ссылки: это уже другой ребёнок, чужой сад не виден ──
({ctx,p}=await fresh('http://localhost:8642'));
const u3=await p.evaluate(()=>eval('USER'));
ok(u3 && u3.name!==NAME, 'без ссылки — новый сад, чужой не открылся');
await ctx.close();
await b.close();
