// На грядке два разных плода: нажал на апельсин — должен сорваться апельсин, а не яблоко
import { chromium, devices } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx=await b.newContext({...devices['iPhone 13'],viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const p=await ctx.newPage();
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,170)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const G=()=>p.evaluate(()=>eval('myGarden'));
// подменяем распознавание, чтобы говорить за ребёнка
await p.addInitScript(()=>{
  window.__log={said:[],heard:[]};
  class SR{ constructor(){ window.__SR=this; } start(){ setTimeout(()=>this.onstart&&this.onstart(),1); }
    stop(){ this.onend&&this.onend(); } abort(){ this.onend&&this.onend(); } }
  window.SpeechRecognition=window.webkitSpeechRecognition=SR;
  const sp=window.speechSynthesis;
  window.speechSynthesis={ cancel(){}, speak(u){ window.__log.said.push(u.text);
    setTimeout(()=>u.onend&&u.onend(),10); } };
});
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1500);
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(2400);
// грядка с двумя видами: два яблока и один апельсин
await p.evaluate(()=>eval(`sendWS({t:'garden',act:'restore',garden:{soldOnce:1,coins:9,
  seeds:{},openW:{'starter-01#apple':1,'starter-01#orange':1},cropsW:{'starter-01#apple':2},
  beds:{'0':{seed:'starter-01#apple',lesson:'starter-01',
    words:[{word:'apple'},{word:'orange'}],cycle:1,ripe:[],readyAt:Date.now()-1,
    st:{apple:{c:1,r:Date.now()-1,n:2}, orange:{c:0,r:Date.now()-1,n:1}}}},
  basket:{},done:{},open:{},crops:{}}})`));
await p.waitForTimeout(1400);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(900);
await p.evaluate(()=>{ const q=bedPos(myPlotIndex(),0), P=window.game.P; P.x=q.x+.5; P.z=q.z+4; });
await p.waitForTimeout(800);

const ripe=await p.evaluate(()=>ripeWords(bedAt(0)));
ok(ripe.filter(w=>w==='apple').length===2 && ripe.filter(w=>w==='orange').length===1,
   `на грядке висят: ${ripe.join(', ')}`);
// подпись честно перечисляет оба вида
const hint=await p.evaluate(()=>document.getElementById('hintBar').textContent);
ok(/🍎/.test(hint)&&/×2/.test(hint), `подсказка показывает оба вида: «${hint.trim()}»`);

// целимся именно в апельсин
const f=await p.evaluate(()=>{ const l=myRipeFruits().filter(x=>x.word==='orange'); if(!l.length) return null;
  const pt=project(lastMVP,l[0].x,l[0].y+l[0].s*2,l[0].z);
  return pt?{x:Math.round(pt[0]),y:Math.round(pt[1])}:null; });
ok(!!f, 'апельсин виден на экране');
await p.evaluate(pt=>pickStart(pt.x,pt.y), f);
await p.waitForTimeout(400);
ok((await p.evaluate(()=>eval('holdFruit')&&eval('holdFruit').word))==='orange',
   'палец держит именно апельсин');

// говорим «apple» — оно не должно ничего сорвать
const before=await G();
await p.evaluate(()=>window.game.checkWord('apple'));
await p.waitForTimeout(900);
let g=await G();
ok(JSON.stringify(g.basket)===JSON.stringify(before.basket),
   `сказал «apple», держа апельсин — ничего не сорвалось (корзина ${JSON.stringify(g.basket)})`);
ok((await p.evaluate(()=>ripeWords(bedAt(0)).filter(w=>w==='apple').length))===2,
   'оба яблока на месте');

// говорим «orange» — срывается апельсин
await p.evaluate(()=>window.game.checkWord('orange'));
await p.waitForTimeout(1100);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(800);
const after=await p.evaluate(()=>ripeWords(bedAt(0)));
ok(!after.includes('orange'), `апельсин сорван, осталось: ${after.join(', ')}`);
ok(after.filter(w=>w==='apple').length===2, 'а яблоки не тронуты');

// свой же голос игра не засчитывает
await p.evaluate(()=>{ window.__blocked=0;
  const o=window.game.checkWord; });
const st=await p.evaluate(()=>{ say('apple'); return eval('gameTalking()'); });
ok(st===true, 'пока игра проговаривает слово, она считает, что микрофон слышит её саму');
await b.close();
