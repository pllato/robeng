import { chromium } from 'playwright';
const [ST]=process.argv.slice(2);
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{width:1200,height:640} });
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,160)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
await p.addInitScript(t=>localStorage.setItem('me_token',t),ST);
await p.goto('http://localhost:8642',{waitUntil:'load'});
await p.waitForTimeout(1400); await p.click('#spGo');
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true); });
await p.waitForTimeout(700);
await p.evaluate(()=>{ const sp=eval('spawnPt'), P=window.game.P; P.x=sp.x-8.6; P.z=sp.z-5; P.y=sp.y; P.vx=P.vy=P.vz=0; });
await p.waitForTimeout(600);
await p.evaluate(()=>window.game.doInteract()); // в сад через арку
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(2200);
await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true); });

const mi=await p.evaluate(()=>myPlotIndex());
ok(mi>=0,'участок назначен: #'+mi);
const atPlot=await p.evaluate(()=>{ const c=plotPos(myPlotIndex()), RX=eval('PLOT_RX'), RZ=eval('PLOT_RZ'), P=window.game.P;
  return Math.abs(P.x-(c.x+.5))<=RX && Math.abs(P.z-c.z)<=RZ; }); // внутри своего забора
ok(atPlot,'игрок оказался на своём участке');

const fenceCount=()=>p.evaluate(()=>{ const c=plotPos(myPlotIndex()), RX=eval('PLOT_RX'), RZ=eval('PLOT_RZ'), H=c.y-1; let n=0;
  for(let x=c.x-RX;x<=c.x+RX;x++){ if(window.game.getB(x,H+1,c.z-RZ)===5) n++; if(window.game.getB(x,H+1,c.z+RZ)===5) n++; }
  for(let z=c.z-RZ;z<=c.z+RZ;z++){ if(window.game.getB(c.x-RX,H+1,z)===5) n++; if(window.game.getB(c.x+RX,H+1,z)===5) n++; }
  return n; });
const f0=await fenceCount();
ok(f0>=45,'забор стоит до посадки: брёвен '+f0);

// сажаем и растим до большого дерева — раньше это стирало забор
await p.evaluate(()=>{ const {sx,sz,H}=gardenOrigin(), P=window.game.P; P.x=sx-3; P.z=sz+11.5; P.y=H+1; P.vx=P.vy=P.vz=0; });
await p.waitForTimeout(700);
await p.evaluate(()=>window.game.doInteract());
await p.waitForTimeout(800);
await p.evaluate(()=>document.getElementById('npcGo').click());   // сначала разговор с дедом Семёном
await p.waitForTimeout(1200);
await p.click('#shopList button[data-take]');
await p.waitForTimeout(500);
await p.evaluate(()=>{ const q=bedPos(myPlotIndex(),0), P=window.game.P; P.x=q.x+2; P.z=q.z+2; P.y=q.y; P.vx=P.vy=P.vz=0; });
await p.waitForTimeout(800);
await p.evaluate(()=>window.game.doInteract());
await p.waitForTimeout(1600);
ok(!!(await p.evaluate(()=>bedAt(0))),'семя посажено на своём участке');
await p.waitForFunction(()=>bedAt(0)&&ripeWords(bedAt(0)).length>0,null,{timeout:20000});
ok((await p.evaluate(()=>ripeWords(bedAt(0)).length))>=16,'грядка выросла сама: плодов '+await p.evaluate(()=>ripeWords(bedAt(0)).length));
const f1=await fenceCount();
ok(f1===f0,`забор цел после того, как грядка выросла: было ${f0}, стало ${f1}`);

await p.evaluate(()=>{ const c=plotPos(myPlotIndex()), P=window.game.P;
  P.x=c.x+.5; P.z=c.z+15; P.y=c.y+9; P.yaw=Math.PI; P.pitch=0.42; P.fly=true; P.vx=P.vy=P.vz=0; });
await p.waitForTimeout(1800);
await p.screenshot({path:'g-plot.png'});
await b.close();
