// Босс — редкое событие: нужны и большой огород, и несколько дней работы. И валится с 1–2 слов.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p=await b.newPage({viewport:{width:1000,height:660}});
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,170)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const G=()=>p.evaluate(()=>eval('myGarden'));
import { restoreBossGarden } from './bossgard.mjs';
const fresh=(plants,days)=>restoreBossGarden(p,{plants,days});
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1400);
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(2300);
await p.evaluate(()=>{ const q=bedPos(myPlotIndex(),0), P=window.game.P; P.x=q.x+.5; P.z=q.z+3; });

const harvest=async()=>{ for(let i=0;i<9;i++){ const l=await p.evaluate(()=>bedAt(0)?ripeWords(bedAt(0)):[]);
  if(!l.length) break; await p.evaluate(w=>window.game.checkWord(w), l[0]); await p.waitForTimeout(330); }
  await p.waitForTimeout(900); };

// 1) маленький огород — босса нет, сколько бы дней ни прошло
await fresh(3, 30); await harvest();
let g=await G();
ok(!g.boss, `3 растения и 30 дней — босса нет (нужно ${(await p.evaluate(()=>window.game.bossNeed())).need} растений)`);

// 2) большой огород, но мало дней — тоже нет
await fresh(8, 1); await harvest();
g=await G();
ok(!g.boss, 'огород большой, но за один день босс не приходит');

// 3) девять растений — ещё рано, не хватает одного
await fresh(9, 6); await harvest();
g=await G();
ok(!g.boss, 'девять растений — на одно меньше нужного, босса нет');

// 4) и то и другое — приходит
await fresh(12, 6); await harvest();
g=await G();
const need=await p.evaluate(()=>window.game.bossNeed());
ok(!!g.boss, `12 растений за 6 дней → босс пришёл (порог: ${need.need} растений, ${need.needDays} дней)`);
if(!g.boss){ console.log('      DBG', JSON.stringify(need)); await b.close(); process.exit(0); }

// в меню написано, чего не хватало
const txt=await p.evaluate(()=>window.game.bossProgressText());
ok(/Босс уже на участке/.test(txt), `в меню: «${txt.replace(/\s+/g,' ').trim()}»`);

// 5) валится одним словом, если сказать сразу — супер-удар
const max=g.boss.max;
let words=0, crit=false;
await p.evaluate(()=>{ window.__crit=[]; const o=eval('toast');
  eval('toast = m=>{ window.__crit.push(m); return ('+o.toString()+')(m); }'); });
for(let r=0;r<8 && (await G()).boss;r++){
  for(let i=0;i<10;i++){
    const gg=await G(); if(!gg.boss || gg.boss.stage==='stun') break;
    await p.evaluate(()=>{ const bs=eval('bossServer'); if(bs){const P=window.game.P; P.x=bs.x+1.2; P.z=bs.z+1.2;} });
    await p.evaluate(()=>eval("sendWS({t:'garden',act:'bossHit'})")); await p.waitForTimeout(300);
  }
  const gg=await G(); if(!gg.boss) break;
  if(gg.boss.stage==='stun'){                      // говорим сразу — должен пройти супер-удар
    const before=gg.boss.hp;
    await p.evaluate(()=>eval("sendWS({t:'garden',act:'bossWord',word:'apple'})"));
    await p.waitForTimeout(500); words++;
    const after=(await G()).boss;
    if(!after){ crit=true; break; }                 // снесло всё здоровье разом — это и есть супер-удар
    if(before-after.hp >= max*0.9) crit=true;
  }
}
const toasts=await p.evaluate(()=>window.__crit||[]);
ok(toasts.some(t=>/Супер-удар/.test(t)), `игра объявила супер-удар: «${toasts.find(t=>/Супер/.test(t))||'—'}»`);
ok(crit, 'сказал сразу — снесло больше 90% здоровья за одно слово');
g=await G();
ok(!g.boss && (g.bossDone|0)===1, `босс повержен за ${words} ${words===1?'слово':'слова'}`);
ok(words<=2, `хватило одного-двух слов: ${words}`);
await b.close();
