// Стойка сотрудника глазами сотрудника: когда учеников много, список должен
// листаться внутри окна, а не уезжать за край экрана. Эту беду поймали вживую:
// «это все, не могу прокрутить».
import { chromium, devices } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs'; import os from 'os'; import path from 'path';
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const PORT=8793, PIN='1212';
const DIR=fs.mkdtempSync(path.join(os.tmpdir(),'staffui-'));

// шестьдесят детей: столько же, сколько в живой базе школы
const users={};
for(let i=0;i<60;i++){
  const d=new Date(Date.UTC(2026,9,1+(i%18))).toISOString().slice(0,10);
  users['u'+i]={ id:'u'+i, role:'student', name:'Игрок-'+String(i).padStart(2,'0'),
    token:'kluch-'+i, pin:null, createdAt:Date.now()-i*8.64e7,
    garden:{ coins:i*17, beds:{0:{}}, cropsW:{}, days:{[d]:1} } };
}
fs.writeFileSync(path.join(DIR,'db.json'), JSON.stringify({users}));

const srv=spawn('node',['server.js'],{ env:{...process.env, PORT:String(PORT), DATA_DIR:DIR, STAFF_PIN:PIN},
  stdio:['ignore','pipe','pipe'] });
let log=''; srv.stdout.on('data',d=>log+=d); srv.stderr.on('data',d=>log+=d);
await new Promise(r=>setTimeout(r,1800));

const b=await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=swiftshader','--no-sandbox'] });

async function openDesk(ctx){
  const p=await ctx.newPage();
  p.on('pageerror',e=>console.log('PAGEERROR',e.message));
  await p.goto(`http://localhost:${PORT}`,{waitUntil:'load'});
  await p.waitForTimeout(1500);
  await p.evaluate(()=>{ const i=document.querySelector('#gName'); if(i) i.value='Админ'; });
  const go=await p.$('#gGo'); if(go) await go.click();
  await p.waitForTimeout(2500);
  await p.evaluate(()=>eval('openStaff()'));
  await p.fill('#stPin',PIN); await p.click('#stGo');
  await p.waitForTimeout(1200);
  return p;
}

for(const [what, ctx] of [
  ['на телефоне', await b.newContext({...devices['iPhone 13']})],
  ['на компьютере', await b.newContext({ viewport:{width:1280,height:800} })],
]){
  const p=await openDesk(ctx);
  const list=await p.$('#stList');
  const box=await list.boundingBox();
  const vh=(await p.viewportSize()).height;

  const n=await p.$$eval('#stList > *',e=>e.length);
  ok(n>=40, `${what}: детей в списке много — ${n}`);
  ok(box.y>=0 && box.y+box.height<=vh+1,
     `${what}: список целиком в окне (от ${Math.round(box.y)} до ${Math.round(box.y+box.height)} при высоте ${vh})`);

  const sc=await p.$eval('#stList',e=>({can:e.scrollHeight>e.clientHeight+4, h:e.scrollHeight, c:e.clientHeight}));
  ok(sc.can, `${what}: список длиннее окошка и потому листается (${sc.h} в ${sc.c})`);

  const moved=await p.$eval('#stList',e=>{ e.scrollTop=400; return e.scrollTop; });
  ok(moved>300, `${what}: прокрутка работает — уехали на ${moved}`);

  // последняя строка после прокрутки видна, и кнопка «Ссылка» на ней нажимаема
  const last=await p.$eval('#stList',e=>{ e.scrollTop=e.scrollHeight; const r=e.lastElementChild.getBoundingClientRect();
    return { top:r.top, bottom:r.bottom }; });
  ok(last.bottom<=vh+1 && last.top>=0, `${what}: последний ребёнок виден после прокрутки`);

  // подсказка про ссылку не уехала за экран
  const tip=await p.$eval('#stWork .hint:last-of-type',e=>e.getBoundingClientRect().bottom);
  ok(tip<=vh+1, `${what}: предупреждение «ссылка — ключ от сада» на экране`);
  await p.close(); await ctx.close();
}

await b.close(); srv.kill();
fs.rmSync(DIR,{recursive:true,force:true});
