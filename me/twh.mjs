import { chromium } from 'playwright';
const [CODE,TT,ST]=process.argv.slice(2);
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
        '--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'] });
const mk=async tok=>{ const c=await b.newContext({viewport:{width:800,height:500},permissions:['microphone']});
  await c.grantPermissions(['microphone'],{origin:'http://localhost:8642'});
  const p=await c.newPage(); await p.addInitScript(t=>localStorage.setItem('me_token',t),tok);
  await p.goto('http://localhost:8642',{waitUntil:'load'}); return p; };
const T=await mk(TT), S=await mk(ST);
await T.waitForTimeout(1500); await T.click('#spClass');
await T.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await S.waitForTimeout(1500); await S.evaluate(c=>joinByCode(c),CODE);
await S.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await S.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true); });
await T.evaluate(()=>window.game.startLesson('starter-01'));
await T.waitForTimeout(1200);
await T.evaluate(()=>window.game.runStage(1));
await S.waitForTimeout(2500);
const st=await S.evaluate(()=>window.game.words().map(s=>({w:s.word,x:s.x,y:s.y,z:s.z})));
for(let pass=0;pass<4;pass++){
  for(const s of st){
    const got=await S.evaluate(()=>window.game.raceState().got);
    if(got.includes(s.w)) continue;
    await S.evaluate(o=>{ const P=window.game.P; P.x=o.x+2.2; P.y=o.y+1; P.z=o.z+2.2; P.vx=P.vy=P.vz=0; },s);
    await S.waitForTimeout(700);
    const info=await S.evaluate(o=>{ const P=window.game.P;
      return { near:window.game.raceState().near, d:+Math.hypot(P.x-(o.x+.5),P.z-(o.z+.5)).toFixed(2),
               px:+P.x.toFixed(1), py:+P.y.toFixed(1), pz:+P.z.toFixed(1) }; },s);
    if(pass===3) console.log('НЕ СОБРАНО', s.w, JSON.stringify(s), JSON.stringify(info));
    if(info.near) await S.evaluate(w=>window.game.checkWord(w), info.near);
    await S.waitForTimeout(300);
  }
}
const rs=await S.evaluate(()=>window.game.raceState());
console.log('итог:', rs.got.length+'/'+st.length, 'не собрано:', st.map(s=>s.w).filter(w=>!rs.got.includes(w)));
await b.close();
