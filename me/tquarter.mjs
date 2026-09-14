// Разговорный квартал: четыре станции на улице, у каждой своё оформление и лента с предметами
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
await p.waitForTimeout(2600);

const st=await p.evaluate(()=>interactables.filter(x=>x.act==='phrase')
  .map(x=>({kind:x.kind, x:Math.round(x.x), z:Math.round(x.z)})));
ok(st.length===4, `станций на улице: ${st.length} — ${st.map(s=>s.kind).join(', ')}`);
const o=await p.evaluate(()=>gardenOrigin());
ok(st.every(s=>Math.abs(s.x-o.sx)<=7), 'все стоят на улице, а не на чужих огородах');
ok(st.every(s=>s.z>o.sz), 'квартал — дальше по улице, за прилавками');
const sides=new Set(st.map(s=>s.x>o.sx?'право':'лево'));
ok(sides.size===2, 'павильоны чередуются по сторонам улицы — проход остаётся');

// у каждой станции свой житель и своя вывеска
const tags=await p.evaluate(()=>worldTags.filter(w=>w.el.className.includes('st')).map(w=>w.el.textContent));
ok(tags.length===4, `вывески: ${tags.map(t=>t.split('\n')[0].trim()).join(' · ')}`);
const npcCount=await p.evaluate(()=>eval('npcs').length);
ok(npcCount>=6, `жителей на улице: ${npcCount} (2 прилавка + 4 станции)`);

// лента живая: ящики едут и подписаны словом
const belt=await p.evaluate(()=>eval('beltItems').length);
ok(belt===12, `ящиков на лентах: ${belt} (по три на станцию)`);
const z1=await p.evaluate(()=>eval('beltItems')[0].tag.z);
await p.waitForTimeout(1600);
const z2=await p.evaluate(()=>eval('beltItems')[0].tag.z);
ok(Math.abs(z2-z1)>0.05, `лента движется: ${z1.toFixed(2)} → ${z2.toFixed(2)}`);
const html=await p.evaluate(()=>eval('beltItems')[0].tag.el.innerHTML);
ok(/<b>/.test(html), `на ящике предмет и его слово: «${html.replace(/<[^>]+>/g,' ').trim()}»`);

// вывеска не висит через всю улицу
const near=await p.evaluate(()=>worldTags.filter(w=>w.near).length);
ok(near>=12, `подписи квартала прячутся издалека: ${near} шт. с ограничением видимости`);

// подойти можно к каждой
for(const s of st){
  await p.evaluate(q=>{ const P=window.game.P; P.x=q.x; P.z=q.z; }, s);
  await p.waitForTimeout(450);
  const h=await p.evaluate(()=>eval('hintNear')&&eval('hintNear').kind);
  ok(h===s.kind, `у станции «${s.kind}» подсказка появляется`);
}
await p.screenshot({path:'g-b38-quarter.png'});
await b.close();
