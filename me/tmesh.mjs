// Голос только с соседями. Раньше каждый ребёнок держал соединение с каждым в мире
// и не разрывал его никогда — при двадцати детях телефон кодировал свой микрофон
// девятнадцать раз. Проверяем, что соединение рвётся, когда сосед ушёл, и
// поднимается заново, когда он вернулся.
import { chromium } from 'playwright';
import { execSync } from 'child_process';
const acc = JSON.parse(execSync('node setup.mjs').toString().trim().split('\n').pop());
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const b = await chromium.launch({
  executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
        '--use-fake-device-for-media-capture','--use-fake-ui-for-media-stream',
        '--autoplay-policy=no-user-gesture-required'] });

async function player(token,label){
  const ctx=await b.newContext({ viewport:{width:800,height:520}, permissions:['microphone'] });
  const p=await ctx.newPage();
  p.on('pageerror',e=>console.log(`PAGEERROR(${label}):`,e.message.slice(0,150)));
  if(token) await p.addInitScript(t=>localStorage.setItem('me_token',t), token);
  await p.goto('http://localhost:8642',{waitUntil:'load'});
  await p.waitForTimeout(1300);
  await p.evaluate(()=>{const g=document.getElementById('spGo'); if(g&&g.offsetParent) g.click();});
  await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
  await p.evaluate(()=>{window.game.setPaused(false);});
  return p;
}
const A = await player(acc.studentToken,'A');
const B = await player(acc.teacherToken||null,'B');
for(const pg of [A,B]){
  await pg.evaluate(c=>eval(`sendWS({t:'switch',code:'${c}'})`), acc.code);
  await pg.waitForFunction(c=>window.game.code()===c, acc.code, {timeout:20000});
}
await A.waitForTimeout(2500);

// микрофона в контейнере нет — подставляем синтетический тон, как в tvoice
for(const pg of [A,B]){
  await pg.evaluate(()=>{
    const ac=new AudioContext(), osc=ac.createOscillator(), dst=ac.createMediaStreamDestination();
    osc.frequency.value=440; osc.connect(dst); osc.start();
    eval('micStream = dst.stream');
    joinVoice();
    setVoiceR(12);                 // ближе к школьной парте, и мир 128×128 нам хватит
  });
}
const conns = pg => pg.evaluate(()=>eval('pcs').size);
const put = (pg,x,z) => pg.evaluate(c=>{ const P=window.game.P; P.x=c.x; P.z=c.z; P.vx=P.vy=P.vz=0; },{x,z});

ok((await A.evaluate(()=>eval('peers').size))>0, 'игроки видят друг друга в комнате');
ok((await A.evaluate(()=>eval('voiceR')))===12, 'радиус слышимости выставлен: 12 блоков');

// ── рядом: соединение должно подняться ──
await put(A,40,40); await put(B,43,40);
await A.waitForTimeout(1200);
await A.waitForFunction(()=>eval('pcs').size===1,null,{timeout:15000})
  .then(()=>ok(true,'сосед в трёх шагах — соединение поднялось'))
  .catch(async()=>ok(false,`рядом, а соединений ${await conns(A)}`));

// ── ушёл за радиус: соединение должно порваться ──
await put(B,100,40);               // 60 блоков при радиусе 12 — далеко за порогом
await A.waitForFunction(()=>eval('pcs').size===0,null,{timeout:20000})
  .then(()=>ok(true,'сосед ушёл на 60 блоков — соединение разорвано, телефон его больше не кодирует'))
  .catch(async()=>ok(false,`ушёл далеко, а соединений всё ещё ${await conns(A)}`));
await B.waitForFunction(()=>eval('pcs').size===0,null,{timeout:15000})
  .then(()=>ok(true,'и со второй стороны тоже разорвано'))
  .catch(async()=>ok(false,`у второго осталось соединений: ${await conns(B)}`));

// ── вернулся: соединение должно подняться заново ──
await put(B,43,40);
await A.waitForFunction(()=>eval('pcs').size===1,null,{timeout:20000})
  .then(()=>ok(true,'вернулся — соединение поднялось заново, само'))
  .catch(async()=>ok(false,`вернулся, а соединений ${await conns(A)}`));

// ── и звук по нему правда идёт ──
await A.waitForTimeout(3500);
const got = await B.evaluate(async()=>{
  const pc=[...eval('pcs').values()][0]; if(!pc) return -1;
  let bytes=0; (await pc.getStats()).forEach(r=>{ if(r.type==='inbound-rtp'&&r.kind==='audio') bytes=r.bytesReceived||0; });
  return bytes;
});
ok(got>0, `после возврата звук идёт: получено ${got} байт`);

// ── счётчик на кнопке не врёт про дальних ──
await put(B,100,40);
await A.waitForTimeout(3000);
const lab = await A.evaluate(()=>{ updateMicBtn(); return document.getElementById('micBtn').textContent; });
ok(/Рядом никого/.test(lab), `кнопка честно говорит, что рядом пусто: «${lab}»`);
await b.close();
