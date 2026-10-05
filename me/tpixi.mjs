// Пикси: спутник ходит рядом, подсказывает по шагам и уходит после десяти растений
import { chromium, devices } from 'playwright';
import { restoreBigGarden } from './biggard.mjs';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx=await b.newContext({...devices['iPhone 13'],viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const p=await ctx.newPage();
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,170)));
const PIXI_CLOSE_OK=3.4;
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const X=()=>p.evaluate(()=>window.game.pixi());
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1500);
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(2600);

let x=await X();
ok(x.here, 'Пикси появился рядом с новичком');
ok(/Привет/.test(x.said), `и поздоровался: «${x.said}»`);
ok(x.shown==='block', 'облачко с репликой видно');

// подошёл поздороваться — значит, встал близко
const dist=()=>p.evaluate(()=>{ const q=window.game.pixi(), P=window.game.P;
  return +Math.hypot(q.x-P.x,q.z-P.z).toFixed(1); });
await p.waitForTimeout(2500);
let d=await dist();
ok(d<5, `подошёл сказать — встал в ${d} блока`);

// сказал — и отошёл: впритык ходить не должен
await p.evaluate(()=>{ eval('pixiUntil=Date.now()+300'); });   // дочитали реплику
await p.waitForTimeout(3000);
const mode=await p.evaluate(()=>eval('pixiMode'));
ok(mode==='idle', `реплика кончилась — вернулся к своим делам (режим «${mode}»)`);
let far=0, close=0;
for(let i=0;i<12;i++){ await p.waitForTimeout(900); const v=await dist();
  far=Math.max(far,v); if(v<PIXI_CLOSE_OK) close++; }
ok(far>6, `отходит гулять — отдалялся до ${far} блоков`);
ok(close===0, 'и ни разу не встал вплотную, пока молчит');

// гуляет сам по себе, а не стоит столбом
const a=await p.evaluate(()=>{const q=window.game.pixi(); return [q.x,q.z];});
await p.waitForTimeout(2500);
const bb=await p.evaluate(()=>{const q=window.game.pixi(); return [q.x,q.z];});
ok(Math.hypot(bb[0]-a[0],bb[1]-a[1])>0.5, 'бродит рядом сам по себе, а не стоит на месте');

// игрок ушёл — Пикси не бросает его, но и не липнет
await p.evaluate(()=>{ const P=window.game.P; P.x+=22; P.z+=14; });
await p.waitForTimeout(6000);
d=await dist();
ok(d<20, `игрок отошёл на 26 блоков — Пикси подтянулся, теперь ${d}`);

// реплика меняется вместе с шагом
await p.evaluate(()=>openShop()); await p.waitForTimeout(900);
await p.evaluate(()=>{const c=document.querySelector('#shopGrid .seedCard[data-buy]'); if(c) c.click();});
await p.waitForTimeout(1400);
await p.evaluate(()=>closeShop()); await p.waitForTimeout(1500);
x=await X();
ok(/грядк|посади/i.test(x.said), `взял семя — подсказал следующее: «${x.said}»`);

// считает прогресс
ok(/из 10/.test(x.said) || x.grown===0, `ведёт счёт до десяти: «${x.said}»`);

// на десяти растениях прощается
await restoreBigGarden(p,{plants:10, days:1});
await p.waitForTimeout(2000);
x=await X();
ok(x.grown>=10, `на грядках ${x.grown} разных растений`);
ok(!x.here && x.done, 'Пикси попрощался и ушёл — дальше ребёнок сам');
ok((await p.evaluate(()=>document.getElementById('pixiTag').style.display))==='none','облачко убралось');

// его можно позвать обратно и отправить отдыхать
await p.evaluate(()=>window.game.pixiCall()); await p.waitForTimeout(900);
ok((await X()).here, 'позвали из меню — вернулся');
await p.evaluate(()=>window.game.pixiDismiss()); await p.waitForTimeout(900);
ok(!(await X()).here, 'попросили уйти — ушёл');
// выбор запоминается
await p.reload({waitUntil:'load'}); await p.waitForTimeout(1800);
ok(!(await p.evaluate(()=>window.game.pixi().on)), 'после перезагрузки не возвращается без спроса');
await b.close();
