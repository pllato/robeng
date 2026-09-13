import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
        '--use-fake-device-for-media-capture','--use-fake-ui-for-media-stream',
        '--allow-running-insecure-content','--disable-web-security',
        '--autoplay-policy=no-user-gesture-required','--mute-audio'] });
const ctx=await b.newContext({viewport:{width:800,height:500},permissions:['microphone']});
const p=await ctx.newPage();
await p.goto('http://localhost:8642',{waitUntil:'load'});
await p.waitForTimeout(1200);
console.log(await p.evaluate(async()=>{
  const r={ hasMD: !!navigator.mediaDevices, secure: window.isSecureContext, proto: location.protocol };
  try{ const s=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
       r.tracks=s.getAudioTracks().length; }
  catch(e){ r.err=e.name+': '+e.message; }
  return r;
}));
await b.close();
