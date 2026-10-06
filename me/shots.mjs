// Снимки звуковых экранов для инструкции учителям и родителям.
// Запуск:  node shots.mjs [папка]   — по умолчанию кладёт рядом, в ./shots.
// Нужен поднятый сервер на 8642. После правок интерфейса снимки переснять и
// заменить картинки в документе — иначе инструкция начнёт врать.
import { chromium, devices } from 'playwright';
import fs from 'fs';
const OUT=process.argv[2]||'shots';
fs.mkdirSync(OUT,{recursive:true});
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx=await b.newContext({...devices['iPhone 13'],viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const p=await ctx.newPage();
await p.addInitScript(()=>{
  class FakeSR{ start(){ window.__SR=this; } stop(){ if(this.onend) this.onend(); } abort(){ this.stop(); } }
  window.SpeechRecognition=FakeSR; window.webkitSpeechRecognition=FakeSR;
  const sp=window.speechSynthesis; if(sp) sp.speak=()=>{};
});
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1500);
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.waitForTimeout(2600);

// 2b. только звуковая часть меню, крупно
await p.evaluate(()=>{ openMenu(); netMenuLine(); });
await p.waitForTimeout(900);
const box=await p.evaluateHandle(()=>{
  const mv=document.getElementById('mvBox');
  const wrap=document.createElement('div');
  wrap.style.cssText='position:fixed;left:0;right:0;top:0;z-index:99;background:#13203c;padding:18px 16px';
  const clone=document.createElement('div');
  clone.innerHTML=mv.outerHTML+document.getElementById('vrBox').outerHTML
    +'<p style="margin:14px 0 0;font:13px system-ui;color:#cfe0ff;text-align:center">'
    +document.getElementById('pmNet').innerHTML+'</p>';
  clone.style.cssText='max-width:300px;margin:0 auto;color:#fff;font:14px system-ui;text-align:center';
  wrap.appendChild(clone); document.body.appendChild(wrap);
  return wrap;
});
await p.waitForTimeout(400);
await box.asElement().screenshot({path:`${OUT}/02b-sound-menu.png`});
await p.evaluate(e=>e.remove(), box);

// 4. состояния кнопки голоса
const st=await p.evaluateHandle(()=>{
  const wrap=document.createElement('div');
  wrap.style.cssText='position:fixed;left:0;right:0;top:0;z-index:99;background:#13203c;'
    +'padding:16px;display:flex;flex-direction:column;gap:11px;font:14px system-ui;color:#dbe6ff';
  const mk=(bg,txt,note)=>{
    const row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:11px';
    row.innerHTML='<span style="display:inline-block;padding:9px 14px;border-radius:9px;'
      +'font-size:14px;font-weight:700;color:#fff;white-space:nowrap;background:'+bg+'">'+txt+'</span>'
      +'<span style="opacity:.85;font-size:13px">'+note+'</span>';
    return row;
  };
  wrap.append(
    mk('#2a3d61','🎤 Включить голос','микрофон ещё не разрешён'),
    mk('#2a3d61','🎤 Подключаюсь…','разрешён, идёт подключение'),
    mk('#3fa34d','🎤 Рядом никого','всё работает, но рядом никого нет'),
    mk('#3fa34d','🎤 На связи: 2','слышно двоих соседей'),
    mk('#8a3b30','🔇 Микрофон выключен','ребёнок выключил себя сам'));
  document.body.appendChild(wrap); return wrap;
});
await p.waitForTimeout(400);
await st.asElement().screenshot({path:`${OUT}/04-mic-states.png`});
await b.close();
console.log('готово');
