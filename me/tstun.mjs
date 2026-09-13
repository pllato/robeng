// Бой: киркой бьёшь вблизи → босс вязнет и слабеет → жмёшь на него и говоришь слово → сильный урон
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
let g=await G();
ok(!!g.boss, 'босс пришёл');
ok((await p.evaluate(()=>window.game.bossIntro().on)), 'сперва заставка — ребёнок читает правила');
await p.evaluate(()=>document.getElementById('biGo').click());
await p.waitForTimeout(800);

// подходим вплотную и ждём, чтобы сервер узнал наше место
await p.evaluate(()=>{ const bs=eval('bossServer'); if(bs){ const P=window.game.P; P.x=bs.x+1; P.z=bs.z+1; } });
await p.waitForTimeout(1400);

// пока он злой — на экране написано, что делать прямо сейчас
{
  const t=await p.evaluate(()=>window.game.bossTodo());
  ok(!t.weak && /кирк|Подбеги/.test(t.todo), `пока он в ярости, подсказка: «${t.todo.replace(/\s+/g,' ').trim()}»`);
}
// издалека слово почти бесполезно
await p.evaluate(()=>{ const bs=eval('bossServer'); const P=window.game.P; P.x=bs.x+26; P.z=bs.z+26; });
await p.waitForTimeout(1300);
let hp0=(await G()).boss.hp;
await p.evaluate(()=>eval("sendWS({t:'garden',act:'bossWord',word:'apple'})"));
await p.waitForTimeout(800);
const far=hp0-(await G()).boss.hp;
ok(far>0 && far<=3, `по злому боссу слово только царапает: ${far} урона`);

// киркой издалека не достать
await p.evaluate(()=>eval("sendWS({t:'garden',act:'bossHit'})"));
await p.waitForTimeout(700);
ok((await G()).boss.stage!=='stun', 'киркой издалека не дотянуться — он не ослаб');

// подходим и бьём киркой
await p.evaluate(()=>{ const bs=eval('bossServer'); const P=window.game.P; P.x=bs.x+1.2; P.z=bs.z+1.2; });
await p.waitForTimeout(1200);
const need=(await G()).boss.need;
for(let i=0;i<need+2;i++){
  await p.evaluate(()=>{ const bs=eval('bossServer'); if(bs){ const P=window.game.P; P.x=bs.x+1.2; P.z=bs.z+1.2; } });
  await p.evaluate(()=>eval("sendWS({t:'garden',act:'bossHit'})"));
  await p.waitForTimeout(420);
  if((await G()).boss.stage==='stun') break;
}
g=await G();
ok(g.boss.stage==='stun', `${need} ударов киркой — босс ослаб`);
ok(await p.evaluate(()=>window.game.bossWeak()), 'игра показывает, что он ослаб');
ok((await p.evaluate(()=>getComputedStyle(document.getElementById('bossWeak')).display))!=='none',
   'на экране плашка «он ослаб»');
ok((await p.evaluate(()=>{ const V=[]; pushGuideArrows(V); return V.length; }))===0,
   'во время боя стрелки-подсказки под ногами не ползают');
// ребёнку видно, какое слово говорить и сколько осталось времени
const todo=await p.evaluate(()=>window.game.bossTodo());
ok(todo.word && todo.word!=='…' && todo.words.includes(todo.word),
   `показано слово, которое надо сказать: «${todo.word}» (свои слова: ${todo.words.join(', ')})`);
ok(/осталось \d+ с/.test(todo.sec), `и таймер: «${todo.sec}»`);
const w1=parseFloat(todo.bar);
await p.waitForTimeout(1600);
const w2=parseFloat((await p.evaluate(()=>window.game.bossTodo())).bar);
ok(w2<w1, `полоса времени убывает: ${w1.toFixed(0)}% → ${w2.toFixed(0)}%`);

