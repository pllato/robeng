// Голос по расстоянию: микрофон открыт всегда, дальнего соседа почти не слышно
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
        '--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required'] });
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
async function player(){
  const ctx=await b.newContext({viewport:{width:900,height:600},permissions:['microphone']});
  const p=await ctx.newPage();
  p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,160)));
  await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1300);
  await p.evaluate(()=>{const g=document.getElementById('spGo'); if(g&&g.offsetParent) g.click();});
  await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
  await p.evaluate(()=>{window.game.setPaused(false);});
  await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
  await p.waitForTimeout(2000);
  return p;
}
const A=await player(), B=await player();
await A.waitForTimeout(1500);

// микрофон открыт сам, без удержания кнопки
await A.evaluate(async()=>{ await window.game.acquireMic(); window.game.joinVoice(); });
await B.evaluate(async()=>{ await window.game.acquireMic(); window.game.joinVoice(); });
await A.waitForTimeout(2500);
ok(await A.evaluate(()=>window.game.voiceState().on), 'голос подключён без нажатий');
ok(!(await A.evaluate(()=>window.game.micMuted())), 'микрофон открыт — говорить можно не удерживая кнопку');
ok(/слышно|Рядом|На связи/i.test(await A.evaluate(()=>document.getElementById('micBtn').textContent)),
   `на кнопке: «${await A.evaluate(()=>document.getElementById('micBtn').textContent)}»`);

// кривая громкости по расстоянию
const R=await A.evaluate(()=>window.game.voiceRadius());
ok(R===40, `радиус по умолчанию: ${R} блоков`);
const v=async d=>Math.round((await A.evaluate(x=>window.game.voiceVol(x), d))*100);
ok(await v(2)===100, `вплотную — ${await v(2)}% громкости`);
ok(await v(6)===100, `в шести блоках — ${await v(6)}%`);
const n=await v(28);
ok(n>=25 && n<=40, `сосед через огород (28 блоков) — ${n}%: слышно, но тихо`);
ok(await v(40)===0, `на границе радиуса — ${await v(40)}%: не слышно`);
ok(await v(60)===0, `дальше границы — ${await v(60)}%: тишина, ора не будет`);
ok(await v(12) > await v(30), `чем ближе, тем громче: 12 блоков ${await v(12)}% против 30 блоков ${await v(30)}%`);

// радиус настраивается
await A.evaluate(()=>window.game.setVoiceRadius(80));
ok((await A.evaluate(()=>window.game.voiceRadius()))===80, 'радиус изменён на 80 блоков');
const wide=await v(28);
ok(wide>n, `с большим радиусом тот же сосед слышен громче: ${n}% → ${wide}%`);
ok((await A.evaluate(()=>document.getElementById('vrVal').textContent))==='80 блоков',
   'в меню видно новое значение');
await A.evaluate(()=>window.game.setVoiceRadius(40));

// связь поднялась и громкость реально считается по позиции соседа
await A.waitForTimeout(4000);
const conns=await A.evaluate(()=>window.game.voiceState().conns);
ok(conns.length>0, `соединение с соседом есть: ${JSON.stringify(conns)}`);
const gains=await A.evaluate(()=>window.game.voiceGains());
if(gains.length){
  // ставим соседа вплотную
  const pos=await A.evaluate(()=>({x:window.game.P.x,z:window.game.P.z}));
  await B.evaluate(pt=>{ const P=window.game.P; P.x=pt.x+1; P.z=pt.z+1; }, pos);
  await A.waitForTimeout(2500);
  const near=(await A.evaluate(()=>window.game.voiceGains()))[0];
  // и уводим далеко
  await B.evaluate(pt=>{ const P=window.game.P; P.x=pt.x+55; P.z=pt.z+55; }, pos);
  await A.waitForTimeout(2500);
  const far=(await A.evaluate(()=>window.game.voiceGains()))[0];
  ok(near && near.gain>0.8, `сосед рядом — громкость ${Math.round(near.gain*100)}%`);
  ok(far && far.gain<0.05, `сосед ушёл далеко — громкость ${Math.round(far.gain*100)}%`);
} else {
  ok(false, 'громкость по соседям не подключилась (WebAudio)');
}
await b.close();
