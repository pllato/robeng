// 💎 Диковинки: выпадают редко, не продаются в киоске, выглядят иначе, стоят дорого
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p=await b.newPage({viewport:{width:1000,height:760}});
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

// каталог диковинок есть и это настоящие английские слова
const rare=await p.evaluate(()=>fetch('lessons/rare-01.json').then(r=>r.json()));
ok(rare.vocabulary.length>=8, `диковинок в каталоге: ${rare.vocabulary.length} — ${rare.vocabulary.slice(0,4).map(w=>w.emoji+w.word).join(' ')}`);

// в киоске их не продают
await p.evaluate(()=>eval(`sendWS({t:'garden',act:'restore',garden:{coins:999999,
  seeds:{}, openW:{'starter-01#apple':1,'rare-01#mango':1}, open:{},
  beds:{},basket:{},done:{},crops:{},cropsW:{}}})`));
await p.waitForTimeout(1000);
const onSale=await p.evaluate(()=>(eval('shopWords')||[]).map(w=>w.id));
ok(!onSale.some(id=>id.startsWith('rare-01')), `на прилавке диковинок нет: ${onSale.join(', ')}`);

// но найденную можно посадить, и она выглядит иначе
await p.evaluate(()=>eval("sendWS({t:'garden',act:'restore',garden:{coins:50,"
  +"seeds:{'rare-01#mango':1,'starter-01#apple':1},"
  +"openW:{'rare-01#mango':1,'starter-01#apple':1},open:{},"
  +"beds:{},basket:{},done:{},crops:{},cropsW:{}}})"));
await p.waitForTimeout(900);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'plant',bed:0,lesson:'rare-01#mango'})"));
await p.evaluate(()=>eval("sendWS({t:'garden',act:'plant',bed:1,lesson:'starter-01#apple'})"));
await p.waitForTimeout(9800);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(900);
const size=await p.evaluate(()=>{
  const mk=n=>{ const l=[]; bedPlants(bedAt(n),bedPos(myPlotIndex(),n),l,true); return l; };
  const r=mk(0), o=mk(1);
  const tr=r.find(x=>x.kind==='plant'), to=o.find(x=>x.kind==='plant');
  return {rareH:+tr.h.toFixed(2), normH:+to.h.toFixed(2),
    rareFruit:+(r.find(x=>x.kind==='fruit')||{s:0}).s.toFixed(3),
    normFruit:+(o.find(x=>x.kind==='fruit')||{s:0}).s.toFixed(3),
    isRare:bedRare(bedAt(0)), notRare:bedRare(bedAt(1))};
});
ok(size.isRare && !size.notRare, 'игра отличает грядку с диковинкой от обычной');
ok(size.rareH>size.normH*1.4, `дерево диковинки выше: ${size.rareH} против ${size.normH}`);
ok(size.rareFruit>size.normFruit, `и плод крупнее: ${size.rareFruit} против ${size.normFruit}`);
const leaf=await p.evaluate(()=>{ const V=[]; pushPlant(V,0,0,0,4,0,'mango');
  const W=[]; pushPlant(W,0,0,0,4,0,0); return V.length!==W.length || JSON.stringify(V)!==JSON.stringify(W); });
ok(leaf, 'крона и ствол диковинки рисуются по-своему');
const label=await p.evaluate(()=>bedLabel(bedAt(0),true,true));
ok(/ДИКОВИНКА/.test(label), `подпись грядки: «${label.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}»`);

// стоит дорого — как восемь лучших обычных плодов
const words=await p.evaluate(()=>ripeWords(bedAt(0)));
for(const w of words.slice(0,2)){
  await p.evaluate(x=>eval(`sendWS({t:'garden',act:'pick',bed:0,word:'${x}'})`), w);
  await p.waitForTimeout(400);
}
const before=(await G()).coins;
await p.evaluate(()=>eval("sendWS({t:'garden',act:'sell'})"));
await p.waitForTimeout(1200);
const after=(await G()).coins;
ok(after-before>=40, `диковинка ушла дорого: +${after-before} 🪙 за ${words.slice(0,2).length} плода`);

// и выпадает сама при сборе обычного урожая (сервер запущен с RARE_CHANCE=1)
if(process.argv[2]==='drop'){
  await p.evaluate(()=>eval("sendWS({t:'garden',act:'restore',garden:{coins:0,"
    +"seeds:{'starter-01#apple':1},openW:{'starter-01#apple':1},open:{},"
    +"beds:{},basket:{},done:{},crops:{},cropsW:{}}})"));
  await p.waitForTimeout(900);
  await p.evaluate(()=>eval("sendWS({t:'garden',act:'plant',bed:2,lesson:'starter-01#apple'})"));
  await p.waitForTimeout(9600);
  await p.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await p.waitForTimeout(700);
  await p.evaluate(()=>{ window.__t=[]; const o=eval('toast');
    eval('toast = m=>{ window.__t.push(m); return ('+o.toString()+')(m); }'); });
  await p.evaluate(()=>eval("sendWS({t:'garden',act:'pick',bed:2,word:'apple'})"));
  await p.waitForTimeout(1200);
  const g2=await G();
  const got=Object.keys(g2.seeds||{}).filter(id=>id.startsWith('rare-01'));
  ok(got.length>0, `при сборе выпала диковинка: ${got.join(', ')}`);
  ok((g2.rares|0)>0, `счётчик находок вырос: ${g2.rares}`);
  const msgs=await p.evaluate(()=>window.__t);
  ok(msgs.some(m=>/ДИКОВИНКА/.test(m)), `игра объявила находку: «${msgs.find(m=>/ДИКОВИНКА/.test(m))||'—'}»`);
}
await p.screenshot({path:'g-b46-rare.png'});
await b.close();
