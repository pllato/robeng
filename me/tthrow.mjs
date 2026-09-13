// Правильное слово — плод летит в босса, попадает, брызги и число урона
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
// босс приходит только к большому огороду и после нескольких дней работы
await restoreBossGarden(p);
await p.evaluate(()=>{ const q=bedPos(myPlotIndex(),0), P=window.game.P; P.x=q.x+.5; P.z=q.z+3; });
await p.waitForTimeout(600);
for(let i=0;i<4;i++){ const l=await p.evaluate(()=>ripeWords(bedAt(0)));
  if(!l.length) break; await p.evaluate(w=>window.game.checkWord(w), l[0]); await p.waitForTimeout(430); }
await p.waitForTimeout(1200);
await p.evaluate(()=>{const g=document.getElementById('biGo'); if(g) g.click();}); await p.waitForTimeout(900);
let g=await G();
ok(!!g.boss, `босс пришёл: ${g.boss.max} жизней`);
const max=g.boss.max;

// оглушаем киркой
for(let i=0;i<10;i++){
  await p.evaluate(()=>{ const bs=eval('bossServer'); if(bs){const P=window.game.P; P.x=bs.x+1.2; P.z=bs.z+1.2;} });
  await p.evaluate(()=>eval("sendWS({t:'garden',act:'bossHit'})")); await p.waitForTimeout(380);
  if((await G()).boss.stage==='stun') break;
}
ok((await G()).boss.stage==='stun','босс ослаб');

// пережидаем окно супер-удара, чтобы удар не оказался сразу смертельным —
// иначе не успеть разглядеть полёт и брызги
await p.waitForTimeout(4200);
// говорим слово — плод должен полететь
const hp0=(await G()).boss.hp;
await p.evaluate(()=>window.game.checkWord('apple'));
await p.waitForTimeout(90);
const inFlight=await p.evaluate(()=>window.game.bossShots());
ok(inFlight.length>0, `плод в полёте: ${JSON.stringify(inFlight[0])}`);
ok(inFlight[0].t<1, `он ещё летит (пройдено ${Math.round(inFlight[0].t*100)}% пути)`);
// летит заметное время, а не мгновенно
await p.waitForTimeout(200);
const mid=await p.evaluate(()=>window.game.bossShots());
ok(mid.length>0 && mid[0].t>inFlight[0].t, `плод продвинулся: ${inFlight[0].t} → ${mid.length?mid[0].t:'долетел'}`);
// долетел — брызги и число урона
await p.waitForTimeout(900);
const pops=await p.evaluate(()=>window.game.dmgPops());
ok(pops.length>0 && /^−\d+$/.test(pops[0]), `над боссом всплыло число урона: «${pops[0]||'—'}»`);
g=await G();
const dmg=hp0-g.boss.hp;
ok(dmg>0, `урон нанесён: ${dmg}`);
ok(dmg>=Math.floor(max*0.45), `обычное попадание сносит больше половины: ${dmg} из ${max}`);
// второе попадание — и он побеждён
for(let i=0;i<10;i++){
  const gg=await G(); if(!gg.boss) break;
  if(gg.boss.stage!=='stun'){
    await p.evaluate(()=>{ const bs=eval('bossServer'); if(bs){const P=window.game.P; P.x=bs.x+1.2; P.z=bs.z+1.2;} });
    await p.evaluate(()=>eval("sendWS({t:'garden',act:'bossHit'})")); await p.waitForTimeout(360); continue;
  }
  await p.evaluate(()=>eval("sendWS({t:'garden',act:'bossWord',word:'apple'})")); await p.waitForTimeout(420);
}
g=await G();
ok(!g.boss && (g.bossDone|0)===1, 'вторым словом босс побеждён');
await b.close();
