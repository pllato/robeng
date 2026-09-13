import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport:{width:1100,height:640} });
async function enter(tag){
  const p = await ctx.newPage();
  p.on('websocket', ws=>{
    ws.on('framesent', f=>{ const s=String(f.payload); if(s.includes('garden')) console.log(`[${tag}] → `+s.slice(0,220)); });
    ws.on('framereceived', f=>{ const s=String(f.payload); if(s.includes('gardenData')) console.log(`[${tag}] ← gardenData beds=`+Object.keys(JSON.parse(s).garden.beds||{}).length+' seeds='+JSON.stringify(JSON.parse(s).garden.seeds)+' guest='+JSON.parse(s).guest); });
  });
  await p.goto('http://localhost:8642',{waitUntil:'load'});
  await p.waitForTimeout(1200);
  await p.evaluate(()=>{ const g=document.getElementById('spGo'); if(g&&g.offsetParent) g.click(); });
  await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
  await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true); });
  await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
  await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
  await p.waitForTimeout(2000);
  return p;
}
let p = await enter('1й вход');
const seed = Object.keys(await p.evaluate(()=>eval('myGarden.seeds')))[0];
await p.evaluate(id=>eval(`sendWS({t:'garden',act:'plant',bed:0,lesson:'${id}'})`), seed);
await p.waitForTimeout(1200);
console.log('   localStorage после посадки:', (await p.evaluate(()=>localStorage.getItem('me_garden_guest')||'')).slice(0,180));
await p.close();
console.log('--- закрыли вкладку, открываем заново ---');
p = await enter('2й вход');
console.log('   localStorage при втором входе:', (await p.evaluate(()=>localStorage.getItem('me_garden_guest')||'ПУСТО')).slice(0,180));
await b.close();
