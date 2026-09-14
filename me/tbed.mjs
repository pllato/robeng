// На одной грядке — несколько растений
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p=await b.newPage({viewport:{width:1050,height:660}});
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,160)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const G=()=>p.evaluate(()=>eval('myGarden'));
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1400);
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(2200);
await p.evaluate(()=>eval(`sendWS({t:'garden',act:'restore',garden:{
  seeds:{'starter-01#apple':1,'starter-01#banana':1,'starter-01#orange':1},
  openW:{'starter-01#apple':1,'starter-01#banana':1,'starter-01#orange':1,'starter-01#pear':1},coins:99,
  beds:{},basket:{},done:{},open:{},crops:{},cropsW:{}}})`));
await p.waitForTimeout(1200);

for(const w of ['apple','banana','orange']){
  await p.evaluate(x=>eval(`sendWS({t:'garden',act:'plant',bed:0,lesson:'starter-01#${x}'})`), w);
  await p.waitForTimeout(800);
}
let g=await G();
const words=(g.beds['0']&&g.beds['0'].words||[]).map(w=>w.word);
ok(words.length===3, `на одной грядке ${words.length} растения: ${words.join(', ')}`);
ok(Object.keys(g.beds).length===1, 'и это по-прежнему одна грядка');

// каждое растение рисуется своим кустом
const plants=await p.evaluate(()=>{ const out=[]; bedPlants(bedAt(0), bedPos(myPlotIndex(),0), out, true);
  return out.filter(o=>o.kind==='plant').length; });
ok(plants===3, `нарисовано кустов: ${plants}`);

// повтор того же слова на ту же грядку теперь разрешён: это ещё один куст
await p.evaluate(()=>{ window.__d=[]; const o=eval('toast'); eval('toast = m=>{ window.__d.push(m); return ('+o.toString()+')(m); }'); });
await p.evaluate(()=>eval("sendWS({t:'garden',act:'buy',lesson:'starter-01#apple'})"));
await p.waitForTimeout(700);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'plant',bed:0,lesson:'starter-01#apple'})"));
await p.waitForTimeout(800);
g=await G();
ok((g.beds['0'].words||[]).length===4 && (g.beds['0'].st.apple.k|0)===2,
   `то же слово посажено ещё раз: кустов на грядке ${(g.beds['0'].words||[]).length}, из них apple ${g.beds['0'].st.apple.k}`);

// урожай: у каждого куста свои плоды
await p.waitForTimeout(8600);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(800);
const ripe=await p.evaluate(()=>ripeWords(bedAt(0)));
const per={}; ripe.forEach(w=>per[w]=(per[w]||0)+1);
ok(Object.keys(per).length===3 && per.apple===(per.banana||0)*2,
   `созрели все три, а apple вдвое больше — два куста: ${Object.entries(per).map(([w,n])=>`${w}×${n}`).join(', ')}`);
// и через интерфейс: с семенем в руке подсказка предлагает досадить
await p.evaluate(()=>eval("sendWS({t:'garden',act:'buy',lesson:'starter-01#pear'})"));
await p.waitForTimeout(900);
await p.evaluate(()=>{ const it={id:'starter-01#pear',title:'x',theme:'pear'}; eval('seedInHand='+JSON.stringify(it));
  const q=bedPos(myPlotIndex(),0), P=window.game.P; P.x=q.x+1; P.z=q.z+1; });
await p.waitForTimeout(900);
const hint=await p.evaluate(()=>document.getElementById('hintBar').textContent);
ok(/Досадить/.test(hint), `подсказка на занятой грядке: «${hint}»`);
await p.evaluate(()=>window.game.doInteract());
await p.waitForTimeout(1600);
const after=(await G()).beds['0'].words.map(w=>w.word);
ok(after.length===5 && after.includes('pear'), `после «Досадить» на грядке ${after.length} кустов: ${after.join(', ')}`);
await b.close();
