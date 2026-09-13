// Новая страница + СТАРЫЙ сервер: игрок должен увидеть это сразу, а не гадать.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{width:1000,height:600} });
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,160)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
await p.goto('http://localhost:8801',{waitUntil:'load'});
await p.waitForTimeout(1800);
const splash = await p.evaluate(()=>{const e=document.getElementById('spBuild'); return e?e.textContent:null;});
ok(splash && /сервер старый/.test(splash),'первый экран честно говорит про старый сервер: "'+splash+'"');
await p.click('#spGo');
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true); });
await p.waitForTimeout(700);
await p.keyboard.press('Escape');
await p.waitForTimeout(600);
const line = await p.evaluate(()=>document.getElementById('pmBuild').textContent);
ok(/сервер/.test(line),'меню тоже: "'+line+'"');
await p.screenshot({path:'g-oldsrv.png'});
await b.close();
