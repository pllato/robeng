// Распознавание должно срабатывать мгновенно и показывать, что услышала игра
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p=await b.newPage({viewport:{width:1000,height:700}});
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,200)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
// поддельный распознаватель, который умеет отдавать промежуточные результаты, как настоящий
await p.addInitScript(()=>{
  class FakeSR{
    constructor(){ this.interimResults=false; }
    start(){ window.__SR=this; }
    stop(){ if(this.onend) this.onend(); }
    abort(){ this.stop(); }
    feed(text, isFinal){
      const alt={transcript:text}; const res=[alt]; res.isFinal=!!isFinal; res.length=1; res[0]=alt;
      if(this.onresult) this.onresult({resultIndex:0, results:{0:res, length:1, [Symbol.iterator]:function*(){yield res;}}});
    }
  }
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
  seeds:{'starter-01#apple':1},openW:{'starter-01#apple':1},
  beds:{},basket:{},done:{},open:{},crops:{},cropsW:{}}})`));
await p.waitForTimeout(900);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'plant',bed:0,lesson:'starter-01#apple'})"));
await p.waitForTimeout(9600);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(800);

ok(await p.evaluate(()=>{ const r=new (window.SpeechRecognition)(); startListen(true);
  return eval('recog').interimResults===true; }), 'микрофон слушает с промежуточными результатами — не ждём конца фразы');
await p.evaluate(()=>stopListen());
await p.waitForTimeout(400);

// берём плод и говорим — засчитывается по промежуточному результату
await p.evaluate(()=>{ const q=bedPos(myPlotIndex(),0), P=window.game.P;
  P.x=q.x+.5; P.z=q.z+4; P.yaw=0; P.pitch=0.25; });
await p.waitForTimeout(700);
const f=await p.evaluate(()=>{ const l=myRipeFruits(); if(!l.length) return null;
  const pt=project(lastMVP,l[0].x,l[0].y+l[0].s*2,l[0].z);
  return pt?{x:Math.round(pt[0]),y:Math.round(pt[1])}:null; });
await p.evaluate(pt=>pickStart(pt.x,pt.y), f);
await p.waitForFunction(()=>eval('listening'),null,{timeout:6000});
ok(true, 'плод в руке, микрофон открыт');

await p.evaluate(()=>{ window.__t=[]; const o=eval('toast');
  eval('toast = m=>{ window.__t.push(m); return ('+o.toString()+')(m); }'); });
// ребёнок ещё договаривает — промежуточный текст уже показан, но игра молчит
await p.evaluate(()=>window.__SR.feed('app', false));
await p.waitForTimeout(250);
const tag1=await p.evaluate(()=>document.getElementById('pickTag').textContent);
ok(/app/.test(tag1), `видно, что игра слышит: «${tag1.replace('apple','apple · ')}»`);
ok((await p.evaluate(()=>window.__t)).length===0, 'и не перебивает — на полуслове не ругается');

// сказал не то и договорил — вот теперь игра объясняет и показывает услышанное
await p.evaluate(()=>window.__SR.feed('banana', true));
await p.waitForTimeout(700);
const msgs=await p.evaluate(()=>window.__t);
ok(msgs.some(m=>/banana/.test(m)), `сказал не то — игра показала что услышала: «${msgs.find(m=>/banana/.test(m))||'—'}»`);
const tag2=await p.evaluate(()=>document.getElementById('pickTag').textContent);
ok(/banana/.test(tag2), `и над плодом тоже: «${tag2}»`);

// сказал верно — засчитано по промежуточному результату, не дожидаясь конца фразы
await p.waitForFunction(()=>!gameTalking(),null,{timeout:6000});
const before=await p.evaluate(()=>ripeWords(bedAt(0)).length);
await p.evaluate(()=>window.__SR.feed('apple', false));
await p.waitForTimeout(900);
const after=await p.evaluate(()=>ripeWords(bedAt(0)).length);
ok(after===before-1, `плод сорван по промежуточному результату: было ${before}, стало ${after}`);
await b.close();
