// Лобби школы: оформлено, ничего не потеряно, и за границы не выйти
import { chromium, devices } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx=await b.newContext({...devices['iPhone 13'],viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const p=await ctx.newPage();
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,170)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1500);
await p.evaluate(()=>eval("sendWS({t:'autoUser',name:''})")); await p.waitForTimeout(900);
await p.evaluate(()=>eval("sendWS({t:'switch',code:'LOBBY'})"));
await p.waitForFunction(()=>window.game&&window.game.ready()&&window.game.code()==='LOBBY',null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.waitForTimeout(2600);

// центр площади считаем от точки появления: она сдвинута на ковёр перед школой
const C=await p.evaluate(()=>{ const s=eval('spawnPt');
  return {sx:Math.floor(s.x), sz:Math.floor(s.z)-8, H:Math.floor(s.y)-1}; });

// 1) появляемся не в фонтане, а на ковре
const spawn=await p.evaluate(c=>({ head:window.game.getB(Math.floor(window.game.P.x),Math.floor(window.game.P.y),Math.floor(window.game.P.z)),
  floor:window.game.getB(Math.floor(window.game.P.x),c.H,Math.floor(window.game.P.z)) }), C);
ok(spawn.head===0, 'игрок появляется на свободном месте, а не внутри блока');
ok(spawn.floor!==0, 'и под ногами пол');

// 2) стена по всему периметру, дыр нет
const wall=await p.evaluate(c=>{ const R=16, g=window.game.getB; let holes=0, solid=0;
  for(let x=c.sx-R;x<=c.sx+R;x++) for(const z of [c.sz-R,c.sz+R]) for(let y=c.H+1;y<=c.H+4;y++){
    if(g(x,y,z)) solid++; else holes++; }
  for(let z=c.sz-R;z<=c.sz+R;z++) for(const x of [c.sx-R,c.sx+R]) for(let y=c.H+1;y<=c.H+4;y++){
    if(g(x,y,z)) solid++; else holes++; }
  return {holes,solid}; }, C);
ok(wall.holes===0, `стена сплошная: ${wall.solid} блоков, дыр ${wall.holes}`);
ok(wall.solid>=520, `и она достаточно высокая — не перепрыгнуть (${wall.solid} блоков в 4 ряда)`);

// 3) реально пробуем выйти — бежим джойстиком в стену со всех четырёх сторон
const escaped=[], reached=[];
for(const [yaw,ox,oz,name] of [[0,0,-6,'на север'],[Math.PI,0,6,'на юг'],
                               [-Math.PI/2,-6,0,'на запад'],[Math.PI/2,6,0,'на восток']]){
  // стартуем в стороне от фонтана, иначе упрёмся в чашу, а не в стену
  await p.evaluate(a=>{ const P=window.game.P; P.x=a.c.sx+a.ox+.5; P.z=a.c.sz+a.oz+.5; P.y=a.c.H+2;
    P.yaw=a.yaw; P.pitch=0; P.vx=P.vy=P.vz=0; }, {c:C,yaw,ox,oz});
  await p.waitForTimeout(400);
  await p.evaluate(()=>{ const j=eval('joyVec'); j.x=0; j.y=1; });   // «палец на джойстике вперёд»
  await p.waitForTimeout(9000);                                      // бежим 9 секунд в стену
  await p.evaluate(()=>{ const j=eval('joyVec'); j.x=0; j.y=0; });
  await p.waitForTimeout(400);
  const at=await p.evaluate(c=>{ const P=window.game.P;
    return {dx:+(P.x-c.sx).toFixed(1), dz:+(P.z-c.sz).toFixed(1)}; }, C);
  reached.push(`${name} ${Math.max(Math.abs(at.dx),Math.abs(at.dz))}`);
  if(Math.abs(at.dx)>16.2 || Math.abs(at.dz)>16.2) escaped.push(name);
}
ok(escaped.length===0, escaped.length
  ? `удалось выйти: ${escaped.join(', ')}`
  : `наружу не выпускает ни с одной стороны (дошли до ${reached.join(' · ')} из 16)`);

// 4) ничего из лобби не пропало
const acts=await p.evaluate(()=>interactables.map(a=>a.act));
for(const [a,label] of [['portal','аллея преподавателей'],['account','стойка аккаунта'],
                        ['code','вход по коду'],['lead','заявка на обучение'],['teach','заявка преподавателя'],
                        ['party','зона сбора'],['garden','арка в сад'],['board','доска рейтинга'],['wordday','слово дня']])
  ok(acts.includes(a), `на месте: ${label}`);

// 5) оформление
const deco=await p.evaluate(c=>{ const g=window.game.getB; let water=0, leaf=0, roof=0, carpet=0, glass=0;
  for(let x=c.sx-4;x<=c.sx+4;x++) for(let z=c.sz-4;z<=c.sz+4;z++) if(g(x,c.H+1,z)===7) water++;
  for(let x=c.sx-16;x<=c.sx+16;x++) for(let z=c.sz-16;z<=c.sz+16;z++){
    for(let y=c.H+4;y<=c.H+7;y++) if(g(x,y,z)===6) leaf++;
    if(g(x,c.H+9,z)===11) roof++;
    const f=g(x,c.H,z); if(f===11||f===12||f===18) carpet++;
  }
  for(let x=c.sx-16;x<=c.sx+16;x++) if(g(x,c.H+5,c.sz-16)===10) glass++;
  return {water,leaf,roof,carpet,glass}; }, C);
ok(deco.water>=20, `фонтан с водой: ${deco.water} блоков`);
ok(deco.leaf>=100, `деревья вокруг площади: ${deco.leaf} блоков листвы`);
ok(deco.roof>=20, `красная крыша школы: ${deco.roof} блоков`);
ok(deco.carpet>=60, `ковровая звезда на полу: ${deco.carpet} блоков`);
ok(deco.glass>=10, `витражи в стене: ${deco.glass} блоков`);
const tags=await p.evaluate(()=>worldTags.map(t=>t.el.textContent));
ok(tags.some(t=>/PIXEL ENGLISH SCHOOL/.test(t)), 'вывеска школы над фасадом');
ok(tags.some(t=>/ФОНТАН/.test(t)), 'подпись у фонтана');

// 6) в лобби не строят
const ui=await p.evaluate(()=>({mine:getComputedStyle(document.getElementById('bMine')).display,
  build:getComputedStyle(document.getElementById('bBuild')).display,
  bar:getComputedStyle(document.getElementById('hotbar')).display}));
ok(ui.mine==='none'&&ui.build==='none'&&ui.bar==='none','в лобби убраны кирка, кирпич и панель блоков');
await b.close();
