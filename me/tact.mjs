// Лента занятий: учитель видит, что делают ученики
import { chromium } from 'playwright';
import { execSync } from 'child_process';
const acc = JSON.parse(execSync('node setup.mjs').toString().trim().split('\n').pop());
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
async function player(token){
  const ctx=await b.newContext({viewport:{width:980,height:640}});
  const p=await ctx.newPage();
  p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,160)));
  if(token) await p.addInitScript(t=>localStorage.setItem('me_token',t), token);
  await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1300);
  await p.evaluate(()=>{const g=document.getElementById('spGo'); if(g&&g.offsetParent) g.click();});
  await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
  await p.evaluate(()=>{window.game.setPaused(false);});
  await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
  await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
  await p.waitForTimeout(2300);
  return p;
}
const T=await player(acc.teacherToken);      // преподаватель
const S=await player(acc.studentToken);      // ученик

ok(await T.evaluate(()=>eval('actOn'))===true, 'у преподавателя лента включена сразу');
ok(await S.evaluate(()=>eval('actOn'))===false, 'ученику она не мешает — выключена');

// ученик работает: берёт семя, сажает, собирает, продаёт
await S.evaluate(()=>openShop()); await S.waitForTimeout(1000);
await S.evaluate(()=>document.querySelector('#shopGrid .seedCard[data-buy]').click());
await S.waitForTimeout(1000);
await S.evaluate(()=>closeShop());
await S.evaluate(()=>eval("sendWS({t:'garden',act:'plant',bed:0,lesson:'starter-01#apple'})"));
await S.waitForTimeout(9800);
await S.evaluate(()=>eval("sendWS({t:'garden',act:'get'})")); await S.waitForTimeout(700);
await S.evaluate(()=>{ const q=bedPos(myPlotIndex(),0), P=window.game.P; P.x=q.x+.5; P.z=q.z+3; });
await S.waitForTimeout(500);
await S.evaluate(()=>window.game.checkWord('apple'));
await S.waitForTimeout(1200);
await S.evaluate(()=>eval("sendWS({t:'garden',act:'sell'})"));
await S.waitForTimeout(1400);

const lines=await T.evaluate(()=>eval('actLines').map(l=>`${l.name} ${l.text}`));
ok(lines.some(l=>/взял семя/.test(l)), 'учитель видит покупку: «'+(lines.find(l=>/взял семя/.test(l))||'—')+'»');
ok(lines.some(l=>/посадил/.test(l)), 'видит посадку: «'+(lines.find(l=>/посадил/.test(l))||'—')+'»');
ok(lines.some(l=>/сказал «apple»/.test(l)), 'видит произнесённое слово: «'+(lines.find(l=>/сказал/.test(l))||'—')+'»');
ok(lines.some(l=>/продал/.test(l)), 'видит продажу: «'+(lines.find(l=>/продал/.test(l))||'—')+'»');

const vis=await T.evaluate(()=>{ const e=document.getElementById('actLog');
  return {disp:getComputedStyle(e).display, w:Math.round(e.getBoundingClientRect().width),
          vw:innerWidth, txt:e.textContent.slice(0,60)}; });
ok(vis.disp!=='none', `панель видна слева, ширина ${vis.w} из ${vis.vw}px`);
ok(vis.w/vis.vw<0.45, 'и занимает меньше половины экрана');
ok(await T.evaluate(()=>getComputedStyle(document.getElementById('actLog')).pointerEvents)==='none',
   'сквозь неё можно нажимать — игре не мешает');
ok(await S.evaluate(()=>getComputedStyle(document.getElementById('actLog')).display)==='none',
   'у ученика панели нет');
await b.close();
