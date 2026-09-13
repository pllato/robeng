// Поражение: минус растение, возврат на огород, босс вернётся только после новой посадки
import { chromium } from 'playwright';
import { restoreBossGarden } from './bossgard.mjs';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p=await b.newPage({viewport:{width:1000,height:660}});
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,170)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const G=()=>p.evaluate(()=>eval('myGarden'));
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1400);
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(2300);
await restoreBossGarden(p,{extra:{seeds:{'starter-02#corn':1}}});   // семя в сумке — им и позовём босса заново
await p.evaluate(()=>{ const q=bedPos(myPlotIndex(),0), P=window.game.P; P.x=q.x+.5; P.z=q.z+3; });
await p.waitForTimeout(600);
for(let i=0;i<4;i++){
  const left=await p.evaluate(()=>ripeWords(bedAt(0)));
  if(!left.length) break;
  await p.evaluate(w=>window.game.checkWord(w), left[0]);
  await p.waitForTimeout(400);
}
await p.waitForTimeout(1200);
let g=await G();
ok(!!g.boss, 'босс пришёл');
await p.evaluate(()=>{const g=document.getElementById('biGo'); if(g) g.click();}); await p.waitForTimeout(700);
const plantsBefore=Object.values(g.beds).reduce((a,b)=>a+(b.words||[]).length,0);
ok(plantsBefore>=10, `на участке ${plantsBefore} растений — сад, к которому приходит босс`);

// стоим вплотную и не сопротивляемся
await p.evaluate(()=>{ window.__t=[]; const o=eval('toast'); eval('toast = m=>{ window.__t.push(m); return ('+o.toString()+')(m); }'); });
for(let i=0;i<40;i++){
  const bs=await p.evaluate(()=>eval('bossServer'));
  if(bs) await p.evaluate(pt=>{ const P=window.game.P; P.x=pt.x; P.z=pt.z; }, bs);
  if(!(await G()).boss) break;
  await p.waitForTimeout(500);
}
g=await G();
ok(!g.boss, 'жизни кончились — босс ушёл');
const plantsAfter=Object.values(g.beds).reduce((a,b)=>a+(b.words||[]).length,0);
ok(plantsAfter===plantsBefore-1, `минус одно растение: было ${plantsBefore}, стало ${plantsAfter}`);
const msgs=await p.evaluate(()=>window.__t);
ok(msgs.some(m=>/одолел/.test(m)), 'игрок понял, что проиграл: «'+(msgs.find(m=>/одолел/.test(m))||'—')+'»');
ok(!(await p.evaluate(()=>document.documentElement.classList.contains('fight'))), 'режим боя выключился');

// босс не возвращается сам — нужна новая посадка
await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(900);
ok(!(await G()).boss, 'сам он не вернулся');
await p.evaluate(()=>eval("sendWS({t:'garden',act:'plant',bed:2,lesson:'starter-02#corn'})"));
await p.waitForTimeout(1400);
g=await G();
ok(!!g.boss, 'посадил заново — босс вернулся');
await b.close();
