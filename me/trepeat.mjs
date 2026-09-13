// Одинаковые семена можно докупать и сажать на несколько грядок
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p=await b.newPage({viewport:{width:1050,height:680}});
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,160)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const G=()=>p.evaluate(()=>eval('myGarden'));
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1400);
// входим гостем (без «Войти»), чтобы поднять сад с монетами одним сообщением
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(2400);

const id='starter-01#apple';
await p.evaluate(x=>eval(`sendWS({t:'garden',act:'restore',garden:{coins:99,seeds:{'${x}':1},openW:{'${x}':1},beds:{},basket:{},done:{},open:{},crops:{},cropsW:{}}})`), id);
await p.waitForTimeout(1200);
ok((await p.evaluate(()=>eval('myGarden.coins')))===99, 'сад поднят: 99 монет и одно семя');
await p.evaluate(()=>openShop()); await p.waitForTimeout(1000);
const more=await p.evaluate(()=>!!document.querySelector('#shopGrid .seedCard.own .seedMore'));
ok(more, 'у семени в рюкзаке есть кнопка «+» — докупить такое же');

// докупаем через сервер (кнопка шлёт то же сообщение)
await p.evaluate(x=>eval(`sendWS({t:'garden',act:'buy',lesson:'${x}'})`), id);
await p.waitForTimeout(1100);
let g=await G();
ok((g.seeds[id]|0)===2, `в рюкзаке уже два одинаковых семени: ×${g.seeds[id]|0}`);

// сажаем оба — на разные грядки
await p.evaluate(x=>eval(`sendWS({t:'garden',act:'plant',bed:0,lesson:'${x}'})`), id);
await p.waitForTimeout(900);
await p.evaluate(x=>eval(`sendWS({t:'garden',act:'plant',bed:1,lesson:'${x}'})`), id);
await p.waitForTimeout(1100);
g=await G();
const beds=Object.entries(g.beds).map(([k,b])=>`${k}:${b.theme}`);
ok(Object.keys(g.beds).length===2, `одно слово растёт на двух грядках: ${beds.join(', ')}`);
ok(g.beds['0'].seed===g.beds['1'].seed, 'и это действительно одно и то же семя');
await b.close();
