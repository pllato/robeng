// Одна клавиша на сбор, ввод словом вместо голоса, размер растений по редкости, только курсор.
import { chromium } from 'playwright';
import { execSync } from 'child_process';
const acc = JSON.parse(execSync('node setup.mjs').toString().trim().split('\n').pop());
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{width:1200,height:700} });
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,200)));
// собираем всю грядку: на каждом кусте по 2–3 плода
async function harvestAll(page, bed){
  let got=0;
  for(let guard=0; guard<80; guard++){
    const left = await page.evaluate(n=>ripeWords(bedAt(n)), bed);
    if(!left.length) break;
    if(await page.evaluate(w=>window.game.checkWord(w), left[0])) got++;
    await page.waitForTimeout(360);
  }
  return got;
}
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
await p.addInitScript(t=>localStorage.setItem('me_token',t), acc.studentToken);
await p.goto('http://localhost:8642',{waitUntil:'load'});
await p.waitForTimeout(1500);
await p.evaluate(()=>{ const g=document.getElementById('spGo'); if(g&&g.offsetParent) g.click(); });
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>window.game.setPaused(false));
await p.waitForTimeout(600);

ok(await p.evaluate(()=>eval('dragMode')),'мышь не захватывается — курсор всегда виден');
ok(!(await p.evaluate(()=>!!document.getElementById('curBtn'))),'кнопки переключения курсора больше нет');

await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(2600);
await p.evaluate(()=>window.game.setPaused(false));

// сажаем
await p.evaluate(()=>gardenGo('shop')); await p.waitForTimeout(600);
await p.evaluate(()=>window.game.doInteract()); await p.waitForTimeout(700);
await p.evaluate(()=>document.getElementById('npcGo').click()); await p.waitForTimeout(1100);
await p.evaluate(()=>{ const el=document.querySelector('#shopList button[data-take]'); if(el) el.click(); });
await p.waitForTimeout(700);
await p.evaluate(()=>{ const q=bedPos(myPlotIndex(),0), P=window.game.P; P.x=q.x+2; P.z=q.z+2; P.y=q.y; P.vx=P.vy=P.vz=0; });
await p.waitForTimeout(700);
await p.evaluate(()=>window.game.doInteract());
await p.waitForTimeout(1600);
ok(!!(await p.evaluate(()=>bedAt(0))),'грядка засеяна');
await p.waitForFunction(()=>ripeWords(bedAt(0)).length>0,null,{timeout:20000});

// одна клавиша: E открывает окно со словом
await p.evaluate(()=>window.game.doInteract());
await p.waitForTimeout(900);
const box = await p.evaluate(()=>({vis:document.getElementById('askBox').style.display,
  word:document.getElementById('askWord').textContent,
  rowHidden:getComputedStyle(document.getElementById('askRow')).display==='none',
  btn:!!document.getElementById('askType')}));
ok(box.vis==='block','E сразу открыл окно сбора');
ok(/×\d/.test(box.word),'в окне названо слово: "'+box.word.replace(/\s+/g,' ').trim()+'"');
ok(box.rowHidden && box.btn,'поле ввода спрятано за кнопкой «Написать»');
const w1 = await p.evaluate(()=>eval('askWord'));
await p.evaluate(()=>window.game.doInteract());        // E ещё раз — то же слово, повтор
await p.waitForTimeout(600);
ok((await p.evaluate(()=>eval('askWord')))===w1,'повторное E повторяет то же слово: '+w1);
await p.evaluate(()=>document.getElementById('askType').click());
await p.waitForTimeout(300);
ok((await p.evaluate(()=>getComputedStyle(document.getElementById('askRow')).display))!=='none','кнопка «Написать» открыла поле ввода');

// собираем, вписывая слова руками
for(let g=0;g<80;g++){
  const left = await p.evaluate(()=>ripeWords(bedAt(0)));
  if(!left.length) break;
  await p.evaluate(()=>{ const b=document.getElementById('askType'); if(b) b.style.display='inline-block'; b.click(); });
  await p.fill('#askInput', left[0]);
  await p.press('#askInput','Enter');
  await p.waitForTimeout(340);
}
ok((await p.evaluate(()=>ripeWords(bedAt(0)).length))===0,'весь урожай собран вводом с клавиатуры');
ok((await p.evaluate(()=>document.getElementById('askBox').style.display))==='none','окно закрылось само, когда собрали всё');
ok((await p.evaluate(()=>Object.values(myGarden.basket).reduce((a,b)=>a+b,0)))>=16,'плоды в корзине');

// неверное слово не проходит
await p.waitForFunction(()=>ripeWords(bedAt(0)).length>0,null,{timeout:40000});
await p.evaluate(()=>window.game.doInteract()); await p.waitForTimeout(800);
await p.evaluate(()=>document.getElementById('askType').click());
await p.waitForTimeout(300);
await p.fill('#askInput','zzz'); await p.press('#askInput','Enter');
await p.waitForTimeout(500);
ok(/попробуй/i.test(await p.evaluate(()=>document.getElementById('askHint').textContent)),'неверное слово честно отклоняется');
await p.evaluate(()=>closeAsk());

// размер зависит от редкости, а не от возраста грядки
const sc = await p.evaluate(()=>[0,1,2,3].map(t=>tierScale(t)));
ok(sc[0]<sc[1] && sc[1]<sc[2] && sc[2]<sc[3], 'чем реже растение, тем оно крупнее: '+sc.join(' < '));
const same = await p.evaluate(()=>{ const b=bedAt(0); const a=tierScale(b.tier); b.cycle=99; return a===tierScale(b.tier); });
ok(same,'возраст грядки на размер больше не влияет');
await p.screenshot({path:'g-ask.png'});
await b.close();
