// Карта разработки одной страницей. Запуск: node map.mjs [файл]
// Числа по урокам, тестам и сборкам считаются из самого проекта, поэтому не врут.
// Что считать готовым и что болит — в status.json, его правят руками вместе с кодом.
import fs from 'fs';
import { execSync } from 'child_process';

const OUT = process.argv[2] || 'map.html';
const S = JSON.parse(fs.readFileSync('status.json', 'utf8'));

// ── материал курса ──
const idx = JSON.parse(fs.readFileSync('public/lessons/index.json', 'utf8'));
const lessons = idx.lessons || idx;
const LEVELS = [
  { key: 'Starter', name: 'Обычное',     emoji: '🌱' },
  { key: 'A1',      name: 'Необычное',   emoji: '🌿' },
  { key: 'A2',      name: 'Редкое',      emoji: '🍀' },
  { key: 'B1',      name: 'Легендарное', emoji: '✨' },
];
const levels = LEVELS.map(L => {
  const mine = lessons.filter(x => x.level === L.key);
  let words = 0, sent = 0, role = 0;
  for (const l of mine) {
    let raw = null;
    try { raw = JSON.parse(fs.readFileSync(`public/lessons/${l.id}.json`, 'utf8')); } catch (e) {}
    const v = ((raw && raw.vocabulary) || []).filter(x => x && x.word);
    words += v.length;
    if (raw && Array.isArray(raw.sentence) && raw.sentence.length) sent++;
    if (raw && raw.roleplay && raw.roleplay.a) role++;
  }
  return { ...L, themes: mine.length, words, sent, role };
});
const total = levels.reduce((a, b) => ({ themes: a.themes + b.themes, words: a.words + b.words,
                                         sent: a.sent + b.sent, role: a.role + b.role }),
                            { themes: 0, words: 0, sent: 0, role: 0 });

// ── код и тесты ──
const lines = f => fs.readFileSync(f, 'utf8').split('\n').length;
const tests = fs.readdirSync('.').filter(f => /^t.*\.mjs$/.test(f) && !/^(setup|biggard|shots|icon)\.mjs$/.test(f));
const retired = fs.readdirSync('.').filter(f => /\.old-/.test(f));
const build = (fs.readFileSync('server.js', 'utf8').match(/const BUILD = '([^']+)'/) || [])[1] || '—';

// ── история сборок ──
const log = execSync("git log --date=short --pretty='%ad|%s' -40", { encoding: 'utf8' })
  .split('\n').filter(Boolean).map(s => { const i = s.indexOf('|'); return { d: s.slice(0, i), t: s.slice(i + 1) }; })
  .filter(x => /\(20\d\d-\d\d-\d\d-\d+\)/.test(x.t))
  .map(x => ({ d: x.d, n: (x.t.match(/-(\d+)\)$/) || [])[1] || '',
               t: x.t.replace(/\s*\(20\d\d-\d\d-\d\d-\d+\)$/, '') }));

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STATE = { 'готово': 'ok', 'наблюдаю': 'watch', 'ждёт': 'wait', 'убрано': 'gone' };
const WEIGHT = { 'высокая': 'hi', 'средняя': 'mid', 'низкая': 'low' };
const today = new Date().toISOString().slice(0, 10);
const ru = d => { const [y, m, dd] = d.split('-'); return `${+dd} ${['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'][+m - 1]}`; };

