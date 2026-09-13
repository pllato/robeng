// Голос должен включаться сам при входе. Если не включился — это видно на экране.
import { chromium, devices } from 'playwright';
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);

// ── 1. микрофон разрешён: игра берёт его на входе, без отдельных нажатий ──
{
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
          '--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'] });
  const ctx=await b.newContext({...devices['iPhone 13'],viewport:{width:390,height:844},
    isMobile:true,hasTouch:true,permissions:['microphone']});
  const p=await ctx.newPage();
  p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,160)));
  await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1500);
  ok(!(await p.evaluate(()=>!!eval('micStream'))), 'на первом экране микрофон ещё не тронут');
  await p.evaluate(()=>document.getElementById('spGo').click());
  await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
  await p.evaluate(()=>{window.game.setPaused(false);});
  await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
  await p.waitForTimeout(2600);
  ok(await p.evaluate(()=>!!eval('micStream')), 'нажал «На свой огород» — игра сразу взяла микрофон');
  ok(await p.evaluate(()=>window.game.voiceState().on), 'и подключилась к голосовому чату');
  ok(!(await p.evaluate(()=>window.game.micMuted())), 'микрофон не заглушён — тебя слышно');
  ok((await p.evaluate(()=>getComputedStyle(document.getElementById('voiceOff')).display))==='none',
     'красной плашки «голоса нет» нет — всё в порядке');
  ok((await p.evaluate(()=>document.getElementById('bTalk').textContent))==='🎤',
     'круглая кнопка показывает включённый микрофон: 🎤');
  // выключил микрофон — кнопка становится красной
  await p.evaluate(()=>window.game.toggleVoice()); await p.waitForTimeout(900);
  ok((await p.evaluate(()=>document.getElementById('bTalk').textContent))==='🔇',
     'выключил — кнопка стала 🔇 и покраснела');
  await b.close();
}

// ── 2. микрофона нет: игра честно кричит об этом на весь экран ──
{
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const ctx=await b.newContext({...devices['iPhone 13'],viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await ctx.grantPermissions([]);                      // микрофон запрещён
  const p=await ctx.newPage();
  p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,160)));
  await p.addInitScript(()=>{ navigator.mediaDevices.getUserMedia=()=>Promise.reject(new Error('denied')); });
  await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1500);
  await p.evaluate(()=>document.getElementById('spGo').click());
  await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
  await p.evaluate(()=>{window.game.setPaused(false);});
  await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
  await p.waitForTimeout(2600);
  const ban=await p.evaluate(()=>{ const e=document.getElementById('voiceOff');
    const r=e.getBoundingClientRect();
    return {d:getComputedStyle(e).display, t:e.textContent.trim(), w:Math.round(r.width), y:Math.round(r.top)}; });
  ok(ban.d!=='none', `видна красная плашка: «${ban.t}»`);
  ok(/Голос выключен/.test(ban.t), 'прямо написано, что голос выключен и тебя не слышат');
  ok(ban.w>300 && ban.y<60, `она крупная и сверху: ширина ${ban.w} из 390, отступ ${ban.y}px`);
  ok((await p.evaluate(()=>document.getElementById('bTalk').textContent))==='🔇',
     'и круглая кнопка красная: 🔇');
  // нажал на плашку — игра снова просит микрофон
  await p.evaluate(()=>{ window.__tried=0;
    navigator.mediaDevices.getUserMedia=()=>{ window.__tried++; return Promise.reject(new Error('denied')); }; });
  await p.evaluate(()=>document.getElementById('voiceOff').click());
  await p.waitForTimeout(900);
  ok((await p.evaluate(()=>window.__tried))>0, 'нажал на плашку — игра ещё раз попросила микрофон');
  ok((await p.evaluate(()=>getComputedStyle(document.getElementById('voiceOff')).display))!=='none',
     'не дали — плашка осталась, чтобы не забыли');
  await b.close();
}
