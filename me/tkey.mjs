import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{width:1000,height:600} });
await p.addInitScript(()=>{ delete window.SpeechRecognition; delete window.webkitSpeechRecognition; }); // headless: гоним резервный путь с prompt
let asked=null, answer='';
p.on('dialog', async d => { asked=d.message(); await d.accept(answer); });
await p.goto('http://localhost:8642',{waitUntil:'load'});
await p.waitForTimeout(1000); await p.click('#spSolo');
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:20000});
await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true); });
await p.waitForTimeout(1000);
await p.evaluate(()=>window.game.startLesson('starter-01'));
await p.waitForTimeout(1200);
await p.evaluate(()=>window.game.runStage(0)); // фразовое задание — кнопка «Сказать фразу» видна
await p.waitForTimeout(2500);
const st=await p.evaluate(()=>window.game.words().map(s=>({w:s.word,x:s.x,y:s.y,z:s.z})));
const s0=st[0];
await p.evaluate(o=>{ const P=window.game.P; P.x=o.x+2.2; P.y=o.y+1; P.z=o.z+2.2; P.vy=0; }, s0);
await p.waitForTimeout(800);
const btn = await p.evaluate(()=>{ const b=document.getElementById('sayBtn');
  return { visible:getComputedStyle(b).display!=='none', text:b.textContent }; });
console.log('кнопка:', JSON.stringify(btn));
console.log('SpeechRecognition в браузере:', await p.evaluate(()=>!!(window.SpeechRecognition||window.webkitSpeechRecognition)));
answer = 'hello my name is sasha';
await p.keyboard.press('r');
await p.waitForTimeout(400);
console.log('после R -> listening:', await p.evaluate(()=>window.__dbgListening===undefined?'—':window.__dbgListening),
            '| текст кнопки:', await p.evaluate(()=>document.getElementById('sayBtn').textContent));
await p.waitForTimeout(900);
const got = await p.evaluate(()=>window.game.taskState().done);
console.log('диалог после R:', JSON.stringify(asked));
console.log('задание засчитано:', got);
await p.screenshot({path:'saykey.png'});
await b.close();
