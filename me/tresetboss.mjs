// Обнуление должно стирать и боссов, и оружие, и питомцев
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p=await b.newPage({viewport:{width:900,height:600}});
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const G=()=>p.evaluate(()=>eval('myGarden'));
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1400);
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(2200);
await p.evaluate(()=>eval(`sendWS({t:'garden',act:'restore',garden:{coins:500,bossDone:5,weapon:5,
  pets:['Кротёнок','Лозовичок'],sinceBoss:2,
  seeds:{'starter-01#apple':2},openW:{'starter-01#apple':1,'starter-01#banana':1},
  cropsW:{'starter-01#apple':3},beds:{},basket:{},done:{},open:{},crops:{}}})`));
await p.waitForTimeout(1200);
let g=await G();
ok((g.bossDone|0)===5 && (g.weapon|0)===5 && g.pets.length===2,
   `до обнуления: боссов ${g.bossDone}, оружие №${g.weapon}, питомцев ${g.pets.length}, монет ${g.coins}`);
await p.evaluate(()=>eval("sendWS({t:'garden',act:'reset'})"));
await p.waitForTimeout(1200);
g=await G();
ok((g.bossDone|0)===0, 'боссы обнулены');
ok((g.weapon|0)===0, 'оружие снова деревянная кирка');
ok(!g.pets.length, 'питомцы убраны');
ok((g.coins|0)===0 && !Object.keys(g.beds).length && !Object.keys(g.seeds).length, 'монеты, грядки и семена пусты');
ok(Object.keys(g.openW).length===1 && !!g.freeSeed, 'открыто снова одно слово, подарок ждёт в киоске');
await b.close();
