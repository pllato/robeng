// Жалоба: «собрал apple — другие плоды больше не определяются»
import { chromium, devices } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx=await b.newContext({...devices['iPhone 13'],viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const p=await ctx.newPage();
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,200)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
await p.addInitScript(()=>{
  class FakeSR{ start(){ window.__SR=this; } stop(){ if(this.onend) this.onend(); } abort(){ this.stop(); } }
  window.SpeechRecognition=FakeSR; window.webkitSpeechRecognition=FakeSR;
  const sp=window.speechSynthesis; if(sp) sp.speak=()=>{};
});
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1400);
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.waitForTimeout(2400);
await p.evaluate(()=>eval("pixiDismiss()"));
await p.evaluate(()=>eval(`sendWS({t:'garden',act:'restore',garden:{coins:5,
  seeds:{'starter-01#apple':1,'starter-01#orange':1},
  openW:{'starter-01#apple':1,'starter-01#banana':1,'starter-01#orange':1},
  beds:{},basket:{},done:{},open:{},crops:{},cropsW:{}}})`));
await p.waitForTimeout(1000);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'plant',bed:0,lesson:'starter-01#apple'})"));
await p.waitForTimeout(400);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'plant',bed:0,lesson:'starter-01#orange'})"));
await p.waitForTimeout(9800);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(900);
const ripe=await p.evaluate(()=>ripeWords(bedAt(0)));
ok(ripe.includes('apple')&&ripe.includes('orange'), `на грядке созрело: ${ripe.join(', ')}`);

// встаём перед грядкой
await p.evaluate(()=>{ const q=bedPos(myPlotIndex(),0), P=window.game.P;
  P.x=q.x+.5; P.z=q.z+3.5; P.yaw=0; P.pitch=0.25; });
await p.waitForTimeout(900);
const tapWord=async (w)=>{
  const f=await p.evaluate(word=>{ const list=myRipeFruits().filter(x=>x.word===word);
    if(!list.length) return null;
    const pt=project(lastMVP,list[0].x,list[0].y+list[0].s*2,list[0].z);
    return pt?{x:Math.round(pt[0]),y:Math.round(pt[1])}:null; }, w);
  if(!f) return null;
  await p.evaluate(pt=>{ const c=document.querySelector('canvas');
    c.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,cancelable:true,
      changedTouches:[new Touch({identifier:1,target:c,clientX:pt.x,clientY:pt.y})]})); }, f);
  await p.waitForTimeout(500);
  return f;
};
// 0. микрофон не должен открываться, пока игра сама проговаривает слово:
// ребёнок отвечает сразу, и раньше его первое слово молча выбрасывалось
await p.evaluate(()=>{ window.__mic=[]; });
let hit=await tapWord('apple');
ok(!!hit, 'нажали на apple');
ok((await p.evaluate(()=>!!holdFruit)) , 'плод взят в руку');
const talking=await p.evaluate(()=>({talk:gameTalking(), listen:eval('listening'),
  tag:document.getElementById('pickTag').textContent}));
ok(talking.talk && !talking.listen, `игра проговаривает слово — микрофон ещё закрыт («${talking.tag}»)`);
await p.waitForFunction(()=>eval('listening'),null,{timeout:6000}).catch(()=>{});
const after=await p.evaluate(()=>({talk:gameTalking(), listen:eval('listening'),
  tag:document.getElementById('pickTag').textContent}));
ok(!after.talk && after.listen, `договорила — микрофон открылся («${after.tag}»)`);
let got=await p.evaluate(()=>window.game.checkWord('apple'));
await p.waitForTimeout(1200);
ok(got===true, 'apple сорван голосом');
const hf=await p.evaluate(()=>holdFruit?holdFruit.word:null);
ok(hf===null, `после сбора рука свободна (в руке: ${hf||'ничего'})`);

// 2. и сразу срываем orange — вот это ломалось
await p.evaluate(()=>{ const c=document.querySelector('canvas');
  c.dispatchEvent(new TouchEvent('touchend',{bubbles:true,cancelable:true,
    changedTouches:[new Touch({identifier:1,target:c,clientX:0,clientY:0})]})); });
await p.waitForTimeout(700);
hit=await tapWord('orange');
ok(!!hit, 'нажали на orange');
const hf2=await p.evaluate(()=>holdFruit?holdFruit.word:null);
ok(hf2==='orange', `в руке теперь: ${hf2||'ничего'}`);
got=await p.evaluate(()=>window.game.checkWord('orange'));
await p.waitForTimeout(1200);
ok(got===true, 'orange тоже сорван');
const left=await p.evaluate(()=>ripeWords(bedAt(0)));
ok(left.filter(w=>w==='apple').length===2 && left.filter(w=>w==='orange').length===2,
   `на кусте осталось: ${left.join(', ')}`);

// 3. и третий раз подряд — apple снова
hit=await tapWord('apple');
got=await p.evaluate(()=>window.game.checkWord('apple'));
await p.waitForTimeout(1000);
ok(got===true, 'второй apple сорван — подряд собирать можно');
const basket=await p.evaluate(()=>Object.values(myGarden.basket||{}).reduce((a,b)=>a+b,0));
ok(basket===3, `в корзине ${basket} плода`);
await b.close();
