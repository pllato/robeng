// «Добавить на экран»: игра должна ставиться иконкой и запускаться без адресной
// строки. Проверяем то, чего требуют браузеры, и — отдельно — что кэш не умеет
// подсунуть вчерашнюю страницу: для этой игры версия клиента обязана совпадать
// с версией сервера.
import { chromium, devices } from 'playwright';
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx=await b.newContext({...devices['iPhone 13'],viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const p=await ctx.newPage();
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,200)));

const r=await p.request.get('http://localhost:8642/manifest.webmanifest');
ok(r.status()===200, `манифест отдаётся: ${r.status()}`);
ok(/application\/manifest\+json/.test(r.headers()['content-type']||''),
   `с правильным типом: ${r.headers()['content-type']}`);
const man=await r.json();
ok(!!man.name && !!man.short_name, `имя есть: «${man.short_name}»`);
ok(man.display==='standalone', 'запуск без адресной строки (display: standalone)');
ok(!!man.start_url && !!man.scope, 'задана точка входа');
const sizes=(man.icons||[]).map(i=>i.sizes);
ok(sizes.includes('192x192') && sizes.includes('512x512'),
   `иконки нужных размеров: ${sizes.join(', ')}`);
ok((man.icons||[]).some(i=>i.purpose==='maskable'), 'есть иконка под круглую вырезку Android');

for(const f of ['icon-192.png','icon-512.png','icon-180.png']){
  const ir=await p.request.get('http://localhost:8642/'+f);
  const buf=await ir.body();
  const png = buf[0]===0x89 && buf.toString('latin1',1,4)==='PNG';
  const w=buf.readUInt32BE(16), h=buf.readUInt32BE(20);
  ok(ir.status()===200 && png, `${f} отдаётся и это настоящий PNG ${w}×${h}`);
}

await p.goto('http://localhost:8642',{waitUntil:'load'});
await p.waitForTimeout(1200);
const head=await p.evaluate(()=>({
  man:!!document.querySelector('link[rel=manifest]'),
  apple:(document.querySelector('meta[name=apple-mobile-web-app-capable]')||{}).content,
  bar:(document.querySelector('meta[name=apple-mobile-web-app-status-bar-style]')||{}).content,
  touch:!!document.querySelector('link[rel=apple-touch-icon]'),
  theme:(document.querySelector('meta[name=theme-color]')||{}).content,
  title:(document.querySelector('meta[name=apple-mobile-web-app-title]')||{}).content }));
ok(head.man, 'страница ссылается на манифест');
ok(head.apple==='yes', 'на iPhone откроется во весь экран');
ok(head.touch, 'иконка для домашнего экрана iPhone указана');
ok(!!head.theme, `цвет полосы состояния задан: ${head.theme}`);
ok(head.title==='Pixel English', `подпись под иконкой: «${head.title}»`);

// ── служебный скрипт: локально по http его быть не должно ──
const reg=await p.evaluate(async()=>{
  const rs=await navigator.serviceWorker.getRegistrations().catch(()=>[]);
  return rs.length;
});
ok(reg===0, 'по незащищённому адресу служебный скрипт не ставится — тесты и разработка чистые');

// ── и сам скрипт никогда не отдаёт старую страницу, пока сеть жива ──
const sw=await (await p.request.get('http://localhost:8642/sw.js')).text();
ok(/await fetch\(req\)/.test(sw) && sw.indexOf('await fetch(req)') < sw.indexOf('caches.match'),
   'сначала сеть, кэш — только когда сети нет');
ok(/status === 200/.test(sw), 'куски музыки по Range в кэш не кладутся');
ok(/caches\.delete/.test(sw), 'кэш прошлой сборки удаляется при обновлении');
await b.close();
