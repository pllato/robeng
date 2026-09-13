// Фоновая музыка: тихая, уступает голосу, настраивается и выключается
import { chromium, devices } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
        '--autoplay-policy=no-user-gesture-required','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'] });
const ctx=await b.newContext({...devices['iPhone 13'],viewport:{width:390,height:844},
  isMobile:true,hasTouch:true,permissions:['microphone']});
const p=await ctx.newPage();
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,170)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const M=()=>p.evaluate(()=>window.game.music());

// сервер обязан отдавать музыку кусками — иначе iPhone её не проиграет
const r1=await p.request.get('http://localhost:8642/music/garden.mp3',{headers:{Range:'bytes=0-999'}});
ok(r1.status()===206, `сервер отдаёт музыку по частям: ${r1.status()} ${r1.headers()['content-range']||''}`);
ok(/audio\/mpeg/.test(r1.headers()['content-type']||''), `и с правильным типом: ${r1.headers()['content-type']}`);
ok(/max-age/.test(r1.headers()['cache-control']||''), `и кэшируется: ${r1.headers()['cache-control']}`);

await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1500);
await p.evaluate(()=>document.getElementById('spGo').click());
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(2600);
await p.touchscreen.tap(200,700).catch(()=>{});      // касание — браузеру нужен жест
await p.waitForTimeout(2500);

let m=await M();
ok(m.on, 'музыка включена по умолчанию');
ok(/garden\.mp3/.test(m.src), `играет присланный трек: ${m.src.split('/').pop()}`);
ok(m.started, 'воспроизведение пошло');
ok(m.vol<=0.2, `и она тихая: ${Math.round(m.vol*100)}% от полной громкости`);
for(let i=0;i<30;i++){ await p.evaluate(()=>window.game.musicTick()); }
m=await M();
ok(m.gain>0, `звук реально идёт: громкость ${m.gain}`);
const loud=m.gain;

// игра говорит слово — музыка уходит в тень
await p.evaluate(()=>say('apple'));
await p.waitForTimeout(200);
ok((await M()).ducked, 'пока игра говорит — музыка помечена как приглушённая');
for(let i=0;i<40;i++){ await p.evaluate(()=>window.game.musicTick()); }
const quiet=(await M()).gain;
ok(quiet<loud*0.3, `и правда стихла: ${loud} → ${quiet}`);

// договорила — музыка вернулась
await p.waitForTimeout(2500);
for(let i=0;i<60;i++){ await p.evaluate(()=>window.game.musicTick()); }
const back=(await M()).gain;
ok(back>loud*0.7, `замолчала — музыка вернулась: ${quiet} → ${back}`);

// ползунок громкости
await p.evaluate(()=>window.game.setMusic(true,0.4));
ok(Math.abs((await M()).vol-0.4)<0.01, 'громкость выставилась на 40%');
ok((await p.evaluate(()=>document.getElementById('mvVal').textContent))==='80%',
   `в меню показано: ${await p.evaluate(()=>document.getElementById('mvVal').textContent)}`);

// выключатель
await p.evaluate(()=>window.game.setMusic(false));
for(let i=0;i<40;i++){ await p.evaluate(()=>window.game.musicTick()); }
m=await M();
ok(!m.on && m.gain<0.01, `выключил — тишина: ${m.gain}`);
ok((await p.evaluate(()=>document.getElementById('mvBtn').textContent)).includes('выключена'),
   'кнопка в меню это показывает');
// выбор запоминается
await p.reload({waitUntil:'load'}); await p.waitForTimeout(1800);
ok(!(await p.evaluate(()=>window.game.music().on)), 'после перезагрузки музыка осталась выключенной');
await b.close();
