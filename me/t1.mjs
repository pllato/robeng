import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{width:1000,height:620} });
const errs=[]; p.on('console',m=>{ if(m.type()==='error') errs.push(m.text().slice(0,160)); });
p.on('pageerror',e=>errs.push('PAGEERROR '+e.message.slice(0,200)));
await p.goto('http://localhost:8642',{waitUntil:'load'});
await p.waitForTimeout(1200);
await p.click('#spSolo');
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:20000});
await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true); });
await p.waitForTimeout(1500);
await p.evaluate(()=>window.game.startLesson('starter-01'));
await p.waitForTimeout(1500);
await p.evaluate(()=>window.game.runStage(1));
await p.waitForTimeout(2500);
const info = await p.evaluate(()=>{
  const w=window.game.words();
  return { count:w.length, words:w.map(s=>s.word), first:w[0]&&{x:s0x(w[0]),y:w[0].y,z:w[0].z} };
  function s0x(s){ return s.x; }
});
console.log('станции:', JSON.stringify(info));
// телепорт к первой фигурке и взгляд на неё
await p.evaluate(()=>{
  const s=window.game.words()[0]; const P=window.game.P;
  P.x=s.x+6; P.z=s.z+6; P.y=s.y+2;
  P.yaw=Math.atan2(s.x-P.x, -(s.z-P.z)); P.pitch=0.15;
});
await p.waitForTimeout(2000);
await p.screenshot({path:'fruit1.png'});
console.log('ошибки консоли:', errs.length?errs.slice(0,5):'нет');
await b.close();
