// Сорвал плоды — куст начинает расти заново, а не торчит палкой
import { chromium } from 'playwright';
import { execSync } from 'child_process';
const acc = JSON.parse(execSync('node setup.mjs').toString().trim().split('\n').pop());
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{width:1000,height:620} });
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
await p.addInitScript(t=>localStorage.setItem('me_token',t), acc.studentToken);
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1300);
await p.evaluate(()=>{const g=document.getElementById('spGo'); if(g&&g.offsetParent) g.click();});
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false); window.game.setDrag(true);});
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(2200);

const seed=Object.keys(await p.evaluate(()=>eval('myGarden.seeds')))[0];
await p.evaluate(id=>eval(`sendWS({t:'garden',act:'plant',bed:0,lesson:'${id}'})`), seed);
await p.waitForTimeout(900);

// сразу после посадки кусты должны быть ростками, а не взрослыми
const justPlanted = await p.evaluate(()=>{ const bd=bedAt(0); return plantGrow(bd, bd.words[0].word); });
ok(justPlanted<0.5, `сразу после посадки куст ещё росток: рост ${Math.round(justPlanted*100)}%`);

await p.waitForTimeout(9000);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(800);
const grown = await p.evaluate(()=>{ const bd=bedAt(0); return plantGrow(bd, bd.words[0].word); });
ok(grown===1, `созрел — куст взрослый: рост ${Math.round(grown*100)}%`);

await p.evaluate(()=>{ const q=bedPos(myPlotIndex(),0), P=window.game.P; P.x=q.x+.5; P.z=q.z+4; P.y+=0; });
await p.waitForTimeout(600);
await p.screenshot({path:'g-regrow-1-ripe.png'});

// собираем один куст целиком
const w0 = await p.evaluate(()=>bedAt(0).words[0].word);
for(let i=0;i<5;i++){
  const left = await p.evaluate(w=>ripeLeft(bedAt(0),w), w0);
  if(!left) break;
  await p.evaluate(w=>window.game.checkWord(w), w0);
  await p.waitForTimeout(420);
}
const afterPick = await p.evaluate(w=>({g:plantGrow(bedAt(0),w), left:ripeLeft(bedAt(0),w)}), w0);
ok(afterPick.left===0, `куст «${w0}» обобран: плодов ${afterPick.left}`);
ok(afterPick.g<0.5, `обобранный куст стал ростком: рост ${Math.round(afterPick.g*100)}% (был 100%)`);
const other = await p.evaluate(()=>{ const bd=bedAt(0); const w=bd.words.find(x=>ripeLeft(bd,x.word)>0); return w?plantGrow(bd,w.word):-1; });
ok(other===1, `соседний куст с плодами остался взрослым: рост ${Math.round(other*100)}%`);
await p.waitForTimeout(400);
await p.screenshot({path:'g-regrow-2-picked.png'});
await b.close();
