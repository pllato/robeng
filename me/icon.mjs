// Иконка игры для домашнего экрана. Рисуем пиксельным спрайтом 16×16 в тех же
// цветах, что и сам мир: небо, трава, земля и росток. Запуск: node icon.mjs
// Кладёт public/icon-192.png, icon-512.png и icon-180.png (для iPhone).
import { chromium } from 'playwright';
const SKY='#99c7f0', GRASS='#63b33b', GRASS2='#4e9630', DIRT='#7b5a3a', DIRT2='#654728';
const STEM='#3f8a2a', LEAF='#8ad94e', LEAF2='#6cc23a', SEED='#f2c14e';
// Сетку 16×16 собираем кодом, а не рисуем символами: так ствол заведомо
// получается сплошным, без случайных дырок.
const N=16;
const ART=(()=>{
  const g=Array.from({length:N},()=>Array(N).fill('.'));
  const set=(x,y,c)=>{ if(x>=0&&x<N&&y>=0&&y<N) g[y][x]=c; };
  // земля и трава
  for(let x=0;x<N;x++){
    set(x,11,'g'); set(x,12,'g');
    for(let y=13;y<N;y++) set(x,y,'d');
  }
  for(let x=0;x<N;x+=2){ set(x,12,'G'); set((x+1)%N,14,'D'); }
  set(3,13,'D'); set(11,13,'D'); set(6,15,'D'); set(13,15,'D');
  // ствол — две клетки шириной, сплошной до земли
  for(let y=3;y<=12;y++){ set(7,y,'s'); set(8,y,'s'); }
  // два листа: ближе к стволу светлые, по краю тёмные
  const leaf=(cx,dir)=>{
    for(let y=3;y<=6;y++){
      const w = y===3||y===6 ? 1 : 2;
      for(let k=0;k<=w;k++) set(cx+dir*k, y, k===w ? 'L' : 'l');
    }
  };
  leaf(6,-1); leaf(9,+1);
  set(7,13,'o');                       // зерно у корня
  return g.map(r=>r.join(''));
})();
const MAP={'.':SKY,g:GRASS,G:GRASS2,d:DIRT,D:DIRT2,s:STEM,l:LEAF,L:LEAF2,o:SEED};
const b=await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
for(const size of [512,192,180]){
  const p=await b.newPage({viewport:{width:size,height:size},deviceScaleFactor:1});
  await p.setContent(`<style>html,body{margin:0;background:${SKY}}
    canvas{display:block;image-rendering:pixelated}</style><canvas id=c width=${size} height=${size}></canvas>`);
  await p.evaluate(({art,map,size})=>{
    const c=document.getElementById('c').getContext('2d');
    const u=size/16;
    art.forEach((row,y)=>[...row].forEach((ch,x)=>{
      c.fillStyle=map[ch]; c.fillRect(Math.round(x*u),Math.round(y*u),Math.ceil(u),Math.ceil(u));
    }));
  },{art:ART,map:MAP,size});
  await p.locator('#c').screenshot({path:`public/icon-${size}.png`});
  await p.close();
  console.log(`public/icon-${size}.png`);
}
await b.close();