// ослабевший не бьёт и не бегает
const pos1=await p.evaluate(()=>({x:eval('bossServer').x,z:eval('bossServer').z}));
const php1=(await G()).boss.php;
await p.waitForTimeout(2600);
const pos2=await p.evaluate(()=>({x:eval('bossServer').x,z:eval('bossServer').z}));
ok(Math.hypot(pos2.x-pos1.x,pos2.z-pos1.z)<0.3, 'ослабевший стоит на месте');
ok((await G()).boss.php===php1, `и не бьёт: жизней по-прежнему ${php1}`);

// нажимать на босса не надо: как только он ослаб, игра уже слушает
hp0=(await G()).boss.hp;
const g0max=(await G()).boss.max;
ok(await p.evaluate(()=>eval('bossTapOn')), 'распознавание включилось само, без нажатия на босса');
const at=await p.evaluate(()=>window.game.bossTapAt());
ok(!!at, `босс на экране в точке ${at&&at.x},${at&&at.y}`);
// видно, что нажалось: плашка переключилась в режим записи
{
  const r=await p.evaluate(()=>window.game.bossRecOn());
  ok(r.cls, 'плашка покраснела — режим записи включён');
  ok(/Слушаю/.test(r.top), `и прямо написано: «${r.top}»`);
  ok((await p.evaluate(()=>getComputedStyle(document.getElementById('bwDot')).display))!=='none',
     'мигает красная точка записи');
}
// нажатие по боссу теперь необязательное — оно просто повторяет слово вслух
await p.evaluate(pt=>pickStart(pt.x,pt.y), at); await p.waitForTimeout(400);
ok(await p.evaluate(()=>eval('bossTapOn')), 'нажал на босса — распознавание не сбилось');
await p.evaluate(()=>window.game.checkWord('apple'));
await p.waitForTimeout(900);
g=await G();
const strong=hp0-g.boss.hp;
ok(strong>far*3, `слово по ослабевшему бьёт по-настоящему: ${strong} урона против ${far} издалека`);
ok(strong>=Math.floor(g0max*0.45), `первого босса валит с двух попаданий: ${strong} из ${g0max} за раз`);
// он ещё лежит — распознавание продолжается, можно ударить словом снова
ok(await p.evaluate(()=>eval('bossTapOn')), 'он всё ещё лежит — игра продолжает слушать');
ok(g.boss.stage==='stun', 'пока он лежит — можно ударить словом ещё раз');

// и так несколько раз — до победы
let rounds=1;
for(let r=0;r<12 && (await G()).boss;r++){
  for(let i=0;i<10;i++){
    if(!(await G()).boss) break;
    await p.evaluate(()=>{ const bs=eval('bossServer'); if(bs){ const P=window.game.P; P.x=bs.x+1.2; P.z=bs.z+1.2; } });
    await p.evaluate(()=>eval("sendWS({t:'garden',act:'bossHit'})"));
    await p.waitForTimeout(300);
    const gg=await G(); if(!gg.boss || gg.boss.stage==='stun') break;
  }
  if(!(await G()).boss) break;
  for(let k=0;k<5;k++){                     // пока лежит — бьём словом несколько раз
    const gg=await G(); if(!gg.boss || gg.boss.stage!=='stun') break;
    await p.evaluate(()=>eval("sendWS({t:'garden',act:'bossWord',word:'apple'})"));
    await p.waitForTimeout(360);
  }
  rounds++;
}
g=await G();
ok(!g.boss && (g.bossDone|0)===1, `побеждён за ${rounds} кругов «кирка → ослаб → слово»`);
await p.waitForTimeout(900);
ok(!(await p.evaluate(()=>eval('bossTapOn'))), 'бой закончен — распознавание выключилось само');
await p.waitForTimeout(900);
ok(!(await p.evaluate(()=>window.game.bossTodo().weak)), 'после боя жёлтая плашка убралась, а не висит на экране');
ok((await p.evaluate(()=>getComputedStyle(document.getElementById('bossWeak')).display))==='none',
   'и её действительно не видно');
await b.close();
