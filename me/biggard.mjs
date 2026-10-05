// Общая заготовка большого сада: много разных растений на грядках и
// несколько дней работы с огородом. Нужна тестам, которым важен не первый шаг,
// а уже развитый участок.
export const THEMES=[['starter-01',['apple','banana','orange','pear','grapes','lemon','watermelon','strawberry']],
                     ['starter-02',['carrot','tomato','potato','cucumber','corn','onion','pepper','mushroom']]];
const day=n=>new Date(Date.now()-n*86400000).toISOString().slice(0,10);
// plants — сколько разных растений посадить, days — сколько дней ребёнок возвращался в огород
export function bigGarden({plants=12, days=8, ripe='apple', extra={}}={}){
  const beds={}; let left=plants, bed=0;
  for(const [les,words] of THEMES){
    if(left<=0) break;
    const ws=[]; for(let i=0;i<words.length && left>0;i++,left--) ws.push({word:words[i]});
    if(!ws.length) break;
    beds[String(bed++)]={seed:les+'#'+ws[0].word,lesson:les,words:ws,cycle:0,ripe:[],readyAt:Date.now()-1};
  }
  const d={}; for(let i=0;i<days;i++) d[day(i)]=1;
  const openW={}, cropsW={};
  for(const [les,words] of THEMES) for(const w of words){ openW[les+'#'+w]=1; }
  cropsW['starter-01#'+ripe]=1;
  return JSON.stringify(Object.assign({soldOnce:1,coins:9,seeds:{},openW,cropsW,
    beds,basket:{},done:{},open:{},crops:{},days:d}, extra));
}
// восстановить такой сад на странице теста
export async function restoreBigGarden(p, opts){
  await p.evaluate(g=>eval(`sendWS({t:'garden',act:'restore',garden:${g}})`), bigGarden(opts));
  await p.waitForTimeout(1300);
}
