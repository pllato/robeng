// Прокачанный огород должен быть виден с улицы: забор, дорожки, фонари, теплица
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p=await b.newPage({viewport:{width:1100,height:700}});
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,200)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
await p.addInitScript(()=>{ class F{start(){}stop(){}abort(){}} window.SpeechRecognition=F;
  window.webkitSpeechRecognition=F; const sp=window.speechSynthesis; if(sp) sp.speak=()=>{}; });
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1400);
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.waitForTimeout(2400);
await p.evaluate(()=>eval("pixiDismiss()"));
const lv0=await p.evaluate(()=>plotLevel(myPlotIndex()));
ok(lv0===0, `пустой участок — уровень ${lv0}`);
// подделываем чужие данные участка, чтобы проверить все ступени без часа игры
const shot=async (n,name)=>{
  await p.evaluate(cnt=>{
    const mi=myPlotIndex(), beds={};
    const words=['apple','banana','orange','pear','grapes','lemon','watermelon','strawberry'];
    let made=0;
    for(let bi=0; bi<12 && made<cnt; bi++){
      const ws=[];
      for(const w of words){ if(made>=cnt) break; ws.push({word:w+(bi?bi:''),emoji:'🍎'}); made++; }
      beds[String(bi)]={lesson:'starter-0'+(bi%9||1),title:'T',theme:'T',tier:0,words:ws,ripe:[],cycle:0,readyAt:0,st:{}};
    }
    plots[mi]={...plots[mi], beds};
    gardenRedraw();
  }, n);
  await p.waitForTimeout(1200);
  const lv=await p.evaluate(()=>plotLevel(myPlotIndex()));
  await p.evaluate(()=>{ const c=plotPos(myPlotIndex()), P=window.game.P;
    P.x=c.x+0.5; P.z=c.z+PLOT_RZ+16; P.y=c.y+7; P.yaw=0; P.pitch=0.30; });
  await p.waitForTimeout(900);
  await p.screenshot({path:`g-b40-lvl${lv}.png`});
  return lv;
};
const l1=await shot(6);   ok(l1===1, `6 растений → уровень ${l1}: дорожки между грядками`);
const path=await p.evaluate(()=>{ const c=plotPos(myPlotIndex());
  return getB(c.x, c.y-1+1, c.z-4)===PLANK || getB(c.x, c.y, c.z-4)===PLANK; });
ok(path, 'дорожка появилась на участке');
const l2=await shot(12);  ok(l2===2, `12 растений → уровень ${l2}: клумбы и фонари`);
const lamp=await p.evaluate(()=>{ const c=plotPos(myPlotIndex()), H=c.y-1;
  return getB(c.x-PLOT_RX, H+4, c.z-PLOT_RZ)===C_YEL || getB(c.x+PLOT_RX,H+4,c.z+PLOT_RZ)===C_YEL; });
ok(lamp, 'на столбах зажглись фонари');
const l3=await shot(22);  ok(l3===3, `22 растения → уровень ${l3}: кирпичный забор и теплица`);
const glass=await p.evaluate(()=>{ const c=plotPos(myPlotIndex()), H=c.y-1, mi=myPlotIndex();
  const gx = mi%2? c.x-PLOT_RX+3 : c.x+PLOT_RX-3;
  return getB(gx,H+2,c.z)===GLASS; });
ok(glass, 'у калитки стоит стеклянная теплица');
const fence=await p.evaluate(()=>{ const c=plotPos(myPlotIndex()), H=c.y-1;
  return getB(c.x, H+1, c.z-PLOT_RZ); });
ok(fence===9, `забор сменился на кирпичный (блок ${fence})`);
const l4=await shot(40);  ok(l4===4, `40 растений → уровень ${l4}: золотые колонны`);
const gold=await p.evaluate(()=>{ const c=plotPos(myPlotIndex()), H=c.y-1;
  return getB(c.x+PLOT_RX,H+5,c.z+PLOT_RZ)===C_YEL; });   // угол с меткой «мой участок» не трогаем
ok(gold, 'по углам поднялись золотые колонны');
await b.close();
