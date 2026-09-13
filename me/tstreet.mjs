import { chromium } from 'playwright';
const [TT,ST]=process.argv.slice(2);
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const mk=async tok=>{ const c=await b.newContext({viewport:{width:1200,height:640}});
  const p=await c.newPage(); await p.addInitScript(t=>localStorage.setItem('me_token',t),tok);
  p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,160)));
  await p.goto('http://localhost:8642',{waitUntil:'load'});
  await p.waitForTimeout(1400); await p.click('#spGo');
  await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
  await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true); });
  return p; };
const T=await mk(TT), S=await mk(ST);
await T.waitForTimeout(800);
const stand=async (p,dx,dz)=>p.evaluate(o=>{ const z=eval('partyZone'), P=window.game.P;
  P.x=(z.x0+z.x1)/2+o.dx; P.z=(z.z0+z.z1)/2+o.dz; P.vx=P.vy=P.vz=0; },{dx,dz});
await stand(T,-1,0); await stand(S,1,1);
await T.waitForTimeout(1500);
await T.evaluate(()=>window.game.doInteract());
await T.waitForFunction(()=>window.game.code()!=='LOBBY',null,{timeout:20000});
await S.waitForFunction(()=>window.game.code()!=='LOBBY',null,{timeout:20000});
await T.waitForTimeout(2000);
for(const p of [T,S]) await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true); });
ok((await T.evaluate(()=>eval('roomKind')))==='garden','мир занятия — сад-улица');
const pl=await T.evaluate(()=>eval('plots').map(p=>p.name+':'+p.role));
ok(pl.length===2,'на улице два участка: '+JSON.stringify(pl));
const mineT=await T.evaluate(()=>myPlotIndex()), mineS=await S.evaluate(()=>myPlotIndex());
ok(mineT>=0 && mineS>=0 && mineT!==mineS, `у каждого свой участок: учитель #${mineT}, ученик #${mineS}`);

// ученик берёт семя и сажает у себя
await S.evaluate(()=>{ const {sx,sz,H}=gardenOrigin(), P=window.game.P; P.x=sx-3; P.z=sz+11.5; P.y=H+1; P.vx=P.vy=P.vz=0; });
await S.waitForTimeout(700);
ok((await S.evaluate(()=>{const h=eval('hintNear'); return h&&h.act;}))==='shop','ученик у киоска семян');
await S.evaluate(()=>window.game.doInteract());
await S.waitForTimeout(800);
await S.evaluate(()=>document.getElementById('npcGo').click());   // сначала разговор с дедом Семёном
await S.waitForTimeout(1200);
await S.click('#shopList button[data-take]');
await S.waitForTimeout(600);
await S.evaluate(()=>{ const q=bedPos(myPlotIndex(),0), P=window.game.P; P.x=q.x+2; P.z=q.z+2; P.y=q.y; P.vx=P.vy=P.vz=0; });
await S.waitForTimeout(800);
await S.evaluate(()=>window.game.doInteract());
await S.waitForTimeout(1800);
ok(!!(await S.evaluate(()=>bedAt(0))),'ученик засеял свою грядку');
await T.waitForTimeout(1200);
const sName=await S.evaluate(()=>{const u=eval('USER');return u?u.name:null;});
ok(!!(await T.evaluate(n=>bedOfPlot(eval('plots').findIndex(p=>p.name===n),0),sName)),'учитель видит грядку ученика '+sName+' на его участке');

// учитель пробует копать на чужом участке
await T.evaluate(()=>{ const si=eval('plots').findIndex(p=>p.name==='SZ'); const q=bedPos(si,1), P=window.game.P;
  P.x=q.x+2; P.z=q.z+2; P.y=q.y; P.vx=P.vy=P.vz=0; });
await T.waitForTimeout(800);
const sName2=await S.evaluate(()=>{const u=eval('USER');return u?u.name:null;});
const before=await T.evaluate(n=>{const si=eval('plots').findIndex(p=>p.name===n); return !!bedOfPlot(si,1);},sName2);
await T.evaluate(()=>{ eval('seedInHand = {id:"starter-02",title:"x",theme:"Овощи"}'); window.game.doInteract(); });
await T.waitForTimeout(1500);
const after=await T.evaluate(n=>{const si=eval('plots').findIndex(p=>p.name===n); return !!bedOfPlot(si,1);},sName2);
ok(!before && !after,'на чужом участке посадить нельзя');

await S.evaluate(()=>{ const {sx,sz,H}=gardenOrigin(), P=window.game.P;
  P.x=sx+.5; P.z=sz-21; P.y=H+13; P.yaw=Math.PI; P.pitch=0.5; P.fly=true; P.vx=P.vy=P.vz=0; });
await S.waitForTimeout(2000);
await S.screenshot({path:'g-street.png'});
await b.close();
