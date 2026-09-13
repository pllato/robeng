import { chromium, devices } from 'playwright';
import { execSync } from 'child_process';
const acc = JSON.parse(execSync('node setup.mjs').toString().trim().split('\n').pop());
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx=await b.newContext({...devices['iPhone 13'],viewport:{width:320,height:568},isMobile:true,hasTouch:true});
const p=await ctx.newPage();
await p.addInitScript(t=>localStorage.setItem('me_token',t),acc.studentToken);
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1100);
await p.evaluate(()=>{const g=document.getElementById('spGo'); if(g&&g.offsetParent) g.click();});
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(2000);
const seed=Object.keys(await p.evaluate(()=>eval('myGarden.seeds')))[0];
if(seed){ await p.evaluate(id=>eval(`sendWS({t:'garden',act:'plant',bed:0,lesson:'${id}'})`),seed);
  await p.waitForTimeout(9500); await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(800); }
console.log(await p.evaluate(()=>{
  const bd=bedAt(0); openAsk(bd,0);
  const w=document.querySelector('#askWord .w'); w.innerHTML='🍉 <b>watermelon</b>';
  const cs=getComputedStyle(w), main=document.getElementById('askMain'), mic=document.getElementById('askMic');
  return { winW:innerWidth, wClient:w.clientWidth, wScroll:w.scrollWidth, font:cs.fontSize,
    mainW:Math.round(main.getBoundingClientRect().width), micW:Math.round(mic.getBoundingClientRect().width),
    wordBoxW:Math.round(document.getElementById('askWord').getBoundingClientRect().width) };
}));
await b.close();
