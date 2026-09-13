// Вход сразу на свой огород, а школа — за порталом на улице
import { chromium, devices } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx=await b.newContext({...devices['iPhone 13'],viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const p=await ctx.newPage();
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,170)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1500);

const btn=await p.evaluate(()=>{ const g=document.getElementById('spGo'); return g?g.textContent.trim():null; });
ok(btn && /огород/i.test(btn), `кнопка на первом экране: «${btn}»`);

await p.evaluate(()=>document.getElementById('spGo').click());
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.waitForTimeout(2600);
ok((await p.evaluate(()=>window.game.code()))==='GARDEN', 'после кнопки сразу улица огородов, без лобби');

// стоим на своём участке, а не где попало
const where=await p.evaluate(()=>{ const P=window.game.P, i=myPlotIndex();
  if(i<0) return null; const c=plotPos(i);
  return {mine:i, d:+Math.hypot(P.x-c.x,P.z-c.z).toFixed(1), x:+P.x.toFixed(1), z:+P.z.toFixed(1)}; });
ok(where && where.mine>=0, `участок выдан: №${where&&where.mine}`);
ok(where && where.d<24, `игрок стоит на своём участке: ${where.d} блоков от центра`);

// портал в школу на улице
const port=await p.evaluate(()=>{
  const a=interactables.find(x=>x.act==='exitGarden');
  const tag=worldTags.find(t=>/ПОРТАЛ/.test(t.el.innerHTML));
  return a?{x:a.x,y:a.y,z:a.z,r:a.r,label:a.label,tag:!!tag}:null; });
ok(!!port, `портал есть: «${port&&port.label}»`);
ok(port && port.tag, 'над ним вывеска «🌀 ПОРТАЛ»');
ok(port && port.r>=3, `к порталу не надо целиться пиксель в пиксель: радиус ${port&&port.r}`);

// арка действительно построена из блоков
const arch=await p.evaluate(pt=>{
  const {sx,sz,H}=gardenOrigin();
  let core=0, pillars=0, beam=0, path=0;
  for(let y=H+1;y<=H+4;y++) for(let x=sx-1;x<=sx+1;x++) if(window.game.getB(x,y,sz-12)) core++;
  for(let y=H+1;y<=H+4;y++){ if(window.game.getB(sx-3,y,sz-12)) pillars++; if(window.game.getB(sx+3,y,sz-12)) pillars++; }
  for(let x=sx-3;x<=sx+3;x++) if(window.game.getB(x,H+5,sz-12)) beam++;
  for(let z=sz-11;z<=sz-5;z++) if(window.game.getB(sx,H,z)) path++;
  return {core,pillars,beam,path};
}, null);
ok(arch.core===12, `светящаяся сердцевина портала: ${arch.core} блоков`);
ok(arch.pillars===8, `столбы арки: ${arch.pillars} блоков`);
ok(arch.beam===7, `перекладина сверху: ${arch.beam} блоков`);
ok(arch.path===7, `дорожка к порталу: ${arch.path} блоков`);

// подходим и входим — попадаем в лобби школы
await p.evaluate(()=>{ const a=interactables.find(x=>x.act==='exitGarden'), P=window.game.P;
  P.x=a.x; P.z=a.z+1.2; P.y=a.y; });
await p.waitForTimeout(900);
const hint=await p.evaluate(()=>document.getElementById('hintBar').textContent);
ok(/портал/i.test(hint), `у портала подсказка: «${hint.trim()}»`);
await p.evaluate(()=>window.game.doInteract());
// портал теперь открывает экран полёта — выбираем ресепшн из списка миров
await p.waitForFunction(()=>document.querySelectorAll('#flyList .flyCard[data-go]').length>0,null,{timeout:15000});
const worlds=await p.evaluate(()=>[...document.querySelectorAll('#flyList .flyCard[data-go]')].map(c=>c.dataset.go));
ok(worlds.includes('LOBBY'), `в полёте предлагают миры: ${worlds.join(', ')}`);
await p.evaluate(()=>document.querySelector('#flyList .flyCard[data-go="LOBBY"]').click());
await p.waitForFunction(()=>window.game.code()==='LOBBY',null,{timeout:20000});
await p.waitForTimeout(1800);
ok((await p.evaluate(()=>window.game.code()))==='LOBBY', 'через портал попали в лобби школы');

// и обратно на огород — как было
const back=await p.evaluate(()=>!!interactables.find(x=>x.act==='garden')
  || !!document.getElementById('pmGarden'));
ok(back, 'из лобби есть дорога обратно в сад');
await b.close();
