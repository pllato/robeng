// Что будет дальше по программе: собрал тему по словам → открылся набор «вся тема»,
// а в наборе на каждом кусте снова по 2–3 плода.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx=await b.newContext({viewport:{width:1000,height:640}});
const p=await ctx.newPage();
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,160)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const G=()=>p.evaluate(()=>eval('myGarden'));
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1200);
// намеренно НЕ нажимаем «Войти» — иначе заведётся аккаунт, и сад будет серверным.
// здесь нужен именно гость: его сад можно поднять целиком одним сообщением.
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(2200);

// гость: поднимаем сад, где вся тема уже пройдена, кроме последнего слова
const words=await p.evaluate(async()=>{
  const les=await (await fetch('lessons/starter-01.json')).json();
  return les.vocabulary.map(v=>v.word);
});
const last=words[words.length-1];
await p.evaluate(({words,last})=>{
  const openW={}, cropsW={};
  for(const w of words){ openW['starter-01#'+w]=1; if(w!==last) cropsW['starter-01#'+w]=1; }
  sendWS({t:'garden',act:'restore',garden:{coins:500,seeds:{['starter-01#'+last]:1},openW,cropsW,beds:{},basket:{},done:{},open:{},crops:{}}});
},{words,last});
await p.waitForTimeout(1200);
let g=await G();
console.log('      openW:', Object.keys(g.openW||{}).length, '· seeds:', JSON.stringify(g.seeds), '· coins:', g.coins);
ok(Object.keys(g.openW).length===words.length, `все ${words.length} слов темы открыты`);
ok(!g.open['starter-01'], 'набор «вся тема» пока закрыт');

// сажаем последнее слово и собираем
await p.evaluate(w=>eval(`sendWS({t:'garden',act:'plant',bed:0,lesson:'starter-01#${w}'})`), last);
await p.waitForTimeout(1000);
await p.waitForTimeout(9200);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(800);
await p.evaluate(()=>{ const q=bedPos(myPlotIndex(),0), P=window.game.P; P.x=q.x+.5; P.z=q.z+3; });
await p.waitForTimeout(600);
for(let i=0;i<6;i++){
  const left=await p.evaluate(()=>ripeWords(bedAt(0)));
  if(!left.length) break;
  await p.evaluate(w=>window.game.checkWord(w), left[0]);
  await p.waitForTimeout(350);
}
await p.waitForTimeout(1000);
g=await G();
ok(!!g.open['starter-01'], `тема пройдена по словам → открылся набор «вся тема»`);
const nextFirst=Object.keys(g.openW).find(k=>k.startsWith('starter-02#'));
ok(!!nextFirst, 'и первое слово следующей темы: '+nextFirst);

// покупаем набор и проверяем, что кустов много и плодов на них 2–3
await p.evaluate(()=>eval("sendWS({t:'garden',act:'buy',lesson:'starter-01'})"));
await p.waitForTimeout(900);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'clear',bed:0})"));
await p.waitForTimeout(700);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'plant',bed:1,lesson:'starter-01'})"));
await p.waitForTimeout(1000);
g=await G();
const bd=g.beds['1'];
ok(bd && bd.words.length===words.length, `в наборе вся тема на одной грядке: ${bd?bd.words.length:0} кустов`);
await p.waitForTimeout(9200);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(800);
const ripe=await p.evaluate(()=>ripeWords(bedAt(1)));
const per={}; ripe.forEach(w=>per[w]=(per[w]||0)+1);
const counts=[...new Set(Object.values(per))].sort();
ok(ripe.length>words.length, `плодов в наборе ${ripe.length} на ${words.length} кустов`);
ok(counts.every(c=>c>=2&&c<=3), 'на каждом кусте 2–3 плода: '+Object.entries(per).map(([w,n])=>`${w}×${n}`).join(', '));
await b.close();
