// Двое в одной комнате: доходит ли звук от одного к другому по push-to-talk
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
// обоих в настоящий класс: в лобби и в саду голос выключен намеренно
const code = acc.code;
for(const [pg,who] of [[A,'ученик'],[B,'учитель']]){
  await pg.evaluate(c=>eval(`sendWS({t:'switch',code:'${c}'})`), code);
  await pg.waitForFunction(c=>window.game.code()===c, code, {timeout:20000});
}
await A.waitForTimeout(3000);
console.log('      класс:', code);
// в контейнере нет звуковой карты: вместо микрофона подставляем синтетический тон.
// проверяем не разрешение браузера, а сам канал — сигналинг, ICE и передачу звука.
for(const pg of [A,B]){
  await pg.evaluate(()=>{
    const ac=new AudioContext(), osc=ac.createOscillator(), dst=ac.createMediaStreamDestination();
    osc.frequency.value=440; osc.connect(dst); osc.start();
    eval('micStream = dst.stream');
    micStream.getAudioTracks().forEach(tr=>tr.enabled=false);
    joinVoice();
  });
}
await A.waitForTimeout(2500);

ok((await A.evaluate(()=>eval('peers').size))>0, 'игроки видят друг друга в комнате');

const vA=await A.evaluate(()=>window.game.voiceState());
const vB=await B.evaluate(()=>window.game.voiceState());
ok(vA.on, 'у первого микрофон подключён (voiceOn)');
ok(vB.on, 'у второго микрофон подключён (voiceOn)');
console.log('      A:',JSON.stringify(vA.conns),' B:',JSON.stringify(vB.conns));

// ждём, пока соединение установится
let st=null;
for(let i=0;i<30;i++){
  st=await A.evaluate(()=>window.game.voiceState().conns);
  if(st.some(c=>c.state==='connected'||c.ice==='connected'||c.ice==='completed')) break;
  await A.waitForTimeout(500);
}
ok(st && st.some(c=>c.state==='connected'||c.ice==='connected'||c.ice==='completed'),
   'канал связи установлен: '+JSON.stringify(st));

// микрофон открыт сам — ничего нажимать не надо, байты должны идти сразу
ok(!(await A.evaluate(()=>window.game.micMuted())), 'микрофон открыт без нажатий');
await A.waitForTimeout(3000);
const sent = await A.evaluate(async()=>{
  const [id,pc]=[...eval('pcs').entries()][0]||[]; if(!pc) return -1;
  let bytes=0; (await pc.getStats()).forEach(r=>{ if(r.type==='outbound-rtp'&&r.kind==='audio') bytes=r.bytesSent||0; });
  return bytes;
});
const got = await B.evaluate(async()=>{
  const [id,pc]=[...eval('pcs').entries()][0]||[]; if(!pc) return -1;
  let bytes=0; (await pc.getStats()).forEach(r=>{ if(r.type==='inbound-rtp'&&r.kind==='audio') bytes=r.bytesReceived||0; });
  return bytes;
});
ok(sent>0, `первый передал звук без нажатий: ${sent} байт`);
ok(got>0, `второй принял звук: ${got} байт`);
// кнопка теперь выключает микрофон
await A.evaluate(()=>window.game.toggleVoice());
await A.waitForTimeout(1000);
ok(await A.evaluate(()=>window.game.micMuted()), 'нажал кнопку — микрофон выключился');
ok(/выключен/.test(await A.evaluate(()=>document.getElementById('micBtn').textContent)),
   `и на кнопке написано: «${await A.evaluate(()=>document.getElementById('micBtn').textContent)}»`);
await A.evaluate(()=>window.game.toggleVoice());
await A.waitForTimeout(1200);
ok(!(await A.evaluate(()=>window.game.micMuted())), 'нажал ещё раз — включился обратно');
const after = await B.evaluate(async()=>{
  const [id,pc]=[...eval('pcs').entries()][0]||[]; if(!pc) return -1;
  let b=0; (await pc.getStats()).forEach(r=>{ if(r.type==='inbound-rtp'&&r.kind==='audio') b=r.bytesReceived||0; });
  return b;
});
console.log('      после отпускания кнопки принято всего:',after,'байт');
// то же самое в саду: раньше голос там был выключен намеренно
for(const pg of [A,B]){
  await pg.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
  await pg.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
}
await A.waitForTimeout(3000);
ok((await A.evaluate(()=>window.game.voiceState().on)), 'в саду голос тоже включается');
let gst=null;
for(let i=0;i<24;i++){
  gst=await A.evaluate(()=>window.game.voiceState().conns);
  if(gst.some(c=>c.ice==='connected'||c.ice==='completed')) break;
  await A.waitForTimeout(500);
}
ok(gst&&gst.some(c=>c.ice==='connected'||c.ice==='completed'), 'в саду соседи слышат друг друга: '+JSON.stringify(gst));
// подпись на кнопке больше не пугает «нет связи»
const label = await A.evaluate(()=>document.getElementById('micBtn').textContent);
ok(!/нет связи/.test(label), `подпись на кнопке: «${label}»`);

// и на ресепшне школы голос тоже должен работать — там дети и встречаются
for(const pg of [A,B]){
  await pg.evaluate(()=>eval("sendWS({t:'switch',code:'LOBBY'})"));
  await pg.waitForFunction(()=>window.game.code()==='LOBBY',null,{timeout:20000});
}
await A.waitForTimeout(2500);
ok(await A.evaluate(()=>window.game.voiceState().on), 'на ресепшне голос включён');
ok(!(await A.evaluate(()=>window.game.micMuted())), 'и микрофон открыт');
let lst=null;
for(let i=0;i<24;i++){
  lst=await A.evaluate(()=>window.game.voiceState().conns);
  if(lst.some(c=>c.ice==='connected'||c.ice==='completed')) break;
  await A.waitForTimeout(500);
}
ok(lst&&lst.some(c=>c.ice==='connected'||c.ice==='completed'),
   'на ресепшне соседи слышат друг друга: '+JSON.stringify(lst));
ok((await A.evaluate(()=>getComputedStyle(document.getElementById('voiceOff')).display))==='none',
   'красной плашки нет — голос на месте');
await b.close();
