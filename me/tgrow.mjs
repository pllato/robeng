// Новый материал — быстро, повторение — медленно.
// Первый круг куста созревает почти сразу, дальше тот же куст уходит на повторение (15-20 мин),
// а только что посаженное слово снова зреет быстро — чтобы ребёнка тянуло к новым словам.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p=await b.newPage({viewport:{width:1000,height:640}});
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,160)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const G=()=>p.evaluate(()=>eval('myGarden'));
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1400);
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(2200);
await p.evaluate(()=>eval(`sendWS({t:'garden',act:'restore',garden:{coins:99,
  seeds:{'starter-01#apple':1,'starter-01#banana':1},
  openW:{'starter-01#apple':1,'starter-01#banana':1},
  beds:{},basket:{},done:{},open:{},crops:{},cropsW:{}}})`));
await p.waitForTimeout(1000);

// сажаем apple: первый круг обязан поспеть почти сразу
await p.evaluate(()=>eval("sendWS({t:'garden',act:'plant',bed:0,lesson:'starter-01#apple'})"));
await p.evaluate(()=>{ const q=bedPos(myPlotIndex(),0), P=window.game.P; P.x=q.x+.5; P.z=q.z+3; });
await p.waitForTimeout(1200);
let g=await G();
const first=Math.round((g.beds['0'].st.apple.r-Date.now())/1000);
ok(first<=9, `новое слово зреет сразу: ждать ${first} с`);

await p.waitForTimeout(8800);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(700);
const crop=await p.evaluate(()=>ripeWords(bedAt(0)));
ok(crop.length>=2, `первый урожай щедрый: ${crop.length} плода — ${crop.join(', ')}`);
for(let i=0;i<6;i++){
  const left=await p.evaluate(()=>ripeWords(bedAt(0)));
  if(!left.length) break;
  await p.evaluate(w=>window.game.checkWord(w), left[0]);
  await p.waitForTimeout(420);
}
g=await G();
const again=Math.round((g.beds['0'].st.apple.r-Date.now())/1000);
ok(again>=800 && again<=960, `обобранный куст ушёл на повторение: ждать ${Math.round(again/60)} мин`);

// досаживаем banana — новое слово зреет быстро, хотя сосед по грядке на повторении
await p.evaluate(()=>eval("sendWS({t:'garden',act:'plant',bed:0,lesson:'starter-01#banana'})"));
await p.waitForTimeout(1000);
g=await G();
const banWait=Math.round((g.beds['0'].st.banana.r-Date.now())/1000);
ok(banWait<=9, `новое слово banana зреет сразу: ждать ${banWait} с, хотя apple ждёт ${Math.round(again/60)} мин`);
// у каждого куста всё равно свой отсчёт, просто длительность одинаковая
ok((await p.evaluate(()=>{ const b=bedAt(0); return b.st.apple.r!==b.st.banana.r; })),
   'сроки у растений считаются по отдельности, а не общим на грядку');

// ждём — поспевают оба, каждый по своему таймеру
await p.waitForTimeout(9600);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(700);
const ripe=await p.evaluate(()=>ripeWords(bedAt(0)));
ok(ripe.includes('banana'), `созрел banana: [${ripe.join(', ')}]`);
await b.close();
