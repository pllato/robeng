// Бой: босс догоняет, бьёт, игрок уворачивается и бьёт словом с расстояния
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
// сад с посаженным растением и одним собранным кустом — босс придёт сразу
// босс приходит только к большому огороду и после нескольких дней работы
await restoreBossGarden(p);
// собираем созревший плод — этим и вызываем босса
await p.evaluate(()=>{ const q=bedPos(myPlotIndex(),0), P=window.game.P; P.x=q.x+.5; P.z=q.z+3; });
await p.waitForTimeout(600);
for(let i=0;i<4;i++){
  const left=await p.evaluate(()=>ripeWords(bedAt(0)));
  if(!left.length) break;
  await p.evaluate(w=>window.game.checkWord(w), left[0]);
  await p.waitForTimeout(400);
}
await p.waitForTimeout(1000);
let g=await G();
ok(!!g.boss, `босс на месте: ${(await p.evaluate(()=>eval('BOSSES')[eval('myGarden').boss.i].name))}`);
await p.evaluate(()=>{const g=document.getElementById('biGo'); if(g) g.click();}); await p.waitForTimeout(700);
ok((g.boss.php|0)>=4, `у игрока ${g.boss.php} жизней`);

// встаём подальше и ждём — босс должен приближаться
await p.evaluate(()=>{ const q=bedPos(myPlotIndex(),0), P=window.game.P; P.x=q.x; P.z=q.z+14; });
await p.waitForTimeout(2500);
const far=await p.evaluate(()=>eval('bossServer'));
await p.waitForTimeout(3000);
const near=await p.evaluate(()=>eval('bossServer'));
ok(far && near && near.d < far.d, `босс догоняет: было ${far&&far.d} шагов, стало ${near&&near.d}`);

// стоим на месте — он достаёт и бьёт
let hp0=(await G()).boss.php;
for(let i=0;i<14 && (await G()).boss && (await G()).boss.php===hp0;i++) await p.waitForTimeout(900);
g=await G();
ok(g.boss && g.boss.php<hp0, `босс достал и ударил: жизней ${g.boss.php} из ${g.boss.pmax}`);

// кнопка «БЕЙ» стоит на месте прыжка
const btns=await p.evaluate(()=>({fight:getComputedStyle(document.getElementById('bFight')).display,
  cls:document.documentElement.classList.contains('fight')}));
ok(btns.cls, 'режим боя включён — управление переключилось на кнопку «БЕЙ»');

// уворачиваемся: отбегаем далеко
await p.evaluate(()=>{ const P=window.game.P, bs=eval('bossServer'); P.x=bs.x+22; P.z=bs.z+22; });
await p.waitForTimeout(1400);
const away=await p.evaluate(()=>eval('bossServer'));
ok(away.d>8, `отбежал — расстояние ${away.d}, босс не достаёт`);

// бьём словом с расстояния: летит плод, у босса убывает здоровье
const before=(await G()).boss.hp;
await p.evaluate(()=>window.game.checkWord('apple'));
await p.waitForTimeout(120);
const shots=await p.evaluate(()=>eval('bossShots').length);   // плод уже летит в босса
await p.waitForTimeout(900);
g=await G();
const chip=before-g.boss.hp;
ok(chip>0 && chip<=3, `слово с расстояния только царапает злого босса: ${chip}`);
ok(shots>0, `плод полетел в босса: снарядов в полёте ${shots}`);

// издалека одними словами его не свалить — надо подходить и оглушать киркой
for(let i=0;i<25 && (await G()).boss;i++){
  await p.evaluate(()=>{ const P=window.game.P, bs=eval('bossServer'); if(bs){P.x=bs.x+22;P.z=bs.z+22;} });
  await p.evaluate(()=>eval("sendWS({t:'garden',act:'bossWord',word:'apple'})"));
  await p.waitForTimeout(200);
}
g=await G();
ok(!!g.boss, `отсидеться вдалеке нельзя — у босса ещё ${g.boss.hp} жизней`);
// подходим, оглушаем киркой и бьём словом — так он и падает
for(let r=0;r<12 && (await G()).boss;r++){
  for(let i=0;i<10;i++){
    const gg=await G(); if(!gg.boss || gg.boss.stage==='stun') break;
    await p.evaluate(()=>{ const P=window.game.P, bs=eval('bossServer'); if(bs){P.x=bs.x+1.2;P.z=bs.z+1.2;} });
    await p.evaluate(()=>eval("sendWS({t:'garden',act:'bossHit'})"));
    await p.waitForTimeout(300);
  }
  for(let k=0;k<5;k++){
    const gg=await G(); if(!gg.boss || gg.boss.stage!=='stun') break;
    await p.evaluate(()=>eval("sendWS({t:'garden',act:'bossWord',word:'apple'})"));
    await p.waitForTimeout(340);
  }
}
g=await G();
ok(!g.boss && (g.bossDone|0)===1, 'подошёл, оглушил киркой и добил словами — победа');
await b.close();
