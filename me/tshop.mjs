// Киоск: пакетики с ценами, закрытые темы видно без цен и купить нельзя
import { chromium } from 'playwright';
import { execSync } from 'child_process';
const acc = JSON.parse(execSync('node setup.mjs').toString().trim().split('\n').pop());
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p=await b.newPage({viewport:{width:1100,height:720}});
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,160)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
await p.addInitScript(t=>localStorage.setItem('me_token',t), acc.studentToken);
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1300);
await p.evaluate(()=>{const g=document.getElementById('spGo'); if(g&&g.offsetParent) g.click();});
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(2400);
await p.evaluate(()=>openShop()); await p.waitForTimeout(1200);

const st=await p.evaluate(()=>{
  const cards=[...document.querySelectorAll('#shopGrid .seedCard')];
  return { total:cards.length,
    locked:cards.filter(c=>c.classList.contains('lock')).length,
    withPrice:cards.filter(c=>/🪙/.test(c.querySelector('.pr').textContent)).length,
    lockedHavePrice:cards.filter(c=>c.classList.contains('lock')&&/\d/.test(c.querySelector('.pr').textContent)).length,
    names:cards.slice(0,3).map(c=>c.querySelector('.nm').textContent+' / '+c.querySelector('.pr').textContent) };
});
ok(st.total>1, `на прилавке ${st.total} тем — видно и закрытые тоже`);
ok(st.locked>0, `закрытых пакетиков: ${st.locked}`);
ok(st.lockedHavePrice===0, 'у закрытых цены не показаны');
ok(st.withPrice>0, `у доступных цена есть: ${st.names.join(' · ')}`);

// клик по закрытому — вежливый отказ, покупки нет
const coinsBefore=await p.evaluate(()=>eval('myGarden.coins|0'));
await p.evaluate(()=>{ window.__t=[]; const o=eval('toast'); eval('toast = m=>{ window.__t.push(m); return ('+o.toString()+')(m); }'); });
await p.evaluate(()=>document.querySelector('#shopGrid .seedCard.lock').click());
await p.waitForTimeout(700);
const msgs=await p.evaluate(()=>window.__t);
ok(msgs.some(m=>/недоступны/.test(m)), 'по нажатию: «'+(msgs.find(m=>/недоступны/.test(m))||'—')+'»');
ok((await p.evaluate(()=>eval('myGarden.coins|0')))===coinsBefore, 'монеты не списались');

await p.screenshot({path:'g-shop.png'});
await b.close();
