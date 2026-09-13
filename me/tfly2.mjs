import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{width:900,height:560} });
await p.goto('http://localhost:8642',{waitUntil:'load'});
await p.waitForTimeout(1000); await p.click('#spSolo');
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:20000});
await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true); });
await p.waitForTimeout(1200);
await p.keyboard.press('f'); await p.keyboard.press('l'); await p.keyboard.press('y');
await p.waitForTimeout(200);
console.log('fly:', await p.evaluate(()=>window.game.P.fly));
await p.keyboard.down('Space');
for(let i=0;i<5;i++){
  await p.waitForTimeout(300);
  console.log(i, await p.evaluate(()=>{ const P=window.game.P;
    return JSON.stringify({y:+P.y.toFixed(2), vy:+P.vy.toFixed(2), space:!!eval('keys').Space}); }));
}
await p.keyboard.up('Space');
await b.close();
