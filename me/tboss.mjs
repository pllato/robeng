// Бой с боссом: приходит сам, оглушается киркой, теряет жизни от слов, отдаёт награды
import { chromium } from 'playwright';
import { restoreBossGarden } from './bossgard.mjs';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p=await b.newPage({viewport:{width:1100,height:700}});
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,180)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const G=()=>p.evaluate(()=>eval('myGarden'));
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1400);
// гость: сад поднимаем одним сообщением, чтобы не ждать четыре урожая
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(2200);

// босс приходит к большому огороду: 10+ разных растений и несколько дней работы
await restoreBossGarden(p);
let g=await G();
const need=await p.evaluate(()=>window.game.bossNeed());
ok((need.have|0)>=(need.need|0) && (need.days|0)>=(need.needDays|0),
   `огород дорос до босса: ${need.have} растений из ${need.need}, ${need.days} дней из ${need.needDays}`);
ok((await p.evaluate(()=>eval('BOSSES').length))===20, 'сервер прислал всех 20 боссов');
ok((await p.evaluate(()=>eval('WEAPONS').length))===20, 'и 20 видов оружия');

// собираем куст целиком — вот теперь босс приходит
await p.evaluate(()=>{ const q=bedPos(myPlotIndex(),0), P=window.game.P; P.x=q.x+.5; P.z=q.z+3; });
await p.waitForTimeout(700);
for(let i=0;i<9;i++){
  const l=await p.evaluate(()=>bedAt(0)?ripeWords(bedAt(0)):[]);
  if(!l.length) break;
  await p.evaluate(x=>window.game.checkWord(x), l[0]);
  await p.waitForTimeout(350);
}
await p.waitForTimeout(1300);
g=await G();
ok(!!g.boss, `собрал куст — пришёл босс #${g.boss&&g.boss.i+1}`);
await p.evaluate(()=>{const g=document.getElementById('biGo'); if(g) g.click();}); await p.waitForTimeout(700);
const B=await p.evaluate(()=>eval('BOSSES')[eval('myGarden').boss.i]);
ok(B && B.name==='Грязевой Крот', `первый босс — ${B&&B.emoji} ${B&&B.name}, ${g.boss.max} жизней`);
ok((await p.evaluate(()=>getComputedStyle(document.getElementById('bossBar')).display))!=='none',
   'полоса здоровья босса на экране');
ok((await p.evaluate(()=>getComputedStyle(document.getElementById('storm')).display))!=='none', 'гроза включилась');

// босса видно: меш собирается
const boxes=await p.evaluate(()=>{ const V=[]; pushBossMesh(V,{i:0,x:0,z:0,yaw:0}); return V.length/9/4; });
ok(boxes>4, `тело босса собрано из ${boxes} коробок`);
const shapes=await p.evaluate(()=>eval('BOSSES').map((B,i)=>{ const V=[]; pushBossMesh(V,{i,x:0,z:0,yaw:0}); return V.length/9/4; }));
ok(shapes.every(n=>n>3), `у всех двадцати есть тело: от ${Math.min(...shapes)} до ${Math.max(...shapes)} коробок`);

// пока босс в ярости, слово его почти не берёт — сперва кирка
{
  const was=(await G()).boss.hp;
  await p.evaluate(()=>eval("sendWS({t:'garden',act:'bossWord',word:'apple'})"));
  await p.waitForTimeout(800);
  const now=(await G()).boss.hp;
  ok(now<was && was-now<=3, `по злому боссу слово только царапает: ${was-now}`);
}

// бьём киркой до оглушения
for(let i=0;i<8;i++){
  await p.evaluate(()=>eval("sendWS({t:'garden',act:'bossHit'})"));
  await p.waitForTimeout(320);
  if((await G()).boss.stage==='stun') break;
}
g=await G();
ok(g.boss.stage==='stun', `после ${g.boss.need} ударов босс оглушён`);

// теперь словами: сразу после оглушения проходит супер-удар
const before=g.boss.hp;
await p.evaluate(()=>eval("sendWS({t:'garden',act:'bossWord',word:'apple'})"));
await p.waitForTimeout(800);
g=await G();
const took=before-((g.boss&&g.boss.hp)||0);
ok(took>=before*0.9, `слово «apple» сняло ${took} жизней из ${before} — супер-удар в момент оглушения`);

// если вдруг выжил — добиваем
for(let i=0;i<40 && (await G()).boss;i++){
  const st=(await G()).boss; if(!st) break;
  if(st.stage!=='stun'){ await p.evaluate(()=>eval("sendWS({t:'garden',act:'bossHit'})")); }
  else { await p.evaluate(()=>eval("sendWS({t:'garden',act:'bossWord',word:'apple'})")); }
  await p.waitForTimeout(260);
}
g=await G();
ok(!g.boss, 'босс побеждён');
ok((g.bossDone|0)===1, `засчитана победа: боссов пройдено ${g.bossDone}`);
ok((g.weapon|0)===1, `выдано оружие №${g.weapon}: ${(await p.evaluate(()=>eval('WEAPONS')))[g.weapon].name}`);
ok(Array.isArray(g.pets)&&g.pets.length===1, `питомец получен: ${g.pets&&g.pets[0]}`);
ok((g.coins|0)>0, `и монеты за победу: ${g.coins} 🪙`);
await b.close();
