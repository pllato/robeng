// Можно ли досаживать в грядки, которые уже есть у игрока
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p=await b.newPage({viewport:{width:1000,height:640}});
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,160)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const G=()=>p.evaluate(()=>eval('myGarden'));
const msgs=()=>p.evaluate(()=>window.__d||[]);
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1400);
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(2200);
await p.evaluate(()=>{ window.__d=[]; const o=eval('toast'); eval('toast = m=>{ window.__d.push(m); return ('+o.toString()+')(m); }'); });

// поднимаем сад, как у давнего игрока: грядка 0 — старая «вся тема», грядка 1 — из одного слова
await p.evaluate(()=>eval(`sendWS({t:'garden',act:'restore',garden:{coins:300,
  seeds:{'starter-01#banana':1,'starter-02#carrot':1},
  openW:{'starter-01#apple':1,'starter-01#banana':1,'starter-02#carrot':1},
  open:{'starter-01':1},
  beds:{'0':{seed:'starter-01',lesson:'starter-01',cycle:0,ripe:[],readyAt:Date.now()+60000},
        '1':{seed:'starter-01#apple',lesson:'starter-01',words:[{word:'apple'}],cycle:0,ripe:[],readyAt:Date.now()+60000}},
  basket:{},done:{},crops:{},cropsW:{}}})`));
await p.waitForTimeout(1200);
let g=await G();
ok((g.beds['0'].words||[]).length===8, `грядка 0 — старая «вся тема»: ${(g.beds['0'].words||[]).length} растений`);
ok((g.beds['1'].words||[]).length===1, `грядка 1 — из одного слова: ${(g.beds['1'].words||[]).map(w=>w.word).join(', ')}`);

// 1) досаживаем в грядку из одного слова — должно получиться
await p.evaluate(()=>eval("sendWS({t:'garden',act:'plant',bed:1,lesson:'starter-01#banana'})"));
await p.waitForTimeout(1000);
g=await G();
ok((g.beds['1'].words||[]).length===2, `в свою грядку досадилось: ${(g.beds['1'].words||[]).map(w=>w.word).join(', ')}`);

// 2) в полную грядку — отказ с понятной причиной
await p.evaluate(()=>{ window.__d=[]; });
await p.evaluate(()=>eval("sendWS({t:'garden',act:'buy',lesson:'starter-01#banana'})"));
await p.waitForTimeout(800);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'plant',bed:0,lesson:'starter-01#banana'})"));
await p.waitForTimeout(900);
let M=await msgs();
ok(M.some(m=>/полная/.test(m)), 'в полную грядку не пускает: «'+(M.find(m=>/полная/.test(m))||'—')+'»');

// 3) чужая тема на занятую грядку — отказ
await p.evaluate(()=>{ window.__d=[]; });
await p.evaluate(()=>eval("sendWS({t:'garden',act:'plant',bed:1,lesson:'starter-02#carrot'})"));
await p.waitForTimeout(900);
M=await msgs();
ok(M.some(m=>/той же темы/.test(m)), 'другую тему на занятую грядку не пускает: «'+(M.find(m=>/той же темы/.test(m))||'—')+'»');
g=await G();
ok((g.seeds['starter-02#carrot']|0)===1, 'и семя не пропало — осталось в сумке');

// 4) но на пустую грядку та же морковь садится свободно
await p.evaluate(()=>eval("sendWS({t:'garden',act:'plant',bed:2,lesson:'starter-02#carrot'})"));
await p.waitForTimeout(1000);
g=await G();
ok(!!g.beds['2'], `на свободную грядку села: ${(g.beds['2'].words||[]).map(w=>w.word).join(', ')}`);
await b.close();
