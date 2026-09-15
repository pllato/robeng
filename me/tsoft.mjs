// Мягкое распознавание, ввод с пробелами и спутник-провожатый до станции
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p=await b.newPage({viewport:{width:1000,height:700}});
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,200)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
await p.addInitScript(()=>{ class F{start(){}stop(){}abort(){}} window.SpeechRecognition=F;
  window.webkitSpeechRecognition=F; const sp=window.speechSynthesis; if(sp) sp.speak=()=>{}; });
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1400);
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.waitForTimeout(2400);

// 1) созвучные слова засчитываются
const cases=[['pear','pair',true],['pear','fair',false],['orange','arrange',true],
             ['apple','a pill',true],['apple','pineapple',false],['watermelon','water melon',true],
             ['grapes','grape',true],['banana','bandana',false]];
for(const [target,heard,want] of cases){
  const got=await p.evaluate(o=>wordMatch(o.heard,o.target), {target,heard});
  ok(got===want, `«${heard}» ${want?'засчитано за':'не путается с'} «${target}»`);
}

// 2) пробелы в поле ввода не съедаются игрой
await p.evaluate(()=>{ eval('talkOn=true'); $('talk').classList.add('on');
  $('talkRow').classList.add('on'); $('talkInput').value=''; $('talkInput').focus(); });
await p.waitForTimeout(400);
await p.type('#talkInput','i like pear',{delay:30});
const typed=await p.evaluate(()=>document.getElementById('talkInput').value);
ok(typed==='i like pear', `в поле напечаталось с пробелами: «${typed}»`);
await p.evaluate(()=>{ eval('talkOn=false'); $('talk').classList.remove('on'); });

// 3) заказ → спутник приходит и ведёт к станции
const W=['apple','banana','orange','pear','grapes','lemon','watermelon','strawberry'];
const openW={}, cropsW={};
for(const w of W) openW['starter-01#'+w]=1;
for(const w of W.slice(0,-1)) cropsW['starter-01#'+w]=1;
await p.evaluate(()=>eval("closeTalk()"));
await p.evaluate(()=>eval("pixiDismiss()"));
await p.evaluate(o=>eval(`sendWS({t:'garden',act:'restore',garden:{coins:5,
  seeds:{'starter-01#${o.last}':1}, openW:${JSON.stringify(o.openW)}, cropsW:${JSON.stringify(o.cropsW)},
  open:{},beds:{},basket:{},done:{},crops:{}}})`), {openW,cropsW,last:W[7]});
await p.waitForTimeout(900);
await p.evaluate(w=>eval(`sendWS({t:'garden',act:'plant',bed:0,lesson:'starter-01#${w}'})`), W[7]);
await p.waitForTimeout(9600);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(700);
for(let i=0;i<6;i++){
  const left=await p.evaluate(()=>{const b=myGarden.beds['0']; return b?(b.ripe||[]).slice():[];});
  if(!left.length) break;
  await p.evaluate(w=>eval(`sendWS({t:'garden',act:'pick',bed:0,word:'${w}'})`), left[0]);
  await p.waitForTimeout(380);
}
await p.waitForTimeout(1400);
const ord=await p.evaluate(()=>myGarden.order);
ok(!!ord, `заказ пришёл: ${ord&&ord.kind}`);
const px=await p.evaluate(()=>({here:pixiHere(), on:eval('pixiOn'), done:eval('pixiDone'),
  kind:eval('roomKind'), paused:eval('paused')}));
ok(px.here, `спутник вернулся сам — провожать к станции (${JSON.stringify(px)})`);
const step=await p.evaluate(()=>{ const s=onbNow(); return {text:s&&s.text, go:s&&s.go, at:s&&s.at}; });
ok(step.go==='station', `подсказка ведёт на станцию: «${step.text}»`);
const st=await p.evaluate(k=>interactables.find(x=>x.act==='phrase'&&x.kind===k), ord.kind);
ok(step.at && Math.hypot(step.at.x-st.x, step.at.z-st.z)<2, 'и указывает именно на нужную станцию');
await p.waitForTimeout(2500);
const said=await p.evaluate(()=>eval('pixiSaid'));
ok(/задание|Пойдём/i.test(said||''), `спутник объяснил: «${(said||'').slice(0,80)}»`);
await b.close();
