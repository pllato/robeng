// Разговорная станция: фраза целиком приносит куда больше, чем плоды
import { chromium, devices } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx=await b.newContext({...devices['iPhone 13'],viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const p=await ctx.newPage();
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,170)));
const ok=(c,m)=>console.log((c?'  OK  ':' FAIL ')+m);
const G=()=>p.evaluate(()=>eval('myGarden'));
const T=()=>p.evaluate(()=>window.game.talk());
await p.goto('http://localhost:8642',{waitUntil:'load'}); await p.waitForTimeout(1500);
await p.evaluate(()=>eval("sendWS({t:'switch',code:'GARDEN'})"));
await p.waitForFunction(()=>window.game&&window.game.ready(),null,{timeout:25000});
await p.evaluate(()=>{window.game.setPaused(false);});
await p.waitForFunction(()=>window.game.code()==='GARDEN',null,{timeout:20000});
await p.waitForTimeout(2500);

// станция стоит на улице
const st=await p.evaluate(()=>{ const a=interactables.find(x=>x.act==='phrase');
  const tag=worldTags.find(t=>/РАЗГОВОРНАЯ/.test(t.el.innerHTML));
  return a?{x:a.x,z:a.z,r:a.r,label:a.label,tag:!!tag}:null; });
ok(!!st, `станция на улице есть: «${st&&st.label}»`);
ok(st&&st.tag, 'с вывеской «🗣 РАЗГОВОРНАЯ СТАНЦИЯ»');

// без выращенных слов заданий не даёт
await p.evaluate(()=>window.game.openTalk()); await p.waitForTimeout(1200);
ok(!(await T()).task, 'пока ничего не выращено — задания нет');
await p.evaluate(()=>window.game.closeTalk()); await p.waitForTimeout(500);

// растим слово
await p.evaluate(()=>eval(`sendWS({t:'garden',act:'restore',garden:{soldOnce:1,coins:0,
  seeds:{},openW:{'starter-01#apple':1},cropsW:{'starter-01#apple':1},
  beds:{'0':{seed:'starter-01#apple',lesson:'starter-01',words:[{word:'apple'}],cycle:0,ripe:[],readyAt:Date.now()-1}},
  basket:{},done:{},open:{},crops:{},days:{}}})`));
await p.waitForTimeout(1300);

await p.evaluate(()=>window.game.openTalk()); await p.waitForTimeout(1500);
let t=await T();
ok(!!t.task, 'станция выдала задание');
ok(t.task.word==='apple', `слово из моего огорода: «${t.task.word}»`);
ok(/i like apple/i.test(t.task.text), `фраза по грамматике урока: «${t.task.text}»`);
ok(t.phrase.includes('apple'), `на экране написана целиком: «${t.phrase}»`);
ok(t.task.pay>=8, `платят за фразу ${t.task.pay} 🪙 — заметно больше, чем за плод (2 🪙)`);

// половина фразы не принимается
const before=(await G()).coins|0;
await p.evaluate(()=>window.game.checkWord('apple'));
await p.waitForTimeout(1100);
ok(((await G()).coins|0)===before, 'одно слово вместо фразы — не платят');
ok((await T()).write, 'и сразу предложили написать');
ok(/Нужно целиком/.test((await T()).score), `и объяснили: «${(await T()).score}»`);

// фраза целиком — платят
await p.evaluate(()=>window.game.checkWord('i like apple'));
await p.waitForTimeout(1400);
const after=(await G()).coins|0;
ok(after>before, `сказал фразу целиком — заплатили ${after-before} 🪙`);
ok(((await G()).phrases|0)===1, 'фраза засчитана в счётчик');
t=await T();
ok(!!t.task, 'и сразу выдали следующее задание');

// повтор той же фразы стоит дешевле — чтобы шли за новыми словами
const second=t.task.pay;
ok(second<t.task.pay+1 && second<=Math.ceil((after-before)*0.7)+1,
   `повтор того же слова дешевле: было ${after-before}, стало ${second}`);

// слова не в порядке не принимаются
const c2=(await G()).coins|0;
await p.evaluate(()=>window.game.checkWord('apple like i'));
await p.waitForTimeout(1100);
ok(((await G()).coins|0)===c2, 'слова вразнобой — не фраза, не платят');
await b.close();
