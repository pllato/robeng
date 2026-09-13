// Экономика по словам: одно слово — один куст — один плод, дальше дороже и больше
import { chromium } from 'playwright';
import { execSync } from 'child_process';
const acc = JSON.parse(execSync('node setup.mjs').toString().trim().split('\n').pop());
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p=await b.newPage({viewport:{width:1100,height:720}});
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,160)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const G=()=>p.evaluate(()=>eval('myGarden'));
await p.addInitScript(t=>localStorage.setItem('me_token',t), acc.studentToken);
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1300);
await p.evaluate(()=>{const g=document.getElementById('spGo'); if(g&&g.offsetParent) g.click();});
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(2400);

let g=await G();
ok(Object.keys(g.seeds).length===0, 'в сумке пусто — первое семя лежит в киоске');
await p.evaluate(()=>openShop()); await p.waitForTimeout(1100);
await p.evaluate(()=>document.querySelector('#shopGrid .seedCard[data-buy]').click());
await p.waitForTimeout(1200);
await p.evaluate(()=>closeShop()); await p.waitForTimeout(400);
g=await G();
const seeds=Object.keys(g.seeds);
ok(seeds.length===1 && seeds[0].endsWith('#apple'), `взяли бесплатное семя: ${seeds[0]}`);
ok((g.coins|0)===0, 'подарок не стоил монет');

// сажаем
await p.evaluate(id=>eval(`sendWS({t:'garden',act:'plant',bed:0,lesson:'${id}'})`), seeds[0]);
await p.waitForTimeout(1100);
g=await G();
ok(g.beds['0'] && g.beds['0'].words.length===1, `на грядке один куст: ${g.beds['0'].words.map(w=>w.word).join(',')}`);

await p.waitForTimeout(9200);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(800);
let ripe=await p.evaluate(()=>ripeWords(bedAt(0)));
ok(ripe.length===3, `первый урожай щедрый — ${ripe.length} плода (${ripe.join(',')})`);

// собираем
await p.evaluate(()=>{ const q=bedPos(myPlotIndex(),0), P=window.game.P; P.x=q.x+.5; P.z=q.z+3; });
await p.waitForTimeout(600);
for(const w of ripe){ await p.evaluate(x=>window.game.checkWord(x), w); await p.waitForTimeout(450); }
await p.waitForTimeout(900);
g=await G();
const openW=Object.keys(g.openW||{});
ok(openW.some(x=>x.endsWith('#banana')), 'собрал apple → открылось banana: '+openW.join(', '));

// цена следующего слова выше
const prices=await p.evaluate(()=>eval('shopWords').map(w=>[w.word,w.price]));
ok(prices.length>=2, 'на прилавке слова с ценами: '+prices.map(([w,c])=>`${w} ${c}🪙`).join(' · '));
const byWord=Object.fromEntries(prices);
ok(byWord.banana>byWord.apple, `banana (${byWord.banana}) дороже apple (${byWord.apple})`);

// куст обобран целиком — он уходит на повторение, а не кормит бесконечно
await p.waitForTimeout(1000);
const cyc=await p.evaluate(()=>bedAt(0).cycle);
ok(cyc===1, `куст пошёл на второй круг (cycle=${cyc})`);
const wait2=await p.evaluate(()=>secsLeft(bedAt(0)));
ok(wait2>=800, `второй круг — это повторение: ждать ${Math.round(wait2/60)} мин, а не секунды`);

// закрытое слово купить нельзя
await p.evaluate(()=>{ window.__d=[]; });
await p.evaluate(()=>{ const o=eval('toast'); eval('toast = m=>{ window.__d.push(m); return ('+o.toString()+')(m); }'); });
const before=(await G()).coins;
await p.evaluate(()=>eval("sendWS({t:'garden',act:'buy',lesson:'starter-01#watermelon'})"));
await p.waitForTimeout(900);
const after=(await G()).coins;
ok(before===after, 'закрытое слово не купилось, монеты на месте');
const msgs=await p.evaluate(()=>window.__d);
ok(msgs.some(m=>/недоступн/.test(m)), 'сервер объяснил почему: «'+(msgs.find(m=>/недоступн/.test(m))||'—')+'»');
await b.close();
