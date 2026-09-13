import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p=await b.newPage();
p.on('pageerror',e=>console.log('ОШИБКА:', e.message, '\n', (e.stack||'').split('\n').slice(0,4).join('\n')));
await p.goto('http://localhost:8642',{waitUntil:'load'});
await p.waitForTimeout(2500);
await b.close();
