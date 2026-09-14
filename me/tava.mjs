// Конструктор персонажа: сборка, сохранение, видимость соседям
import { chromium } from 'playwright';
import { execSync } from 'child_process';
const acc = JSON.parse(execSync('node setup.mjs').toString().trim().split('\n').pop());
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
async function enter(token){
  const ctx=await b.newContext({viewport:{width:1100,height:700}});
  const p=await ctx.newPage();
  p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,160)));
  if(token) await p.addInitScript(t=>localStorage.setItem('me_token',t), token);
  await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1300);
  await p.evaluate(()=>{const g=document.getElementById('spGo'); if(g&&g.offsetParent) g.click();});
  await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
  await p.evaluate(()=>{window.game.setPaused(false);});
  return p;
}
const A=await enter(acc.studentToken);

// сколько всего сочетаний
const combos=await A.evaluate(()=>eval('avaCombos()'));
ok(combos>50000, `коллекция: ${combos.toLocaleString('ru-RU')} сочетаний`);

// открываем конструктор
await A.evaluate(()=>openAva()); await A.waitForTimeout(500);
ok(await A.evaluate(()=>!document.getElementById('mAva').hidden), 'конструктор открылся');
const tabs=await A.evaluate(()=>[...document.querySelectorAll('#avaTabs button')].map(b=>b.textContent));
ok(tabs.length===7, 'вкладки: '+tabs.join(', '));
// спутник выбирается здесь же — магическое животное на выбор
await A.evaluate(()=>{ eval('avaTab="pet"'); avaRender(); }); await A.waitForTimeout(400);
const pets=await A.evaluate(()=>[...document.querySelectorAll('#avaGrid button')].map(b=>b.textContent));
ok(pets.length>=12, `спутников на выбор: ${pets.length} — ${pets.slice(0,3).join(', ')}…`);
await A.evaluate(()=>{ document.querySelectorAll('#avaGrid button')[5].click(); }); await A.waitForTimeout(300);
ok((await A.evaluate(()=>eval('avaDraft').pet))===5, 'спутник выбран и запомнился в персонаже');
await A.evaluate(()=>{ eval('avaTab="skin"'); avaRender(); }); await A.waitForTimeout(300);
const sw=await A.evaluate(()=>document.querySelectorAll('#avaGrid .avaSw').length);
ok(sw>0, `на вкладке «Кожа» ${sw} вариантов`);

// превью рисуется, а не остаётся пустым
const painted=await A.evaluate(()=>{
  const cv=document.getElementById('avaCanvas'), g=cv.getContext('2d');
  const d=g.getImageData(0,0,cv.width,cv.height).data;
  let n=0; for(let i=3;i<d.length;i+=4) if(d[i]>0) n++;
  return n;
});
ok(painted>1500, `превью нарисовано: ${painted} закрашенных точек`);

// меняем и сохраняем
await A.evaluate(()=>{ avaDraft.skin=4; avaDraft.hair=8; avaDraft.hairStyle=1; avaDraft.shirt=11; avaDraft.pants=5; avaDraft.hat=4; avaRender(); });
await A.waitForTimeout(300);
await A.evaluate(()=>document.getElementById('avaSave').click());
await A.waitForTimeout(1200);
const mine=await A.evaluate(()=>eval('myAva'));
ok(mine && mine.skin===4 && mine.hat===4, 'выбор сохранён: '+JSON.stringify(mine));

// сосед видит новую внешность
const B=await enter(acc.teacherToken);
await B.evaluate(c=>eval(`sendWS({t:'switch',code:'${c}'})`), acc.code);
await B.waitForFunction(c=>window.game.code()===c, acc.code,{timeout:20000});
await A.evaluate(c=>eval(`sendWS({t:'switch',code:'${c}'})`), acc.code);
await A.waitForFunction(c=>window.game.code()===c, acc.code,{timeout:20000});
await B.waitForTimeout(2500);
const seen=await B.evaluate(()=>[...eval('peers').values()].map(p=>p.ava));
ok(seen.length>0 && seen[0] && seen[0].skin===4 && seen[0].hat===4,
   'сосед видит тот же скин: '+JSON.stringify(seen[0]));

// модель реально собирается с этими цветами
const verts=await A.evaluate(()=>{ const V=[]; pushPlayerMesh(V,{x:0,y:0,z:0,yaw:0,walkPhase:0,walkAmp:0,ava:eval('myAva')}); return V.length; });
ok(verts>0 && verts%9===0, `модель собрана: ${verts/9} вершин по 9 чисел (позиция, картинка, свет, цвет)`);
ok(verts/9/4 <= 132, `коробок в модели не больше запаса индексов: ${verts/9/4} из 132`);

// сервер не принимает мусор
await A.evaluate(()=>eval("sendWS({t:'setAvatar', ava:{skin:999, hair:-5, hat:'корона'}})"));
await A.waitForTimeout(900);
const after=await A.evaluate(()=>eval('myAva'));
ok(after.skin<6 && after.hair>=0 && after.hat<5, 'сервер починил заведомо неверный аватар: '+JSON.stringify(after));
await A.screenshot({path:'g-ava-world.png'});
await b.close();
