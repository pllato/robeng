import { chromium } from 'playwright';
const [TT,ST]=process.argv.slice(2);
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const mk=async tok=>{ const c=await b.newContext({viewport:{width:900,height:560}});
  const p=await c.newPage(); await p.addInitScript(t=>localStorage.setItem('me_token',t),tok);
  p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,160)));
  await p.goto('http://localhost:8642',{waitUntil:'load'});
  await p.waitForTimeout(1400); await p.click('#spGo');
  await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
  await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true); });
  return p; };
const T=await mk(TT), S=await mk(ST);
await T.waitForTimeout(800);
ok((await T.evaluate(()=>window.game.code()))==='LOBBY' && (await S.evaluate(()=>window.game.code()))==='LOBBY','оба в лобби');

// оба встают в зону сбора
const stand=async (p,dx,dz)=>p.evaluate(o=>{ const z=eval('partyZone'), P=window.game.P;
  P.x=(z.x0+z.x1)/2+o.dx; P.z=(z.z0+z.z1)/2+o.dz; P.vx=P.vy=P.vz=0; },{dx,dz});
await stand(T,-1,0); await stand(S,1,1);
await T.waitForTimeout(1500); // даём позициям долететь до сервера
const inside=await T.evaluate(()=>partyInside());
ok(inside.length===2,'в зоне двое: '+JSON.stringify(inside));
await T.screenshot({path:'g-party.png'});

await T.evaluate(()=>window.game.doInteract());
await T.waitForFunction(()=>window.game.code()!=='LOBBY',null,{timeout:20000});
await S.waitForFunction(()=>window.game.code()!=='LOBBY',null,{timeout:20000});
await T.waitForTimeout(1200);
const ct=await T.evaluate(()=>window.game.code()), cs=await S.evaluate(()=>window.game.code());
ok(ct===cs && ct!=='LOBBY','оба улетели в один и тот же новый мир: '+ct);
ok((await T.evaluate(()=>eval('myRole')))==='teacher','преподаватель остался преподавателем');
ok((await S.evaluate(()=>eval('myRole')))==='student','ученик — учеником');
await T.waitForTimeout(800);
ok((await T.evaluate(()=>window.game.peers.size))>=1,'учитель видит ученика в новом мире');
await b.close();
