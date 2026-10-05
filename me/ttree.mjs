import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{width:1200,height:640} });
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,180)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
await p.goto('http://localhost:8642',{waitUntil:'load'});
await p.waitForTimeout(1200); await p.click('#spGo');
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true); });
await p.waitForTimeout(700);
await p.evaluate(()=>{ const sp=eval('spawnPt'), P=window.game.P; P.x=sp.x-8.6; P.z=sp.z-5; P.y=sp.y; P.vx=P.vy=P.vz=0; });
await p.waitForTimeout(600);
await p.evaluate(()=>window.game.doInteract());
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(1800);
await p.evaluate(()=>{ window.game.setPaused(false); window.game.setDrag(true); });
ok(true,'гость в саду');

// магазин
await p.evaluate(()=>{ const {sx,sz,H}=gardenOrigin(), P=window.game.P; P.x=sx+.5; P.z=sz-7.2; P.y=H+1; P.vx=P.vy=P.vz=0; });
await p.waitForTimeout(700);
ok((await p.evaluate(()=>{const h=eval('hintNear'); return h&&h.act;}))==='shop','стою у магазина семян');
await p.evaluate(()=>window.game.doInteract());
await p.waitForTimeout(1500);
const rows=await p.evaluate(()=>document.querySelectorAll('#shopList .shopRow').length);
ok(rows>0,'каталог уроков открылся, строк: '+rows);
await p.screenshot({path:'g-shop.png'});
await p.click('#shopList button[data-id="starter-01"]');
await p.waitForTimeout(600);
const seed=await p.evaluate(()=>eval('seedInHand'));
ok(seed&&seed.id==='starter-01','взял семя: '+JSON.stringify(seed&&seed.theme));

// сажаем
await p.evaluate(()=>{ const q=bedPos(myPlotIndex(),4), P=window.game.P; P.x=q.x+2.4; P.z=q.z+2.4; P.y=q.y; P.vx=P.vy=P.vz=0; });
await p.waitForTimeout(800);
await p.evaluate(()=>window.game.doInteract());
await p.waitForTimeout(900);
let tr=await p.evaluate(()=>treeAt(4));
ok(!!tr,'посадил дерево урока: '+(tr&&tr.title));
ok(tr.words.length>0,'в дереве слов урока: '+tr.words.length);

// растим: называем все слова
const total=tr.words.length;
for(let i=0;i<total;i++){
  const nx=await p.evaluate(()=>{ const t=treeAt(4); const n=treeNext(t); return n&&n.word; });
  if(!nx) break;
  await p.evaluate(w=>window.game.checkWord(w), nx);
  await p.waitForTimeout(420);
}
tr=await p.evaluate(()=>treeAt(4));
ok(tr.learned.length===total, `назвал все слова: ${tr.learned.length}/${total}`);
ok(await p.evaluate(()=>treeStage(treeAt(4)))===4, 'дерево выросло до последней стадии');
ok(!!tr.fruit, 'на выросшем дереве завязался плод: '+(tr.fruit&&tr.fruit.word));

await p.evaluate(()=>{ const q=bedPos(myPlotIndex(),4), P=window.game.P;
  P.x=q.x+7; P.z=q.z+7; P.y=q.y+3; P.yaw=Math.atan2(q.x-P.x,-(q.z-P.z)); P.pitch=0.05; P.vx=P.vy=P.vz=0; });
await p.waitForTimeout(1500);
await p.screenshot({path:'g-tree.png'});

// срываем плод
const s0=await p.evaluate(()=>window.game.taskState().stars);
await p.evaluate(()=>{ const q=bedPos(myPlotIndex(),4), P=window.game.P; P.x=q.x+2.4; P.z=q.z+2.4; P.y=q.y; P.vx=P.vy=P.vz=0; });
await p.waitForTimeout(800);
await p.evaluate(w=>window.game.checkWord(w), tr.fruit.word);
await p.waitForTimeout(900);
const after=await p.evaluate(()=>treeAt(4));
ok(!after.fruit && after.picked===1, 'плод сорван, дерево осталось расти дальше');
ok((await p.evaluate(()=>window.game.taskState().stars))>s0, `звёзды выросли: ${s0} → ${await p.evaluate(()=>window.game.taskState().stars)}`);
ok((await p.evaluate(()=>fruitWhen(treeAt(4)))).includes('дн')||(await p.evaluate(()=>fruitWhen(treeAt(4)))).includes('ч'),
   'следующий плод: '+await p.evaluate(()=>fruitWhen(treeAt(4))));
await b.close();
