import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{width:1200,height:520} });
p.on('pageerror',e=>console.log('PAGEERROR',e.message.slice(0,200)));
await p.goto('http://localhost:8642',{waitUntil:'load'});
await p.waitForTimeout(1200);
await p.click('#spSolo');
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:20000});
await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true); });
await p.waitForTimeout(1200);
const res = await p.evaluate(()=>{
  const g=window.game, P=g.P;
  const words=['apple','banana','orange','pear','grapes','lemon','watermelon','strawberry'];
  const x0=Math.round(P.x)-18, z0=Math.round(P.z)+14, y0=Math.round(P.y);
  // ровная площадка
  for(let dz=-4;dz<=26;dz++) for(let dx=-3;dx<=44;dx++){
    for(let dy=0;dy<10;dy++) g.setBlock(x0+dx,y0+dy,z0+dz,0);
    g.setBlock(x0+dx,y0-1,z0+dz,1);
  }
  const placed=[];
  words.forEach((w,i)=>{
    const bx=x0+i*5+2;
    for(const [X,Y,Z,id] of objBlocks(w,bx,y0,z0)) g.setBlock(X,Y,Z,id);
    placed.push({w, n:objBlocks(w,bx,y0,z0).length, h:objHeight(w)});
  });
  P.x=x0+20; P.z=z0+22; P.y=y0+4; P.yaw=0; P.pitch=0.14; P.fly=true; P.vy=0;
  return placed;
});
console.table(res);
await p.waitForTimeout(2500);
await p.screenshot({path:'gallery.png'});
await b.close();