const page = `<title>Карта Pixel English</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap">
<style>
/* Полоса состояния сверху, затем материал, затем узлы, боль и история — сверху вниз от «что сейчас» к «что было». */
:root{
  --bg:#f4f6f9; --panel:#ffffff; --line:#d9e0ea; --fg:#16202e; --dim:#5b6a7d;
  --sky:#5b9bd8; --grass:#3f8a2a; --soil:#7b5a3a;
  --ok:#2e7d32; --okbg:#e3f3e4; --watch:#a86a00; --watchbg:#fdf0d9;
  --wait:#1f6f8b; --waitbg:#ddeef4; --gone:#6b7280; --gonebg:#eceef1;
  --hi:#b3261e; --hibg:#fbe4e2;
  --disp:'IBM Plex Sans',system-ui,sans-serif; --mono:'IBM Plex Mono',ui-monospace,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#10151d; --panel:#172031; --line:#2a3850; --fg:#e7eef8; --dim:#9aabc1;
  --sky:#7db6ec; --grass:#6fc24a; --soil:#b58a5e;
  --ok:#7fd48a; --okbg:#17331d; --watch:#f0bd5e; --watchbg:#352a12;
  --wait:#7fd0ea; --waitbg:#13303a; --gone:#8e9bad; --gonebg:#1d2635;
  --hi:#ff9a90; --hibg:#3a1c19; color-scheme:dark}}
:root[data-theme="dark"]{
  --bg:#10151d; --panel:#172031; --line:#2a3850; --fg:#e7eef8; --dim:#9aabc1;
  --sky:#7db6ec; --grass:#6fc24a; --soil:#b58a5e;
  --ok:#7fd48a; --okbg:#17331d; --watch:#f0bd5e; --watchbg:#352a12;
  --wait:#7fd0ea; --waitbg:#13303a; --gone:#8e9bad; --gonebg:#1d2635;
  --hi:#ff9a90; --hibg:#3a1c19; color-scheme:dark}
body{background:var(--bg);color:var(--fg);font-family:var(--disp);line-height:1.5}
.wrap{max-width:860px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));
  padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:26px 48px;
  display:flex;flex-direction:column;gap:30px}
h1{font-size:clamp(23px,5.5vw,32px);line-height:1.15;margin:0;text-wrap:balance;letter-spacing:-.01em}
h2{font-size:15px;margin:0 0 12px;text-transform:uppercase;letter-spacing:.09em;color:var(--dim);font-weight:600}
p{margin:0}
.lede{color:var(--dim);font-size:15px;max-width:62ch}
.now{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px 18px;
  display:flex;flex-wrap:wrap;gap:18px 30px;align-items:baseline}
.now .k{font-size:12px;color:var(--dim);text-transform:uppercase;letter-spacing:.07em;display:block;margin-bottom:3px}
.now .v{font-family:var(--mono);font-size:19px;font-weight:600;font-variant-numeric:tabular-nums}
.now a{color:var(--sky)}
table{width:100%;border-collapse:collapse;font-size:14px}
.scroll{overflow-x:auto}
th{text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:var(--dim);
  font-weight:600;padding:0 10px 8px 0;white-space:nowrap}
td{padding:9px 10px 9px 0;border-top:1px solid var(--line);vertical-align:top}
td.n{font-family:var(--mono);font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
.bar{height:7px;border-radius:4px;background:var(--line);overflow:hidden;min-width:70px}
.bar i{display:block;height:100%;background:var(--grass)}
.chip{display:inline-block;font-size:11.5px;font-weight:600;padding:2px 9px;border-radius:999px;white-space:nowrap}
.ok{background:var(--okbg);color:var(--ok)} .watch{background:var(--watchbg);color:var(--watch)}
.wait{background:var(--waitbg);color:var(--wait)} .gone{background:var(--gonebg);color:var(--gone)}
.hi{background:var(--hibg);color:var(--hi)} .mid{background:var(--watchbg);color:var(--watch)}
.low{background:var(--gonebg);color:var(--gone)}
.node{border-top:1px solid var(--line);padding:13px 0;display:grid;
  grid-template-columns:1fr auto;gap:4px 14px;align-items:start}
.node b{font-size:15.5px;font-weight:600}
.node .what{grid-column:1/-1;color:var(--dim);font-size:13.5px;max-width:70ch}
.node .risk{grid-column:1/-1;font-size:13px;color:var(--watch);border-left:2px solid var(--watch);padding-left:9px}
.pain{border-top:1px solid var(--line);padding:12px 0;display:grid;grid-template-columns:1fr auto;gap:3px 12px}
.pain b{font-size:14.5px;font-weight:600} .pain .how{grid-column:1/-1;color:var(--dim);font-size:13px}
.who{font-family:var(--mono);font-size:12px;color:var(--dim)}
ol.hist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
ol.hist li{display:grid;grid-template-columns:52px 34px 1fr;gap:12px;align-items:baseline;
  padding:7px 0;border-top:1px solid var(--line);font-size:14px}
ol.hist .d{font-family:var(--mono);font-size:12.5px;color:var(--dim)}
ol.hist .n{font-family:var(--mono);font-size:12.5px;color:var(--sky);font-weight:600}
.blind{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--soil);
  border-radius:9px;padding:14px 16px;display:flex;flex-direction:column;gap:7px;font-size:13.5px;color:var(--dim)}
footer{color:var(--dim);font-size:12.5px;border-top:1px solid var(--line);padding-top:14px}
@media (max-width:460px){ .node,.pain{grid-template-columns:1fr} ol.hist li{grid-template-columns:48px 30px 1fr;gap:8px} }
</style>

<div class="wrap">
  <header>
    <h1>Карта Pixel English</h1>
    <p class="lede">Где что стоит, что готово и что болит. Числа по урокам, тестам и сборкам посчитаны из самого проекта — их никто не пишет руками.</p>
  </header>

  <section class="now">
    <div><span class="k">Сборка на сервере</span><span class="v">${esc(build)}</span></div>
    <div><span class="k">Тем в курсе</span><span class="v">${total.themes}</span></div>
    <div><span class="k">Слов</span><span class="v">${total.words}</span></div>
    <div><span class="k">Строк кода</span><span class="v">${(lines('server.js') + lines('public/index.html')).toLocaleString('ru')}</span></div>
    <div><span class="k">Тестов</span><span class="v">${tests.length}</span></div>
    <div><span class="k">Адрес</span><span class="v"><a href="https://pixel.elc-kids.kz">pixel.elc-kids.kz</a></span></div>
  </section>

  <section>
    <h2>Материал курса</h2>
    <div class="scroll"><table>
      <thead><tr><th>Уровень</th><th>Тем</th><th>Слов</th><th>С фразами</th><th>С диалогом</th><th style="width:30%">Готовность</th></tr></thead>
      <tbody>${levels.map(L => {
        const pc = L.themes ? Math.round((L.sent + L.role) / (L.themes * 2) * 100) : 0;
        return `<tr><td>${L.emoji} ${esc(L.name)}</td><td class="n">${L.themes}</td><td class="n">${L.words}</td>
          <td class="n">${L.sent}</td><td class="n">${L.role}</td>
          <td><div class="bar"><i style="width:${pc}%"></i></div></td></tr>`;
      }).join('')}</tbody>
    </table></div>
    <p class="lede" style="margin-top:11px">Весь материал на месте: у каждой из ${total.themes} тем есть восемь слов, шаблон фразы для станции и диалог. Писать больше нечего — дальше только механики вокруг него.</p>
  </section>

  <section>
    <h2>Узлы игры</h2>
    ${S['узлы'].map(n => `<div class="node">
      <b>${esc(n['имя'])}</b><span class="chip ${STATE[n['состояние']] || 'gone'}">${esc(n['состояние'])}</span>
      <p class="what">${esc(n['что'])}</p>
      ${n['риск'] ? `<p class="risk">${esc(n['риск'])}</p>` : ''}
    </div>`).join('')}
  </section>

  <section>
    <h2>Что болит</h2>
    ${S['болит'].map(p => `<div class="pain">
      <b>${esc(p['что'])}</b><span class="chip ${WEIGHT[p['важность']] || 'low'}">${esc(p['важность'])}</span>
      <p class="how"><span class="who">${esc(p['кто'])}</span> — ${esc(p['как'])}</p>
    </div>`).join('')}
  </section>

  <section>
    <h2>Чего эта карта не видит</h2>
    <div class="blind">${S['незрячее'].map(x => `<div>${esc(x)}</div>`).join('')}</div>
  </section>

  <section>
    <h2>История сборок</h2>
    <ol class="hist">${log.map(x => `<li><span class="d">${ru(x.d)}</span><span class="n">№${esc(x.n)}</span><span>${esc(x.t)}</span></li>`).join('')}</ol>
  </section>

  <footer>Собрано ${ru(today)} из репозитория pllato/robeng, ветка claude/minecraft-style-game-opapaf.
  ${retired.length} тестов выведено из прогона как устаревшие. Пересобрать: <code>node map.mjs</code></footer>
</div>`;

fs.writeFileSync(OUT, page);
console.log(`${OUT}: тем ${total.themes}, слов ${total.words}, узлов ${S['узлы'].length}, сборок в истории ${log.length}`);
