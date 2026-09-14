// Одно и то же семя можно сажать на одну грядку сколько угодно раз; лишнее — выкорчевать
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p=await b.newPage({viewport:{width:1000,height:700}});
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,200)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
await p.addInitScript(()=>{ class F{start(){}stop(){}abort(){}} window.SpeechRecognition=F;
  window.webkitSpeechRecognition=F; const sp=window.speechSynthesis; if(sp) sp.speak=()=>{}; });
const G=()=>p.evaluate(()=>eval('myGarden'));
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1400);
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.waitForTimeout(2400);
await p.evaluate(()=>eval("pixiDismiss()"));
await p.evaluate(()=>eval(`sendWS({t:'garden',act:'restore',garden:{coins:5,
  seeds:{'starter-01#apple':5,'starter-01#banana':2},
  openW:{'starter-01#apple':1,'starter-01#banana':1},
  beds:{},basket:{},done:{},open:{},crops:{},cropsW:{}}})`));
await p.waitForTimeout(900);

// три apple подряд на одну грядку
for(let i=0;i<3;i++){
  await p.evaluate(()=>eval("sendWS({t:'garden',act:'plant',bed:0,lesson:'starter-01#apple'})"));
  await p.waitForTimeout(600);
}
await p.evaluate(()=>eval("sendWS({t:'garden',act:'plant',bed:0,lesson:'starter-01#banana'})"));
await p.waitForTimeout(800);
let g=await G();
const words=(g.beds['0'].words||[]).map(w=>w.word);
ok(words.filter(w=>w==='apple').length===3, `три куста apple на одной грядке: ${words.join(', ')}`);
ok(g.beds['0'].st.apple.k===3, `сервер помнит число кустов: k=${g.beds['0'].st.apple.k}`);
const seeds=await p.evaluate(()=>myGarden.seeds['starter-01#apple']|0);
ok(seeds===2, `за каждый куст списано семя: осталось ${seeds}`);

// рисуется три дерева apple, а не одно
const bushes=await p.evaluate(()=>{ const out=[]; bedPlants(bedAt(0),bedPos(myPlotIndex(),0),out,true);
  return out.filter(o=>o.kind==='plant').length; });
ok(bushes===4, `на грядке нарисовано ${bushes} деревьев (3 apple + 1 banana)`);

// урожай больше: три куста дают втрое
await p.waitForTimeout(9600);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(800);
g=await G();
const ripe=(g.beds['0'].ripe||[]).filter(w=>w==='apple').length;
ok(ripe===9, `три куста дали ${ripe} плодов apple вместо трёх`);
const spread=await p.evaluate(()=>{ const out=[]; bedPlants(bedAt(0),bedPos(myPlotIndex(),0),out,true);
  const f=out.filter(o=>o.kind==='fruit'&&o.word==='apple');
  const pos=new Set(f.map(o=>Math.round(o.x*10)+':'+Math.round(o.z*10)));
  return {n:f.length, spots:pos.size}; });
ok(spread.spots>=3, `плоды висят на разных деревьях: ${spread.n} плодов в ${spread.spots} местах`);

// экран грядки открывается и показывает кусты
await p.evaluate(()=>{ const q=bedPos(myPlotIndex(),0), P=window.game.P; P.x=q.x+.5; P.z=q.z+6; });
await p.waitForTimeout(600);
await p.evaluate(()=>openBed(0)); await p.waitForTimeout(600);
const list=await p.evaluate(()=>document.getElementById('bedList').textContent.replace(/\s+/g,' ').trim());
ok(/apple/.test(list)&&/кустов 3/.test(list), `на экране грядки: «${list.slice(0,90)}»`);
const title=await p.evaluate(()=>document.getElementById('bedTitle').textContent.replace(/\s+/g,' ').trim());
ok(/4 из 16/.test(title), `и видно, сколько мест занято: «${title}»`);

// выкорчевать один куст
await p.evaluate(()=>document.querySelector('#bedList [data-cut="apple"]').click());
await p.waitForTimeout(1200);
g=await G();
ok((g.beds['0'].words||[]).filter(w=>w.word==='apple').length===2,
   `после выкорчёвывания осталось ${(g.beds['0'].words||[]).filter(w=>w.word==='apple').length} куста apple`);
ok(g.beds['0'].st.apple.k===2, `и счётчик кустов обновился: k=${g.beds['0'].st.apple.k}`);

// выкорчевать всё — грядка освобождается
for(const w of ['apple','apple','banana']){
  await p.evaluate(x=>eval(`sendWS({t:'garden',act:'uproot',bed:0,word:'${x}'})`), w);
  await p.waitForTimeout(500);
}
g=await G();
ok(!g.beds['0'], 'грядка опустела — на ней снова можно сажать что угодно');

// и грядок на участке стало больше
const beds=await p.evaluate(()=>eval('PLOT_BEDS'));
const slots=await p.evaluate(()=>eval('BED_SLOTS').length);
ok(beds>=12 && slots>=16, `участок: ${beds} грядок по ${slots} мест — ${beds*slots} кустов`);
const near=await p.evaluate(()=>{ const a=plantSpot({},{x:0,y:0,z:0},0), c=plantSpot({},{x:0,y:0,z:0},1);
  return +Math.hypot(a.x-c.x,a.z-c.z).toFixed(1); });
ok(near<=2.5, `кусты стоят плотно: ${near} блока между соседями`);
await p.screenshot({path:'g-b40-bed.png'});
await b.close();
