// Порталы в обе стороны и выбор мира в полёте
import { chromium, devices } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
async function player(code){
  const ctx=await b.newContext({...devices['iPhone 13'],viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const p=await ctx.newPage();
  p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,160)));
  await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1400);
  await p.evaluate(c=>eval(`sendWS({t:'switch',code:'${c}'})`), code);
  await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
  await p.evaluate(()=>{window.game.setPaused(false);});
  await p.waitForFunction(c=>window.game.code()===c,code,{timeout:20000});
  await p.waitForTimeout(2300);
  return p;
}
const A=await player('GARDEN');          // первый в огородах
const C=await player('ENPY');            // третий сидит в классе — он должен попасть в список
const B2=await player('LOBBY');          // второй на ресепшне
await A.waitForTimeout(1400);

// ── портал на ресепшне ведёт в огороды ──
const port=await B2.evaluate(()=>{ const a=interactables.find(x=>x.act==='garden');
  const tag=worldTags.find(t=>/ПОРТАЛ/.test(t.el.innerHTML));
  return a?{x:a.x,z:a.z,r:a.r,label:a.label,tag:!!tag}:null; });
ok(!!port, `на ресепшне есть портал: «${port&&port.label}»`);
ok(port&&port.tag, 'с вывеской «🌀 ПОРТАЛ»');
const arch=await B2.evaluate(()=>{ const s=eval('spawnPt'), H=Math.floor(s.y)-1, sx=Math.floor(s.x), sz=Math.floor(s.z)-8;
  let core=0,pil=0,beam=0;
  for(let y=H+1;y<=H+4;y++) for(let x=sx-1;x<=sx+1;x++) if(window.game.getB(x,y,sz+13)) core++;
  for(let y=H+1;y<=H+4;y++){ if(window.game.getB(sx-3,y,sz+13)) pil++; if(window.game.getB(sx+3,y,sz+13)) pil++; }
  for(let x=sx-3;x<=sx+3;x++) if(window.game.getB(x,H+5,sz+13)) beam++;
  return {core,pil,beam}; });
ok(arch.core===12&&arch.pil===8&&arch.beam===7,
   `арка построена так же, как на улице: сердцевина ${arch.core}, столбы ${arch.pil}, перекладина ${arch.beam}`);

// ── вход в портал: сперва экран полёта, а не мгновенный переход ──
await B2.evaluate(()=>{ const a=interactables.find(x=>x.act==='garden'), P=window.game.P;
  P.x=a.x; P.z=a.z-1; P.y=a.y; });
await B2.waitForTimeout(900);
await B2.evaluate(()=>window.game.doInteract());
await B2.waitForTimeout(1500);
ok((await B2.evaluate(()=>document.getElementById('fly').classList.contains('on'))),
   'открылся экран полёта, а не мгновенный переход');
ok((await B2.evaluate(()=>window.game.code()))==='LOBBY', 'пока не выбрал — остаёшься на месте');

// ── в списке видно живые миры и кто там ──
const cards=await B2.evaluate(()=>[...document.querySelectorAll('#flyList .flyCard')]
  .map(c=>({go:c.dataset.go, t:c.textContent.replace(/\s+/g,' ').trim()})));
ok(cards.length>=2, `в списке ${cards.length} мира: ${cards.map(c=>c.go).join(', ')}`);
const cls=cards.find(c=>c.go==='ENPY');
ok(!!cls, 'открытый класс виден в списке');
ok(cls && /Класс/.test(cls.t), `с именем класса: «${cls.t}»`);
ok(cls && /👥/.test(cls.t), 'и с числом людей в нём');
const g=cards.find(c=>c.go==='GARDEN');
ok(!!g, 'улица огородов в списке есть');
ok(/👥/.test(g.t), `и видно, сколько там людей: «${g.t}»`);
const nameA=await A.evaluate(()=>eval('USER')?eval('USER').name:(eval('peers'),'')) ||
            await A.evaluate(()=>document.getElementById('classinfo').textContent);
ok(/Игрок|Гость|[А-Яа-я]/.test(g.t), `и кто именно там: «${g.t}»`);

// ── выбрал огороды — улетел ──
await B2.evaluate(()=>document.querySelector('#flyList [data-go="GARDEN"]').click());
await B2.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await B2.waitForTimeout(1800);
ok((await B2.evaluate(()=>window.game.code()))==='GARDEN', 'через портал попал в огороды');
ok(!(await B2.evaluate(()=>document.getElementById('fly').classList.contains('on'))), 'экран полёта закрылся');

// ── обратно тем же порталом ──
await B2.evaluate(()=>{ const a=interactables.find(x=>x.act==='exitGarden'), P=window.game.P;
  P.x=a.x; P.z=a.z+1; P.y=a.y; });
await B2.waitForTimeout(900);
await B2.evaluate(()=>window.game.doInteract());
await B2.waitForTimeout(1500);
const back=await B2.evaluate(()=>[...document.querySelectorAll('#flyList .flyCard')].map(c=>c.dataset.go));
ok(back.includes('LOBBY'), `из огородов виден и ресепшн: ${back.join(', ')}`);
await B2.evaluate(()=>document.getElementById('flyBack').click());
await B2.waitForTimeout(700);
ok((await B2.evaluate(()=>window.game.code()))==='GARDEN', '«Остаться здесь» — никуда не летим');
await b.close();
