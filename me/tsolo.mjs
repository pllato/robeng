import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{width:800,height:500} });
await p.goto('http://localhost:8642',{waitUntil:'load'});
await p.waitForTimeout(1000); await p.click('#spSolo');
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:20000});
await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true); });
await p.waitForTimeout(1000);
await p.evaluate(()=>window.game.startLesson('starter-01'));
await p.waitForTimeout(1200);
await p.evaluate(()=>window.game.runStage(1));
await p.waitForTimeout(2500);
const st=await p.evaluate(()=>window.game.words().map(s=>({w:s.word,x:s.x,y:s.y,z:s.z})));
for(const s of st){
  await p.evaluate(o=>{ const P=window.game.P; P.x=o.x+2.2; P.y=o.y+1; P.z=o.z+2.2; P.vy=0; },s);
  await p.waitForTimeout(800);
  const near=await p.evaluate(()=>window.game.raceState().near);
  if(near===s.w) await p.evaluate(w=>window.game.checkWord(w), s.w);
  await p.waitForTimeout(350);
  const got=await p.evaluate(()=>window.game.raceState().got);
  console.log(String(s.w).padEnd(11), 'рядом:', String(near).padEnd(11), 'собрано:', got.length);
}
await b.close();
