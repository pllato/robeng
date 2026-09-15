'use strict';
// Pixel English — сервер платформы: аккаунты, постоянные классы, комнаты, голос-сигналинг
// Срез 1 по PLATFORM_PROMPT.md: роли, JSON-хранилище, активация преподавателей, заявки
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

// ВЕРСИЯ СБОРКИ. Меняется с каждой присланной правкой — по ней видно,
// какой именно код сейчас работает (в игре, в /version и в update.sh).
const BUILD = '2026-09-15-41';
// последний рубеж: даже неучтённая ошибка не должна гасить мир, где сейчас играют дети
process.on('uncaughtException', e => console.error('НЕПЕРЕХВАЧЕННАЯ ОШИБКА:', (e && e.stack) || e));
process.on('unhandledRejection', e => console.error('НЕОБРАБОТАННЫЙ ОТКАЗ:', (e && e.stack) || e));
const PORT = process.env.PORT || 8642;
const PUB = path.join(__dirname, 'public');
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const DBF = path.join(DATA, 'db.json');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
               '.png': 'image/png', '.json': 'application/json',
               '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.wav': 'audio/wav' };
const isMedia = f => /\.(mp3|ogg|m4a|wav)$/i.test(f);

// ================= ХРАНИЛИЩЕ =================
let db = { users: {}, leads: [], classes: {}, seq: 1 };
try {
  if (fs.existsSync(DBF)) db = Object.assign(db, JSON.parse(fs.readFileSync(DBF, 'utf8')));
} catch (e) { console.error('db.json повреждён, начинаю с чистой базы:', e.message); }
if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });

let saveTimer = null;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.writeFileSync(DBF, JSON.stringify(db)); } catch (e) { console.error('ошибка записи db:', e.message); }
  }, 800);
}
process.on('SIGINT', () => { try { fs.writeFileSync(DBF, JSON.stringify(db)); } catch (e) {} process.exit(0); });

const hash = s => crypto.createHash('sha256').update('me-salt:' + s).digest('hex');
const newToken = () => crypto.randomBytes(24).toString('hex');
const uid = () => String(db.seq++);
const clean = s => String(s || '').replace(/[<>]/g, '').trim().slice(0, 24);
const findByName = name => Object.values(db.users).find(u => u.name.toLowerCase() === String(name).toLowerCase());

// ---------- защита от перебора PIN ----------
// Четырёхзначный PIN подбирается за секунды, если пробовать без ограничений. Считаем неудачные
// попытки по адресу и по имени: после пяти — пауза, которая растёт.
const FAILS = new Map();
const FAIL_MAX = 5, FAIL_WINDOW = 10 * 60 * 1000;
function failKey(ip, name) { return ip + '|' + String(name || '').toLowerCase(); }
function lockedFor(key) {
  const f = FAILS.get(key);
  if (!f) return 0;
  if (Date.now() > f.until) { FAILS.delete(key); return 0; }
  return f.n >= FAIL_MAX ? Math.ceil((f.until - Date.now()) / 1000) : 0;
}
function noteFail(key) {
  const f = FAILS.get(key) || { n: 0, until: 0 };
  f.n++;
  const pause = f.n < FAIL_MAX ? FAIL_WINDOW : Math.min(60, 2 ** (f.n - FAIL_MAX)) * 60 * 1000;
  f.until = Date.now() + pause;
  FAILS.set(key, f);
}
const noteOk = key => FAILS.delete(key);
setInterval(() => { const t = Date.now(); for (const [k, f] of FAILS) if (t > f.until) FAILS.delete(k); }, 60000);

// ---------- владелец ----------
const DEFAULT_ADMIN_PIN = '2468';
const PUBLIC = process.env.PUBLIC === '1';        // сервер открыт в интернет — требования строже
let owner = Object.values(db.users).find(u => u.role === 'owner');
if (!owner) {
  const id = uid();
  owner = { id, role: 'owner', name: 'admin', pin: hash(process.env.ADMIN_PIN || DEFAULT_ADMIN_PIN),
    token: null, createdAt: Date.now() };
  db.users[id] = owner; saveSoon();
  console.log('Создан владелец: имя "admin". PIN задаётся переменной ADMIN_PIN.');
}
if (process.env.ADMIN_PIN) {                       // ADMIN_PIN всегда переустанавливает пароль владельца
  const np = hash(process.env.ADMIN_PIN);
  if (owner.pin !== np) { owner.pin = np; owner.token = null; saveSoon(); console.log('PIN владельца обновлён из ADMIN_PIN.'); }
}
if (owner.pin === hash(DEFAULT_ADMIN_PIN)) {
  if (PUBLIC) {
    console.error('\n❌ СТОП: у владельца стандартный PIN, а сервер открыт в интернет.');
    console.error('   Запусти так:  ADMIN_PIN=<длинный-пароль> PUBLIC=1 node server.js\n');
    process.exit(1);
  }
  console.warn('⚠️  У владельца стандартный PIN. Перед публикацией задай ADMIN_PIN.');
}
// общее лобби — постоянный мир
if (!db.classes.GARDEN) { // мир-сад: общий для всех, но грядки у каждого свои
  db.classes.GARDEN = { teacherId: null, seed: 424242, edits: {}, words: [], createdAt: Date.now() };
}
if (!db.classes.LOBBY) {
  db.classes.LOBBY = { teacherId: null, seed: 777001, edits: {}, words: [], createdAt: Date.now() };
  saveSoon();
}

// слово дня для лобби
const DAYWORDS = [
  { word: 'apple', emoji: '🍎' }, { word: 'dog', emoji: '🐶' }, { word: 'sun', emoji: '☀️' },
  { word: 'book', emoji: '📕' }, { word: 'fish', emoji: '🐟' }, { word: 'star', emoji: '⭐' }, { word: 'cat', emoji: '🐱' },
];
const dayWord = () => DAYWORDS[Math.floor(Date.now() / 86400000) % DAYWORDS.length];
const today = () => new Date().toISOString().slice(0, 10);
const classStars = code => {
  const c = db.classes[code];
  if (!c || !c.students) return 0;
  return Object.values(c.students).reduce((s, x) => s + (x.stars || 0), 0);
};
// Что сейчас живёт на сервере — для выбора в портале.
// Показываем только комнаты, где кто-то есть, плюс общую улицу огородов.
function liveRooms(myCode) {
  const out = [];
  for (const [code, r] of rooms) {
    if (code === 'LOBBY') continue;
    const people = [...r.clients.values()];
    if (!people.length && code !== 'GARDEN') continue;
    const teacher = people.find(c => c.role === 'teacher');
    const owner = code !== 'GARDEN' ? Object.values(db.users)
      .find(u => u.role === 'teacher' && u.code === code) : null;
    out.push({
      code,
      kind: code === 'GARDEN' ? 'garden' : 'class',
      name: code === 'GARDEN' ? 'Улица огородов' : (owner ? 'Класс ' + owner.name : 'Класс ' + code),
      teacher: teacher ? teacher.name : (owner ? owner.name : ''),
      live: !!teacher,
      n: people.length,
      who: people.slice(0, 8).map(c => c.name),
      here: code === myCode,
    });
  }
  if (!out.some(r => r.code === 'GARDEN'))
    out.push({ code: 'GARDEN', kind: 'garden', name: 'Улица огородов', teacher: '', live: false,
               n: 0, who: [], here: myCode === 'GARDEN' });
  out.sort((a, b) => (b.live - a.live) || (b.n - a.n) || a.name.localeCompare(b.name, 'ru'));
  return out;
}
function lobbyPayload() {
  const teachers = Object.values(db.users).filter(u => u.role === 'teacher' && u.status === 'active');
  const portals = teachers.map(t => ({
    name: t.name, code: t.code,
    students: Object.keys((db.classes[t.code] || {}).students || {}).length,
    stars: classStars(t.code),
    schedule: (t.schedule || '').split('\n')[0] || '',
  }));
  const topStudents = Object.values(db.users).filter(u => u.role === 'student')
    .sort((a, b) => (b.stars || 0) - (a.stars || 0)).slice(0, 10)
    .map(u => ({ name: u.name, stars: u.stars || 0 }));
  const topTeachers = portals.slice().sort((a, b) => b.stars - a.stars).slice(0, 10);
  return { portals, topStudents, topTeachers, wordday: dayWord() };
}

// ================= HTTP =================
const STARTED = new Date().toISOString();
const server = http.createServer((req, res) => {
  let p = (req.url || '/').split('?')[0];
  if (p === '/version') { // чем проверять, что запущен именно новый код
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ build: BUILD, started: STARTED, pid: process.pid }));
  }
  if (p === '/' || p === '/start') p = '/index.html';
  const f = path.join(PUB, path.normalize(p).replace(/^(\.\.[\/\\])+/, ''));
  if (!f.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  const type = MIME[path.extname(f).toLowerCase()] || 'application/octet-stream';
  if (isMedia(f)) {
    // Музыка: отдаём потоком и с поддержкой Range — Safari на iPhone без этого
    // просто отказывается играть. И кэшируем надолго: гонять мегабайты на каждый вход незачем.
    return fs.stat(f, (e, st) => {
      if (e) { res.writeHead(404); return res.end('not found'); }
      const head = { 'Content-Type': type, 'Accept-Ranges': 'bytes',
                     'Cache-Control': 'public, max-age=604800' };
      const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
      if (range) {
        const start = range[1] ? parseInt(range[1], 10) : 0;
        const end = range[2] ? parseInt(range[2], 10) : st.size - 1;
        if (!(start >= 0 && end < st.size && start <= end)) {
          res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end();
        }
        res.writeHead(206, Object.assign({}, head,
          { 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 }));
        return fs.createReadStream(f, { start, end }).pipe(res);
      }
      res.writeHead(200, Object.assign({}, head, { 'Content-Length': st.size }));
      fs.createReadStream(f).pipe(res);
    });
  }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); return res.end('not found'); }
    // ничего не кэшируем: иначе после обновления браузер отдаёт старую страницу
    res.writeHead(200, { 'Content-Type': type,
      'Cache-Control': 'no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' });
    res.end(d);
  });
});

// ================= КОМНАТЫ =================
const wss = new WebSocketServer({ server });
const rooms = new Map();
const ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // без I, L, O — их путают дети
let nextId = 1;

const makeCode = () => {
  let c;
  do { c = ''; for (let i = 0; i < 4; i++) c += ABC[Math.random() * ABC.length | 0]; }
  while (rooms.has(c) || db.classes[c]);
  return c;
};
const send = (ws, o) => { try { ws.send(JSON.stringify(o)); } catch (e) {} };
const bcast = (room, o, exceptId) => { for (const c of room.clients.values()) if (c.id !== exceptId) send(c.ws, o); };
// размеры палитр держим здесь: клиент рисует, сервер проверяет границы
const AVA_LIM = { skin: 6, hair: 12, hairStyle: 3, shirt: 14, pants: 8, hat: 5, pet: 20 };
const DEF_AVA = { skin: 1, hair: 1, hairStyle: 0, shirt: 6, pants: 0, hat: 0, pet: 0 };
function sanitizeAva(a) {
  const o = Object.assign({}, DEF_AVA);
  if (a && typeof a === 'object') for (const k of Object.keys(AVA_LIM)) {
    const v = a[k] | 0;
    if (v >= 0 && v < AVA_LIM[k]) o[k] = v;
  }
  return o;
}
const roster = room => [...room.clients.values()].map(c => ({ id: c.id, name: c.name, role: c.role, ava: c.ava, x: c.x, y: c.y, z: c.z, yaw: c.yaw || 0, v: !!c.voiceOn }));

const DAY = 86400000;
// 🌱 Экономика сада. Семя = тема урока. Посадил — грядка сама вырастает за секунды,
// потом ребёнок собирает урожай голосом.
// Новое растение даёт урожай сразу и щедро — ребёнок быстро проходит новый материал.
// А дальше тот же куст уходит в режим повторения: следующий урожай через 15–20 минут,
// то есть уже на другой сессии или на другой день. Фармить старое бессмысленно —
// за новыми словами идут в разговорную станцию, там и деньги.
const GROW_NEW = 8000;                        // первый круг — почти сразу
const GROW_REPEAT = [900000, 1200000];        // 15 мин, дальше 20 мин
const WORD_GROW = {};                         // штучная настройка: {'starter-01#watermelon': 30000}
const growMs = (cycle, g, seedId) => {
  const c = Math.max(0, cycle | 0);
  const base = WORD_GROW[seedId] || (c === 0 ? GROW_NEW
    : GROW_REPEAT[Math.min(GROW_REPEAT.length - 1, c - 1)]);
  return Math.round(base * (1 - Math.min(0.6, g ? artBonus(g, 'grow') : 0)));
};
// Редкость по уровню курса: чем реже семя, тем дороже оно само и тем дороже его плоды.
const TIERS = [
  { level: 'Starter', name: 'обычное',     emoji: '🌱', seed: 14,  fruit: 2 },
  { level: 'A1',      name: 'необычное',   emoji: '🌿', seed: 60,  fruit: 7 },
  { level: 'A2',      name: 'редкое',      emoji: '🍀', seed: 240, fruit: 25 },
  { level: 'B1',      name: 'легендарное', emoji: '✨', seed: 900, fruit: 85 },
];
// Внутри уровня темы тоже дорожают: первая — самая дешёвая, двадцать пятая — вчетверо дороже.
// Один урожай окупает семя примерно вдвое, а куст остаётся и плодоносит снова — в этом и смысл
// вкладываться: чем дольше держишь грядку, тем больше она принесла.
// номер берём внутри уровня (starter-07 → 7), иначе редкие темы улетают в космос
const lessonNum = id => { const m = /-(\d+)$/.exec(String(id || '')); return m ? +m[1] : 1; };
const lessonMul = num => 1 + 0.12 * Math.max(0, (num | 0) - 1);
// на одном кусте вызревает 2 или 3 плода — у каждого слова своё число, но всегда одно и то же
const wordHash = w => { let h = 0; for (let i = 0; i < w.length; i++) h = (h * 31 + w.charCodeAt(i)) >>> 0; return h; };
const fruitsOf = w => 2 + wordHash(String(w)) % 2;
const seedPrice  = les => Math.round(TIERS[les.tier].seed  * lessonMul(lessonNum(les.id)));
// Начинающему тяжело сразу собрать всю тему, поэтому первые семена — по одному слову.
// «starter-01#apple» — семя одного куста. Каждое следующее слово темы заметно дороже,
// а первый урожай с куста — всего один плод; со второго круга их становится больше.
const WSEED = /^([a-z0-9-]{3,24})#([a-z]{2,20})$/;
const parseSeed = id => { const m = WSEED.exec(String(id || '')); return m ? { lesson: m[1], word: m[2] } : null; };
function wordIndex(les, word) { return (les.words || []).findIndex(w => w.word === word); }
function wordSeedPrice(les, word) {          // внутри темы слова дорожают по нарастающей
  const i = Math.max(0, wordIndex(les, word));
  return Math.max(1, Math.round(TIERS[les.tier].seed * lessonMul(lessonNum(les.id)) * (0.22 + 0.16 * i)));
}
const WORD_FRUITS = [3, 2, 2];         // новый куст сразу даёт 3 плода, на повторении — по 2               // первый урожай — один плод, дальше больше
// грядка из отдельных слов растёт мягко: сперва по одному плоду, потом больше.
// набор «вся тема» — сразу по 2–3, он и покупается позже
const bedFruits = (b, w, cyc) => parseSeed(String(b.seed || ''))
  ? WORD_FRUITS[Math.min(WORD_FRUITS.length - 1, (cyc === undefined ? b.cycle : cyc) | 0)]
  : fruitsOf(w);
const fruitPrice = les => Math.round(TIERS[les.tier].fruit * lessonMul(lessonNum(les.id)));
const tierOf = level => Math.max(0, TIERS.findIndex(t => t.level === level));
const lessonCache = new Map();
function loadLesson(id) {              // словарь урока берём из каталога, магазин семян = список уроков
  if (!/^[a-z0-9-]{3,24}$/.test(id)) return null;
  if (lessonCache.has(id)) return lessonCache.get(id);
  let res = null;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(PUB, 'lessons', id + '.json'), 'utf8'));
    const words = (raw.vocabulary || []).slice(0, 16)
      .map(v => ({ word: String(v.word || '').toLowerCase(), emoji: v.emoji || '🌱', ru: v.ru || '' }))
      .filter(v => v.word);
    const theme = ((String(raw.title || '').match(/\(([^)]+)\)/) || [])[1] || raw.theme || '').trim();
    const level = String(raw.level || 'Starter');
    // грамматический шаблон и диалог нужны разговорной станции — раньше они здесь терялись
    const sentence = Array.isArray(raw.sentence) ? raw.sentence.map(String) : [];
    const roleplay = raw.roleplay && raw.roleplay.a
      ? { title: String(raw.roleplay.title || ''), a: String(raw.roleplay.a), b: String(raw.roleplay.b || '') } : null;
    if (words.length) res = { id, title: raw.title || id, theme, words, level, tier: tierOf(level),
                              num: raw.num | 0, sentence, roleplay };
  } catch (e) {}
  lessonCache.set(id, res);
  return res;
}
let lessonIndexCache = null;
function lessonIndex() {               // каталог уроков = ассортимент киоска семян
  if (lessonIndexCache) return lessonIndexCache;
  try { lessonIndexCache = JSON.parse(fs.readFileSync(path.join(PUB, 'lessons', 'index.json'), 'utf8')); }
  catch (e) { lessonIndexCache = []; }
  return lessonIndexCache;
}
// ─────────────────────────────────────────────────────────────
// РЕЖИМ БОССОВ. Каждое магическое существо приходит топтать огород.
// Киркой его оглушают, а урон наносят словами — теми, что игрок вырастил.
// forme: тело собирается из деталей, поэтому все двадцать выглядят по-разному.
// ─────────────────────────────────────────────────────────────
const BOSSES = [
  { id:1,  name:'Грязевой Крот',      emoji:'🦫', move:'burrow', hp:60,   dmg:1, body:'mole',    col:['#6b4a2f','#8a6340','#f0d9a0'], every:26 },
  { id:2,  name:'Сорняк-Душитель',    emoji:'🌿', move:'crawl',  hp:90,   dmg:1, body:'vine',    col:['#3f7a2e','#61a844','#c9e07a'], every:24 },
  { id:3,  name:'Саранчиная Стая',    emoji:'🦗', move:'fly',    hp:130,  dmg:1, body:'swarm',   col:['#7d8f34','#a8bd4a','#e6f0a0'], every:22 },
  { id:4,  name:'Каменный Голем',     emoji:'🗿', move:'walk',   hp:190,  dmg:2, body:'golem',   col:['#6e6e73','#8d8d94','#b9b9c0'], every:22 },
  { id:5,  name:'Ледяная Жаба',       emoji:'🐸', move:'hop',    hp:260,  dmg:2, body:'toad',    col:['#2f7f8f','#4fb3c7','#d6f4ff'], every:20 },
  { id:6,  name:'Огненный Лис',       emoji:'🦊', move:'walk',   hp:340,  dmg:2, body:'fox',     col:['#c0392b','#e8622f','#ffd07a'], every:20 },
  { id:7,  name:'Тенистый Волк',      emoji:'🐺', move:'walk',   hp:430,  dmg:3, body:'wolf',    col:['#2c2f45','#454b70','#8f6ad8'], every:19 },
  { id:8,  name:'Грозовой Ворон',     emoji:'🐦‍⬛', move:'fly',   hp:530,  dmg:3, body:'raven',   col:['#1d2030','#3a3f5c','#7ec7f0'], every:18 },
  { id:9,  name:'Песчаный Скорпион',  emoji:'🦂', move:'crawl',  hp:650,  dmg:3, body:'scorp',   col:['#b08a45','#d8b269','#f2e2b0'], every:18 },
  { id:10, name:'Ядовитый Слизень',   emoji:'🐌', move:'crawl',  hp:790,  dmg:4, body:'slug',    col:['#4a7a2c','#7fbf3f','#c8f06a'], every:17 },
  { id:11, name:'Кристальный Паук',   emoji:'🕷️', move:'walk',   hp:950,  dmg:4, body:'spider',  col:['#5b3f8f','#8f6ad8','#d6c4ff'], every:16 },
  { id:12, name:'Лунная Сова',        emoji:'🦉', move:'fly',    hp:1130, dmg:4, body:'owl',     col:['#3b4d6e','#6f86b8','#e8eeff'], every:16 },
  { id:13, name:'Болотный Тролль',    emoji:'👹', move:'walk',   hp:1330, dmg:5, body:'troll',   col:['#4c6b3a','#6f9a52','#c2d98a'], every:15 },
  { id:14, name:'Железный Жук',       emoji:'🪲', move:'crawl',  hp:1560, dmg:5, body:'beetle',  col:['#3a4450','#6b7787','#9fd8ff'], every:15 },
  { id:15, name:'Пепельный Феникс',   emoji:'🔥', move:'fly',    hp:1820, dmg:6, body:'phoenix', col:['#8e2f14','#e8622f','#ffd07a'], every:14 },
  { id:16, name:'Ледяной Мамонт',     emoji:'🦣', move:'walk',   hp:2120, dmg:6, body:'mammoth', col:['#4a6d8f','#7fb0d8','#eaf7ff'], every:14 },
  { id:17, name:'Молниевый Змей',     emoji:'🐍', move:'crawl',  hp:2460, dmg:7, body:'serpent', col:['#2a6b5a','#3fbf8f','#f1f4a0'], every:13 },
  { id:18, name:'Теневой Дракончик',  emoji:'🐲', move:'fly',    hp:2850, dmg:7, body:'dragon',  col:['#3a2a5a','#6b4fbf','#d84fa0'], every:13 },
  { id:19, name:'Голем-Страж Сада',   emoji:'🛡️', move:'walk',   hp:3300, dmg:8, body:'guard',   col:['#5a4a2f','#8f7a45','#f0d9a0'], every:12 },
  { id:20, name:'Садовый Титан',      emoji:'👑', move:'walk',   hp:3900, dmg:9, body:'titan',   col:['#6b2f4a','#bf4f7a','#ffd070'], every:12 },
];
// Оружие: чем дальше, тем сильнее удар киркой (оглушение приходит быстрее)
const WEAPONS = [
  { id:0,  name:'Деревянная кирка', emoji:'🪵', power:1,  price:0    },
  { id:1,  name:'Каменная кирка',   emoji:'🪨', power:2,  price:40   },
  { id:2,  name:'Медный молот',     emoji:'🔨', power:3,  price:110  },
  { id:3,  name:'Железная кирка',   emoji:'⛏️', power:4,  price:240  },
  { id:4,  name:'Серебряный серп',  emoji:'🌙', power:5,  price:430  },
  { id:5,  name:'Золотые грабли',   emoji:'🥇', power:6,  price:700  },
  { id:6,  name:'Кристальный клинок',emoji:'💎',power:7,  price:1080 },
  { id:7,  name:'Ледяной топор',    emoji:'🧊', power:8,  price:1580 },
  { id:8,  name:'Огненный жезл',    emoji:'🔥', power:9,  price:2220 },
  { id:9,  name:'Грозовой молот',   emoji:'⚡', power:10, price:3010 },
  { id:10, name:'Лунный серп',      emoji:'🌕', power:11, price:3970 },
  { id:11, name:'Теневой кинжал',   emoji:'🗡️', power:12, price:5110 },
  { id:12, name:'Изумрудная коса',  emoji:'💚', power:13, price:6450 },
  { id:13, name:'Рубиновый молот',  emoji:'❤️', power:14, price:8000 },
  { id:14, name:'Алмазная кирка',   emoji:'💠', power:15, price:9780 },
  { id:15, name:'Звёздный трезубец',emoji:'🔱', power:16, price:11800},
  { id:16, name:'Радужный посох',   emoji:'🌈', power:17, price:14080},
  { id:17, name:'Драконий клык',    emoji:'🐉', power:18, price:16630},
  { id:18, name:'Титановый молот',  emoji:'🛠️', power:19, price:19470},
  { id:19, name:'Клинок Садовника', emoji:'🌟', power:22, price:22610},
];
// Питомцы: за каждого побеждённого босса — своё существо, оно живёт на участке
const PETS = [
  'Кротёнок','Лозовичок','Светлячок','Камешек','Ледяной Головастик','Лисёнок-Искра',
  'Тенекот','Воронёнок','Скорпиончик','Слизнячок','Паучок-Кристаллик','Совёнок',
  'Тролленок','Жучок-Броневик','Птенец Феникса','Мамонтёнок','Змейка-Молния',
  'Дракончик','Голем-Малыш','Титанёнок',
];
// ── Трофеи: за каждого босса своя вещь. Её носят, она даёт эффект, и ею можно поделиться ──
const ARTIFACTS = [
  { id:'a1',  name:'Перчатка Крота',      emoji:'🧤', eff:'grow',  val:0.08, desc:'растения зреют на 8% быстрее' },
  { id:'a2',  name:'Оберег из лозы',      emoji:'🍀', eff:'stomp', val:0.15, desc:'боссы топчут грядки реже' },
  { id:'a3',  name:'Крыло саранчи',       emoji:'🪶', eff:'grow',  val:0.10, desc:'растения зреют на 10% быстрее' },
  { id:'a4',  name:'Осколок голема',      emoji:'🪨', eff:'hit',   val:1,    desc:'кирка бьёт на +1 сильнее' },
  { id:'a5',  name:'Ледяная линза',       emoji:'🔮', eff:'coin',  val:0.15, desc:'за плоды дают на 15% больше' },
  { id:'a6',  name:'Хвост лиса',          emoji:'🦊', eff:'word',  val:0.12, desc:'слово наносит на 12% больше урона' },
  { id:'a7',  name:'Клык волка',          emoji:'🦷', eff:'hit',   val:2,    desc:'кирка бьёт на +2 сильнее' },
  { id:'a8',  name:'Перо ворона',         emoji:'🖋️', eff:'stomp', val:0.20, desc:'боссы топчут грядки реже' },
  { id:'a9',  name:'Жало скорпиона',      emoji:'🗡️', eff:'word',  val:0.15, desc:'слово наносит на 15% больше урона' },
  { id:'a10', name:'Слизь-удобрение',     emoji:'🧪', eff:'grow',  val:0.15, desc:'растения зреют на 15% быстрее' },
  { id:'a11', name:'Кристальная нить',    emoji:'💠', eff:'coin',  val:0.20, desc:'за плоды дают на 20% больше' },
  { id:'a12', name:'Лунное перо',         emoji:'🌙', eff:'word',  val:0.20, desc:'слово наносит на 20% больше урона' },
  { id:'a13', name:'Дубина тролля',       emoji:'🪵', eff:'hit',   val:3,    desc:'кирка бьёт на +3 сильнее' },
  { id:'a14', name:'Панцирь жука',        emoji:'🛡️', eff:'life',  val:1,    desc:'+1 жизнь в бою' },
  { id:'a15', name:'Пепел феникса',       emoji:'🔥', eff:'grow',  val:0.20, desc:'растения зреют на 20% быстрее' },
  { id:'a16', name:'Бивень мамонта',      emoji:'🦴', eff:'hit',   val:4,    desc:'кирка бьёт на +4 сильнее' },
  { id:'a17', name:'Чешуя змея',          emoji:'🐍', eff:'life',  val:1,    desc:'+1 жизнь в бою' },
  { id:'a18', name:'Драконий глаз',       emoji:'👁️', eff:'word',  val:0.25, desc:'слово наносит на 25% больше урона' },
  { id:'a19', name:'Щит стража',          emoji:'🛡️', eff:'life',  val:2,    desc:'+2 жизни в бою' },
  { id:'a20', name:'Корона Титана',       emoji:'👑', eff:'coin',  val:0.35, desc:'за плоды дают на 35% больше' },
];
const artById = id => ARTIFACTS.find(a => a.id === id) || null;
function bagAdd(g, id, n) { g.items = g.items || {}; g.items[id] = Math.min(999, (g.items[id] | 0) + (n | 0 || 1)); }
function bagTake(g, id, n) {
  n = n | 0 || 1;
  if ((g.items && g.items[id] | 0) < n) return false;
  g.items[id] -= n; if (!g.items[id]) delete g.items[id];
  return true;
}
function artBonus(g, eff) {            // суммарный эффект надетых трофеев
  let sum = 0;
  for (const id of Object.keys(g.items || {})) {
    const a = artById(id); if (a && a.eff === eff) sum += a.val * Math.min(3, g.items[id] | 0);
  }
  return sum;
}
// содержимое рюкзака одним списком — его и рисует клиент
// ── лента занятий: учитель видит, кто чем сейчас занят ──
function logAct(room, me, text, kind) {
  if (!room || !me) return;
  bcast(room, { t: 'act', id: me.id, name: me.name, text, kind: kind || '', at: Date.now() });
}
function gardenOf(client) {             // сад соседа: у ученика в аккаунте, у гостя — в соединении
  if (client.userId && db.users[client.userId]) {
    const u = db.users[client.userId];
    u.garden = u.garden || newGarden();
    return u.garden;
  }
  return client.guestGarden || null;
}
function bagList(g) {
  const out = [];
  for (const [id, n] of Object.entries(g.seeds || {})) {
    const ws = parseSeed(id), les = loadLesson(ws ? ws.lesson : id);
    if (!les) continue;
    out.push({ id, kind: 'seed', n, name: ws ? ws.word : (les.theme || les.title),
               emoji: ws ? ((les.words.find(w => w.word === ws.word) || {}).emoji || '🌱') : '📦',
               desc: ws ? 'семя — посади на грядке' : 'набор: вся тема сразу' });
  }
  for (const [id, n] of Object.entries(g.items || {})) {
    const a = artById(id); if (!a) continue;
    out.push({ id, kind: 'art', n, name: a.name, emoji: a.emoji, desc: a.desc });
  }
  for (const nm of (g.pets || [])) out.push({ id: 'pet:' + nm, kind: 'pet', n: 1, name: nm, emoji: '🐾', desc: 'питомец — ходит по участку' });
  return out;
}
const BED_SLOTS = 16;                  // столько кустов помещается на одну грядку
// как босс догоняет и чем бьёт — у каждого своё
const BOSS_MOVE = { walk:{sp:2.4,reach:2.8,every:2400}, crawl:{sp:1.9,reach:2.6,every:2600},
                    fly:{sp:3.4,reach:3.4,every:2000},  hop:{sp:2.8,reach:3.0,every:2500},
                    burrow:{sp:2.1,reach:2.4,every:2800} };
const BOSS_ATTACK = ['кусает','хлещет лозой','налетает роем','бьёт кулаком','прыгает сверху',
  'дышит огнём','рвёт когтями','пикирует','жалит хвостом','плюётся кислотой',
  'стреляет паутиной','бьёт крылом','швыряет камень','таранит панцирем','обдаёт жаром',
  'сбивает бивнями','бьёт молнией','дышит тьмой','обрушивает щит','топает так, что дрожит земля'];
const BOSS_EVERY = 4;                  // после стольких собранных кустов приходит босс
const STUN_MS = 12000;                 // окно, когда босс оглушён и слова наносят урон
const SLOW_MS = 2600;                  // после удара киркой босс ненадолго еле ползёт
// Урон словом по оглушённому. Первых боссов надо валить с двух точных попаданий —
// иначе ребёнок устаёт раньше, чем понимает механику. Дальше доля падает: больше слов на босса.
// Босс встречается редко, поэтому бой короткий и яркий: два точных слова — и он повержен.
// А если слово сказано сразу, в первые секунды оглушения, — супер-удар вдвое сильнее,
// и хватает одного слова.
const wordShare = i => Math.max(0.16, 0.6 - (i | 0) * 0.022);
const CRIT_MS = 3000;                  // «в нужный момент» — первые 3 с после оглушения
const CRIT_X  = 2;
const WORD_FAR  = 0.025;               // слово издалека по злому боссу — только царапина
const boss_i = g => Math.min(BOSSES.length - 1, Math.max(0, g.bossDone | 0));
const weaponOf = g => WEAPONS[Math.min(WEAPONS.length - 1, Math.max(0, g.weapon | 0))];
function bossSpawn(g) {
  const B = BOSSES[boss_i(g)];
  const lives = 4 + Math.round(artBonus(g, 'life'));
  g.boss = { i: boss_i(g), hp: B.hp, max: B.hp, stage: 'rage', meter: 0,
             need: 3 + Math.floor(boss_i(g) / 3),
             until: 0, nextStomp: Date.now() + B.every * 1000, eaten: 0, startedAt: Date.now(),
             x: null, z: null, px: null, pz: null, slowUntil: 0,
             php: lives, pmax: lives, cd: Date.now() + 2500, tick: Date.now() };
  return B;
}
function bossWords(g) {                // урон наносят только те слова, что игрок уже вырастил
  const out = new Set();
  for (const id of Object.keys(g.cropsW || {})) { const w = parseSeed(id); if (w) out.add(w.word); }
  for (const b of Object.values(g.beds || {})) for (const w of (b.words || [])) out.add(w.word);
  return [...out];
}
function bossTick(g) {                 // босс топчет грядки, пока его не остановят
  const s = g.boss; if (!s) return null;
  const B = BOSSES[s.i], now = Date.now();
  if (s.stage === 'stun' && now > s.until) { s.stage = 'rage'; s.meter = 0; }
  const ev = [];
  while (s.nextStomp && now >= s.nextStomp) {
    const keys = Object.keys(g.beds || {});
    if (!keys.length) { ev.push({ t: 'gone' }); g.boss = null; return ev; }   // топтать больше нечего
    const k = keys[Math.floor(Math.random() * keys.length)];
    const lost = g.beds[k];
    delete g.beds[k];
    s.eaten++;
    ev.push({ t: 'stomp', bed: +k, theme: lost && lost.theme });
    s.nextStomp = now + B.every * 1000;
  }
  return ev;
}
function bossLose(g) {                  // игрока сбили: одно растение потеряно, босс уходит
  const beds = Object.keys(g.beds || {});
  let lost = null;
  if (beds.length) {
    const k = beds[Math.floor(Math.random() * beds.length)], b = g.beds[k];
    const ws = (b.words || []);
    if (ws.length) {
      const j = Math.floor(Math.random() * ws.length);
      lost = ws[j].word;
      b.words = ws.filter((_, i) => i !== j);
      if (b.st) delete b.st[lost];
      b.ripe = (b.ripe || []).filter(w => w !== lost);
      if (!b.words.length) delete g.beds[k];
    }
  }
  g.boss = null;
  g.sinceBoss = 1;      // проиграл — посади растение заново, и он сразу вернётся
  return { plant: lost };
}
function bossReward(g) {               // победа: оружие, питомец, монеты и новые семена
  const idx = g.bossDone | 0;
  const B = BOSSES[Math.min(BOSSES.length - 1, idx)];
  g.bossDone = idx + 1;
  g.boss = null;
  g.sinceBoss = 0;
  const wid = Math.min(WEAPONS.length - 1, g.bossDone);
  const gotWeapon = wid > (g.weapon | 0);
  if (gotWeapon) g.weapon = wid;
  const pet = PETS[Math.min(PETS.length - 1, idx)];
  if (!Array.isArray(g.pets)) g.pets = [];
  if (!g.pets.includes(pet)) g.pets.push(pet);
  const coins = 10 + idx * 12;
  g.coins = (g.coins | 0) + coins;
  const art = ARTIFACTS[Math.min(ARTIFACTS.length - 1, idx)];
  if (art) bagAdd(g, art.id, 1);        // трофей в рюкзак: его можно носить и подарить
  // открываем следующее слово — награда за босса тоже двигает программу
  const opened = [];
  const all = lessonIndex();
  outer: for (const les of all) {
    const full = loadLesson(les.id); if (!full) continue;
    for (const w of (full.words || [])) {
      const id = wordSeedId(les.id, w.word);
      if (!g.openW[id]) { g.openW[id] = 1; opened.push({ id, theme: w.word, level: les.level }); break outer; }
    }
  }
  return { boss: B.name, emoji: B.emoji, weapon: gotWeapon ? WEAPONS[wid] : null, pet, coins, opened,
    art: art ? { id: art.id, name: art.name, emoji: art.emoji, desc: art.desc } : null };
}
const LEVEL_GATE = 5;                  // столько тем уровня надо освоить, чтобы открылся следующий
function levelList(level) { return lessonIndex().filter(x => x.level === level); }
function nextLesson(id) {              // следующая тема того же уровня
  const les = loadLesson(id); if (!les) return null;
  const list = levelList(les.level), i = list.findIndex(x => x.id === id);
  return (i >= 0 && list[i + 1]) ? list[i + 1] : null;
}
function nextLevelFirst(level) {
  const i = TIERS.findIndex(t => t.level === level);
  const nx = TIERS[i + 1];
  return nx ? (levelList(nx.level)[0] || null) : null;
}
function doneInLevel(g, level) {       // сколько разных тем уровня уже собрано хотя бы раз
  return levelList(level).filter(x => (g.crops[x.id] | 0) > 0).length;
}
function unlockAfter(g, id) {          // собрал тему целиком — открывается следующая
  const les = loadLesson(id); if (!les) return [];
  const opened = [];
  const nx = nextLesson(id);
  if (nx && !g.open[nx.id]) { g.open[nx.id] = 1; opened.push(nx); }
  if (doneInLevel(g, les.level) >= LEVEL_GATE) {
    const nl = nextLevelFirst(les.level);
    if (nl && !g.open[nl.id]) { g.open[nl.id] = 1; opened.push(nl); }
  }
  return opened;
}
function wordSeedId(lessonId, word) { return lessonId + '#' + word; }
// Дни, в которые ребёнок реально работал на огороде (сажал или собирал).
// Боссы должны быть редким событием: первый приходит через несколько таких дней,
// а не через десять минут после первой грядки.
const dayKey = (t) => new Date(t || Date.now()).toISOString().slice(0, 10);
function markDay(g) {
  g.days = g.days || {};
  const k = dayKey();
  if (!g.days[k]) {
    g.days[k] = 1;
    const keys = Object.keys(g.days).sort();
    while (keys.length > 400) delete g.days[keys.shift()];   // храним последний год с хвостиком
  }
}
const activeDays = g => Object.keys(g.days || {}).length;
function distinctPlanted(g) {           // сколько разных растений сейчас растёт на участке
  const set = new Set();
  for (const b of Object.values(g.beds || {})) for (const w of (b.words || [])) set.add(b.lesson + '#' + w.word);
  return set.size;
}
// Первому боссу нужен большой огород: 10 разных растений сразу на грядках.
// Дальше планка растёт до 20 — выше не поднимаем, иначе места не хватит.
const bossNeedPlants = i => Math.min(20, 10 + (i | 0));
// И время: первый босс — после 5 дней работы с огородом, каждый следующий ждёт ещё дольше.
const bossNeedDays = i => Math.min(60, 5 + (i | 0) * 2);
function bossCanCome(g) {
  // Босс — редкое событие. Он приходит, только когда сошлось всё сразу:
  // круг новичка замкнут, огород большой, ребёнок возвращался к нему несколько дней,
  // и с прошлого боя он собрал хотя бы один куст.
  return !g.boss && g.bossDone < BOSSES.length
      && g.soldOnce
      && (g.sinceBoss | 0) >= 1
      && activeDays(g) >= bossNeedDays(g.bossDone)
      && distinctPlanted(g) >= bossNeedPlants(g.bossDone);
}
function unlockNextWord(g, lessonId, word) {    // открыть следующее слово темы, не трогая счётчики
  const les = loadLesson(lessonId); if (!les) return [];
  const list = les.words || [], i = list.findIndex(w => w.word === word);
  const nx = i >= 0 ? list[i + 1] : null;
  if (!nx) return [];
  const id = wordSeedId(lessonId, nx.word);
  if (g.openW[id]) return [];
  g.openW[id] = 1;
  return [{ id, theme: nx.word, level: les.level }];
}
function unlockAfterWord(g, lessonId, word) {   // собрал слово — открылось следующее в теме
  const les = loadLesson(lessonId); if (!les) return [];
  const opened = [];
  const list = les.words || [], i = list.findIndex(w => w.word === word);
  const nx = i >= 0 ? list[i + 1] : null;
  if (nx) {
    const id = wordSeedId(lessonId, nx.word);
    if (!g.openW[id]) { g.openW[id] = 1; opened.push({ id, theme: nx.word, level: les.level }); }
  } else {
    // Слова темы кончились. Даём набор «вся тема» — и вместо следующей темы выдаём
    // ЗАКАЗ на станции. Следующая тема откроется, когда заказ будет выполнен:
    // так практика фраз становится обязательной ступенью, а не необязательным кружком.
    if (!g.open[lessonId]) { g.open[lessonId] = 1; opened.push({ id: lessonId, theme: les.theme || les.title, level: les.level }); }
    if (!g.order) {
      const o = makeOrder(g, lessonId);
      if (o) { g.order = o; opened.push({ order: true, kind: o.kind, theme: o.theme }); }
      else {                                  // для темы нет шаблона фраз — пропускаем станцию
        const nl = nextLesson(lessonId);
        if (nl) {
          const first = (loadLesson(nl.id) || {}).words || [];
          if (first[0]) {
            const id = wordSeedId(nl.id, first[0].word);
            if (!g.openW[id]) { g.openW[id] = 1; opened.push({ id, theme: first[0].word, level: nl.level }); }
          }
        }
      }
    }
  }
  return opened;
}
function helpingHand(g) {               // тупика быть не должно: застрял — дадим семя даром
  if (Object.keys(g.beds || {}).length || Object.keys(g.seeds || {}).length) return;
  if (Object.values(g.basket || {}).some(n => n > 0)) return;
  let best = null, bp = Infinity;
  for (const id of Object.keys(g.openW || {})) {
    const ws = parseSeed(id); if (!ws) continue;
    const les = loadLesson(ws.lesson); if (!les) continue;
    const pr = wordSeedPrice(les, ws.word);
    if (pr < bp) { bp = pr; best = id; }
  }
  if (best && (g.coins | 0) < bp) g.freeSeed = best;
}
// ================= 🗣 РАЗГОВОРНАЯ СТАНЦИЯ =================
// В каждом уроке лежит грамматический шаблон (`sentence`) — «i like apple», «i can see a bread»,
// «there is a car in my room». Слово урока в нём меняем на то, которое ребёнок вырастил сам.
// Так грамматика тренируется на уже знакомых словах, а платят за фразу много больше, чем за плод:
// новые семена покупаются именно здесь, а не бесконечным сбором старого урожая.
const PHRASE_PAY = 4;                  // фраза стоит столько же, сколько 4 плода этого уровня
// Четыре станции разговорного квартала. У каждой своя грамматика, и все рамки
// осмысленны с ЛЮБЫМ существительным — иначе ребёнок заучит бессмыслицу.
const TALK = {
  cook:  { pay: 4, title: 'Кухня',        ask: 'What do you like?'   },  // шаблон самого урока
  shop:  { pay: 5, title: 'Касса',        ask: 'What do you want?',
           frame: ['how', 'much', 'is', 'the', '*'] },
  lost:  { pay: 4, title: 'Бюро находок', ask: 'Whose is this?',
           frame: ['this', 'is', 'my', '*'] },
  stage: { pay: 7, title: 'Сцена',        ask: 'Say your line'       },  // реплика из ролевой сценки
};
const talkKind = k => (TALK[k] ? String(k) : 'cook');
// Шаблон фразы для станции: где слот под слово ребёнка и из каких частей собрать фразу.
function phraseTemplate(les, kind) {
  const k = talkKind(kind);
  if (k === 'stage') {                          // сценка: готовая реплика, слота нет
    const a = les && les.roleplay && les.roleplay.a;
    if (!a) return null;
    const parts = String(a).toLowerCase().replace(/[^a-z\s']/g, ' ').split(/\s+/).filter(Boolean);
    return parts.length ? { parts, slot: -1, reply: (les.roleplay.b || '') } : null;
  }
  if (TALK[k].frame) {
    const parts = TALK[k].frame.slice();
    return { parts, slot: parts.indexOf('*') };
  }
  const raw = (les && les.sentence) || [];      // кухня — грамматика самого урока
  if (!raw.length) return null;
  const vocab = new Set((les.words || []).map(w => String(w.word).toLowerCase()));
  const slot = raw.findIndex(t => vocab.has(String(t).toLowerCase()));
  if (slot < 0) return null;
  return { parts: raw.map(String), slot };
}
// какие слова ребёнок уже вырастил — на них и строим фразы
function grownWords(g) {
  const out = [];
  const seen = new Set();
  const add = (lesson, word) => {
    const k = lesson + '#' + word;
    if (seen.has(k)) return; seen.add(k);
    out.push({ lesson, word });
  };
  for (const id of Object.keys(g.cropsW || {})) { const w = parseSeed(id); if (w) add(w.lesson, w.word); }
  for (const b of Object.values(g.beds || {})) for (const w of (b.words || [])) add(b.lesson, w.word);
  return out;
}
// ── ЗАКАЗЫ СТАНЦИЙ: главная цепочка обучения ──────────────────────────────────
// Тема пройдена (все её слова выращены) → на одной из станций появляется ЗАКАЗ.
// Заказ конечный: принести названные плоды и сказать столько-то фраз. Выполнил —
// большой приз, трофей и ТОЛЬКО ТОГДА открывается следующая тема в киоске.
// Без заказа станция ничего не даёт: бесконечной фермы фраз быть не должно.
const ORDER_KINDS = ['cook', 'shop', 'lost', 'stage'];
const ORDER_TROPHY = { cook:'a5', shop:'a1', lost:'a2', stage:'a6' };
const ORDER_SAY = 4;            // столько фраз в заказе
const ORDER_EACH = 2;           // столько плодов каждого названного слова
const ORDER_WORDS = 3;          // сколько слов темы попадает в заказ
function makeOrder(g, lessonId) {
  const les = loadLesson(lessonId); if (!les) return null;
  const kind = ORDER_KINDS[(g.orders | 0) % ORDER_KINDS.length];
  if (!phraseTemplate(les, kind)) return null;             // нечего просить — не мучаем ребёнка
  const words = (les.words || []).slice(0, ORDER_WORDS).map(w => String(w.word));
  if (!words.length) return null;
  const need = {}, emo = {};
  for (const w of words) {
    need[w] = ORDER_EACH;
    emo[w] = ((les.words || []).find(x => x.word === w) || {}).emoji || '🌱';
  }
  return { kind, lesson: lessonId, theme: les.theme || les.title,
           need, emo, gave: {}, say: ORDER_SAY, said: 0, at: Date.now() };
}
function orderCard(g) {                 // как заказ выглядит на экране станции
  const o = g.order; if (!o) return null;
  const les = loadLesson(o.lesson) || {};
  const emo = w => ((les.words || []).find(x => x.word === w) || {}).emoji || '🌱';
  const items = Object.keys(o.need).map(w => ({ word: w, emoji: emo(w),
    need: o.need[w] | 0, gave: Math.min(o.gave[w] | 0, o.need[w] | 0),
    have: (g.basket && g.basket[o.lesson]) | 0 }));
  const bring = items.every(i => i.gave >= i.need);
  return { kind: o.kind, theme: o.theme, lesson: o.lesson, items,
           say: o.say, said: Math.min(o.said, o.say),
           bringDone: bring, sayDone: o.said >= o.say, ready: bring && o.said >= o.say,
           prize: orderPrize(o) };
}
const orderPrize = o => Math.max(24, fruitPrice(loadLesson(o.lesson) || {}) * 12);
// сколько плодов этой темы лежит в корзине — сдают именно их
function orderGive(g) {
  const o = g.order; if (!o) return { moved: 0 };
  let moved = 0;
  let have = (g.basket && g.basket[o.lesson]) | 0;
  for (const w of Object.keys(o.need)) {
    const want = (o.need[w] | 0) - (o.gave[w] | 0);
    if (want <= 0 || have <= 0) continue;
    const take = Math.min(want, have);
    o.gave[w] = (o.gave[w] | 0) + take; have -= take; moved += take;
  }
  if (moved) { g.basket[o.lesson] = have; if (!have) delete g.basket[o.lesson]; }
  return { moved };
}
function orderFinish(g) {
  const o = g.order; if (!o) return null;
  const prize = orderPrize(o);
  g.coins += prize;
  g.orders = (g.orders | 0) + 1;
  const trophy = artById(ORDER_TROPHY[o.kind] || 'a5');
  if (trophy) bagAdd(g, trophy.id, 1);
  const opened = [];
  const nl = nextLesson(o.lesson);          // вот теперь открывается следующая тема
  if (nl) {
    const first = (loadLesson(nl.id) || {}).words || [];
    if (first[0]) {
      const id = wordSeedId(nl.id, first[0].word);
      if (!g.openW[id]) { g.openW[id] = 1; opened.push({ id, theme: first[0].word, level: nl.level }); }
    }
  }
  const res = { kind: o.kind, theme: o.theme, prize, opened,
                trophy: trophy ? { emoji: trophy.emoji, name: trophy.name, desc: trophy.desc } : null,
                next: nl ? (loadLesson(nl.id) || {}).theme || nl.id : '' };
  g.order = null;
  return res;
}
const saidKey = (kind, lesson, word) => talkKind(kind) + ':' + lesson + '#' + word;
function phraseTask(g, kind) {          // что сказать прямо сейчас на этой станции
  const k = talkKind(kind);
  const pool = grownWords(g).filter(x => phraseTemplate(loadLesson(x.lesson), k));
  if (!pool.length) return null;
  // реже повторяем то, что уже отвечали: счётчик в g.said, у каждой станции свой
  g.said = g.said || {};
  const seen = x => g.said[saidKey(k, x.lesson, x.word)] | 0;
  pool.sort((a, b) => seen(a) - seen(b));
  const best = pool.filter(x => seen(x) === seen(pool[0]));
  const pick = best[Math.floor(Math.random() * best.length)];
  const les = loadLesson(pick.lesson), tpl = phraseTemplate(les, k);
  const parts = tpl.parts.slice();
  if (tpl.slot >= 0) parts[tpl.slot] = pick.word;
  const voc = (les.words || []).find(w => w.word === pick.word) || {};
  return {
    kind: k, lesson: pick.lesson, word: pick.word, emoji: voc.emoji || '🌱', ru: voc.ru || '',
    text: parts.join(' '), parts, slot: tpl.slot,
    pay: phrasePay(les, g, saidKey(k, pick.lesson, pick.word), k),
    title: k === 'stage' ? ((les.roleplay && les.roleplay.title) || TALK[k].title) : TALK[k].title,
    ask: k === 'stage' ? ((les.roleplay && les.roleplay.title) || '') : TALK[k].ask,
    reply: tpl.reply || '',
    belt: grownWords(g).slice(0, 8).map(x => {
      const l = loadLesson(x.lesson), v = (l && (l.words || []).find(w => w.word === x.word)) || {};
      return { word: x.word, emoji: v.emoji || '🌱' };
    }),
  };
}
function phrasePay(les, g, key, kind) {
  const times = (g.said && g.said[key]) | 0;
  const base = fruitPrice(les) * (TALK[talkKind(kind)].pay || PHRASE_PAY);
  return Math.max(1, Math.round(base * (times === 0 ? 1 : times === 1 ? 0.6 : 0.35)));
}
function shopWords(g) {                 // что лежит на прилавке по словам
  helpingHand(g);
  const out = [];
  for (const id of Object.keys(g.openW || {})) {
    const ws = parseSeed(id); if (!ws) continue;
    const les = loadLesson(ws.lesson); if (!les) continue;
    out.push({ id, lesson: les.id, level: les.level, theme: les.theme || les.title,
      word: ws.word, price: (g.freeSeed === id) ? 0 : wordSeedPrice(les, ws.word), free: g.freeSeed === id,
      fruit: fruitPrice(les), done: g.cropsW[id] | 0,
      planted: Object.values(g.beds || {}).some(b => b.lesson === les.id && (b.words || []).some(w => w.word === ws.word)) });
  }
  return out;
}
function hintNext(g) {                 // что откроется дальше — чтобы цель была видна
  for (const t of TIERS) {
    for (const it of levelList(t.level)) {
      if (g.open[it.id]) continue;
      const prev = levelList(t.level)[levelList(t.level).findIndex(x => x.id === it.id) - 1];
      if (prev && g.open[prev.id]) return { theme: it.theme || it.title, after: prev.theme || prev.title };
      if (!prev) {
        const ti = TIERS.findIndex(x => x.level === t.level);      // у самого первого уровня
        const prevLevel = ti > 0 ? TIERS[ti - 1].level : null;     // предыдущего просто нет
        return { theme: it.theme || it.title, after: null,
          need: prevLevel ? Math.max(0, LEVEL_GATE - doneInLevel(g, prevLevel)) : 0 };
      }
    }
  }
  return null;
}
const STARTER_GIFT = 1;                // первое семя дарят, дальше всё надо заработать
function grantStarter(g) {             // выдаём один раз — пустому саду, чтобы было что сажать сразу
  if (Object.keys(g.beds).length || Object.keys(g.seeds).length || g.coins || Object.keys(g.basket).length) return false;
  if (g.gifted) return false;
  const first = levelList('Starter')[0];
  if (first) {
    const les = loadLesson(first.id), w = les && les.words && les.words[0];
    // семя не кладём в сумку: пусть дойдёт до киоска и возьмёт сам — заодно узнает, где киоск
    if (w) { const id = wordSeedId(first.id, w.word); g.openW[id] = 1; g.freeSeed = id; }
  }
  g.coins = 0;                         // монет не дарим: на семена надо заработать
  g.gifted = true;
  return true;
}
function migrateTrees(u) {             // сады старой версии: дерево-урок → грядка-урок
  if (!u || !u.trees || u.garden) return;
  const g = newGarden();
  for (const [k, tr] of Object.entries(u.trees)) {
    const lesson = tr && loadLesson(String(tr.lesson || ''));
    const i = parseInt(k, 10);
    if (!lesson || !(i >= 0 && i < BEDS_MAX)) continue;
    g.beds[String(i)] = { lesson: lesson.id, title: lesson.title, theme: lesson.theme, tier: lesson.tier,
      words: lesson.words, ripe: [], cycle: Math.max(0, tr.picked | 0), readyAt: Date.now() };
  }
  g.gifted = true;                     // старым игрокам подарок не нужен — у них уже есть посадки
  u.garden = g;
  delete u.trees;
}
const BEDS_MAX = 12;                   // грядок на участке — хватает на дюжину тем сразу
function newGarden() { return { beds: {}, coins: 0, seeds: {}, basket: {}, done: {}, open: {}, crops: {}, openW: {}, cropsW: {}, freeSeed: '', soldOnce: 0, days: {}, said: {}, phrases: 0, order: null, orders: 0,
  bossDone: 0, weapon: 0, pets: [], sinceBoss: 0, boss: null, items: {} }; }
function sanitizeBed(b) {              // грядка из чужих рук (браузер гостя) — доверяем только структуре
  if (!b || typeof b !== 'object') return null;
  const lesson = loadLesson(String(b.lesson || ''));
  if (!lesson) return null;
  const seed = String(b.seed || '');
  const ws = parseSeed(seed);
  const picked = Array.isArray(b.words) ? b.words.map(w => w && w.word).filter(Boolean) : null;
  const byWord = new Map(lesson.words.map(w => [w.word, w]));
  // повторы сохраняем: одно и то же слово может расти на грядке несколькими кустами
  const words = picked && picked.length
    ? picked.filter(w => byWord.has(w)).slice(0, BED_SLOTS).map(w => byWord.get(w))
    : ((ws && ws.lesson === lesson.id) ? lesson.words.filter(w => w.word === ws.word) : lesson.words);
  if (!words.length) return null;
  const known = new Set(words.map(w => w.word));
  const ripe = Array.isArray(b.ripe) ? b.ripe.filter(w => known.has(w)).slice(0, 64) : []; // повторы значат несколько плодов
  const cycle = Math.min(Math.max(b.cycle | 0, 0), 999);
  const readyAt = Math.max(0, +b.readyAt || 0);
  const st = {};
  const count = {};
  for (const w of words) count[w.word] = (count[w.word] | 0) + 1;
  for (const word of Object.keys(count)) {
    const src = (b.st && b.st[word]) || {};
    st[word] = { c: Math.min(999, Math.max(0, src.c | 0)),
                 r: Math.max(0, +src.r || readyAt),
                 n: Math.min(99, Math.max(0, src.n | 0)),
                 k: count[word] };
  }
  return { seed: seed || lesson.id, lesson: lesson.id, title: lesson.title,
    theme: ws ? ws.word : lesson.theme, tier: lesson.tier, words, ripe, cycle, readyAt, st };
}
function sanitizeGarden(src) {
  const g = newGarden();
  if (!src || typeof src !== 'object') return g;
  for (const k of Object.keys(src.beds || {}).slice(0, BEDS_MAX)) {
    const i = parseInt(k, 10), b = sanitizeBed(src.beds[k]);
    if (i >= 0 && i < BEDS_MAX && b) g.beds[String(i)] = b;
  }
  g.coins = Math.min(Math.max(src.coins | 0, 0), 1e9);
  // в сумке лежат и семена-слова («starter-01#apple»), и наборы «вся тема»
  const seedOk = id => { const ws = parseSeed(id); return ws ? !!loadLesson(ws.lesson) : !!loadLesson(id); };
  for (const [id, n] of Object.entries(src.seeds || {})) if (seedOk(id)) g.seeds[id] = Math.min(Math.max(n | 0, 0), 99);
  for (const [id, n] of Object.entries(src.basket || {})) if (loadLesson(id)) g.basket[id] = Math.min(Math.max(n | 0, 0), 9999);
  for (const t of Object.keys(src.done || {})) if (+t >= 0 && +t < TIERS.length) g.done[t] = Math.max(src.done[t] | 0, 0);
  for (const id of Object.keys(src.open || {})) if (loadLesson(id)) g.open[id] = 1;
  for (const [id, n] of Object.entries(src.crops || {})) if (loadLesson(id)) g.crops[id] = Math.min(Math.max(n | 0, 0), 9999);
  for (const id of Object.keys(src.openW || {})) if (parseSeed(id)) g.openW[id] = 1;
  for (const [id, n] of Object.entries(src.cropsW || {})) if (parseSeed(id)) g.cropsW[id] = Math.min(Math.max(n | 0, 0), 9999);
  if (parseSeed(String(src.freeSeed || ''))) g.freeSeed = String(src.freeSeed);
  g.bossDone = Math.min(BOSSES.length, Math.max(0, src.bossDone | 0));
  g.weapon = Math.min(WEAPONS.length - 1, Math.max(0, src.weapon | 0));
  g.sinceBoss = Math.min(99, Math.max(0, src.sinceBoss | 0));
  if (Array.isArray(src.pets)) g.pets = src.pets.filter(x => PETS.includes(x)).slice(0, PETS.length);
  for (const [id, n] of Object.entries(src.items || {})) if (artById(id)) g.items[id] = Math.min(999, Math.max(0, n | 0));
  g.gifted = !!src.gifted;
  g.soldOnce = src.soldOnce ? 1 : 0;
  for (const k of Object.keys(src.days || {}).slice(-400)) if (/^\d{4}-\d{2}-\d{2}$/.test(k)) g.days[k] = 1;
  // ключ счётчика фраз теперь «станция:урок#слово» — старый формат тоже принимаем
  for (const [id, n] of Object.entries(src.said || {})) {
    const bare = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
    if (parseSeed(bare)) g.said[id] = Math.min(9999, Math.max(0, n | 0));
  }
  g.phrases = Math.min(999999, Math.max(0, src.phrases | 0));
  g.orders = Math.min(9999, Math.max(0, src.orders | 0));
  const so = src.order;                       // заказ станции переносим целиком, но с проверкой
  if (so && ORDER_KINDS.includes(so.kind) && loadLesson(so.lesson)) {
    const need = {}, gave = {};
    for (const [w, n] of Object.entries(so.need || {})) need[String(w)] = Math.min(20, Math.max(1, n | 0));
    for (const [w, n] of Object.entries(so.gave || {})) if (need[w]) gave[String(w)] = Math.min(need[w], Math.max(0, n | 0));
    if (Object.keys(need).length) {
      const les = loadLesson(so.lesson);
      const emo = {};
      for (const w of Object.keys(need)) emo[w] = ((les.words || []).find(x => x.word === w) || {}).emoji || '🌱';
      g.order = { kind: so.kind, lesson: so.lesson, theme: les.theme || les.title, need, emo, gave,
                  say: Math.min(20, Math.max(1, so.say | 0 || ORDER_SAY)),
                  said: Math.min(20, Math.max(0, so.said | 0)), at: Date.now() };
    }
  }
  return g;
}
// k — сколько кустов этого слова растёт на грядке. Одно и то же слово можно сажать
// сколько угодно раз: больше кустов — больше плодов за круг.
function plantState(b, word) {          // состояние куста: свой круг, свой срок, своё число кустов
  b.st = b.st || {};
  if (!b.st[word]) b.st[word] = { c: b.cycle | 0, r: +b.readyAt || Date.now(), n: 0, k: 1 };
  if (!(b.st[word].k > 0)) b.st[word].k = 1;
  return b.st[word];
}
const bedKinds = b => [...new Set(((b && b.words) || []).map(w => w.word))];   // слова без повторов
function ripenGarden(g) {              // каждый куст зреет сам по себе, по своим часам
  const now = Date.now();
  for (const b of Object.values(g.beds || {})) {
    if (!b || !b.words) continue;
    const kinds = bedKinds(b);
    for (const word of kinds) {
      const st = plantState(b, word);
      if (st.n > 0 || now < st.r) continue;
      st.n = bedFruits(b, word, st.c) * (st.k | 0 || 1);   // каждый куст даёт свой урожай
    }
    b.ripe = [];                               // общий список — для клиента, он его и рисует
    for (const word of kinds) for (let i = 0; i < (b.st[word].n | 0); i++) b.ripe.push(word);
    b.readyAt = Math.min(...kinds.map(w => b.st[w].r));   // ближайший срок — для подписи
  }
}
function tierOpen(g, tier) {           // редкое семя открывается, когда снят урожай попроще
  return tier <= 0 || (g.done[String(tier - 1)] | 0) > 0;
}
function gardenPublic(g) {             // что видно соседям по улице: только грядки
  return { beds: g.beds };
}
const isClassRoom = code => code !== 'LOBBY' && code !== 'GARDEN';
function newRoom(code, seed, persistent) {
  return { code, seed, clients: new Map(), edits: new Map(), task: null, dones: new Map(), words: [], race: null, persistent: !!persistent };
}
function getOrLoadRoom(code) {
  if (rooms.has(code)) return rooms.get(code);
  const cls = db.classes[code];
  if (!cls) return null;
  const room = newRoom(code, cls.seed, true);
  if (code === 'GARDEN') room.kind = 'garden'; // общий сад — та же улица участков
  room.edits = new Map(Object.entries(cls.edits || {}).map(([k, v]) => [k, v]));
  room.words = cls.words || [];
  rooms.set(code, room);
  return room;
}
function persistRoom(room) {
  if (!room.persistent || !db.classes[room.code]) return;
  db.classes[room.code].edits = Object.fromEntries(room.edits);
  db.classes[room.code].words = room.words;
  saveSoon();
}
function initPayload(room, me) {
  const players = roster(room).filter(p => p.id !== me.id);
  const edits = [...room.edits.entries()].map(([k, v]) => { const [x, y, z] = k.split(',').map(Number); return [x, y, z, v]; });
  const race = room.race
    ? { words: room.race.words, progress: [...room.clients.values()].map(c => [c.id, (c.raceGot || new Set()).size]) }
    : null;
  const p = { t: 'init', build: BUILD, id: me.id, name: me.name, code: room.code, kind: room.kind || null, seed: room.seed, role: me.role, ava: me.ava, players, edits, task: room.task, dones: [...room.dones.values()], words: room.words, race, lesson: room.lesson || null };
  if (room.kind === 'garden') p.plots = plotsOf(room); // чьи грядки где — чтобы нарисовать всю улицу
  if (room.code === 'LOBBY') p.lobby = lobbyPayload();
  return p;
}
function gardenOf(client) { // сад игрока: у зарегистрированных из аккаунта, у гостей — из сессии
  if (client.userId && db.users[client.userId]) {
    const u = db.users[client.userId];
    migrateTrees(u);
    u.garden = u.garden || newGarden();
    return u.garden;
  }
  return client.guestGarden || newGarden();
}
function plotsOf(room) {
  return [...room.clients.values()]
    .sort((a, b) => a.id - b.id)
    .map(c => ({ id: c.id, name: c.name, role: c.role, ...gardenPublic(gardenOf(c)) }));
}
function bcastPlots(room) {
  if (!room || room.kind !== 'garden') return;
  const plots = plotsOf(room);
  for (const c of room.clients.values()) send(c.ws, { t: 'plots', plots, now: Date.now() });
}
function joinRoom(room, ws, name, role, userId, avatar, carry) {
  // у гостя внешность своя, но узнаваемая: подбираем по номеру подключения, а не «все одинаковые»
  const ava = avatar ? sanitizeAva(avatar)
    : sanitizeAva({ skin: nextId % AVA_LIM.skin, hair: (nextId * 5) % AVA_LIM.hair,
                    hairStyle: nextId % AVA_LIM.hairStyle, shirt: (nextId * 3) % AVA_LIM.shirt,
                    pants: nextId % AVA_LIM.pants, hat: 0 });
  const me = { id: nextId++, ws, name, role, ava, x: 0, y: 0, z: 0, userId: userId || null };
  // Сад гостя живёт в соединении, а не в аккаунте. Прицепить его надо здесь, до initPayload:
  // иначе новый мир и все соседи получают пустой участок.
  if (carry) { me.guestGarden = carry.guestGarden; me.moveMe = carry.moveMe; }
  room.clients.set(me.id, me);
  // посещаемость в CRM класса
  if (room.persistent && isClassRoom(room.code) && userId) {
    const u = db.users[userId];
    const cls = db.classes[room.code];
    if (u && u.role === 'student' && cls) {
      cls.students = cls.students || {};
      const rec = cls.students[userId] = cls.students[userId] || { name: u.name, visits: 0, words: 0, stars: 0 };
      rec.visits++; rec.lastSeen = Date.now(); rec.name = u.name;
      saveSoon();
    }
  }
  send(ws, initPayload(room, me));
  bcast(room, { t: 'add', p: { id: me.id, name: me.name, role: me.role, ava: me.ava, x: 0, y: 0, z: 0, yaw: 0 } }, me.id);
  if (room.kind === 'garden') bcastPlots(room);
  console.log(`${name} (${role}) вошёл в ${room.code} (${room.clients.size} чел.)`);
  return me;
}
function creditStudent(room, authed, stars, words) {
  if (!authed || authed.role !== 'student') return;
  authed.stars = (authed.stars || 0) + stars;
  if (room.persistent && isClassRoom(room.code)) {
    const cls = db.classes[room.code];
    if (cls && cls.students && cls.students[authed.id]) {
      cls.students[authed.id].stars += stars;
      cls.students[authed.id].words += words;
    }
  }
  saveSoon();
}
function checkFinale(room) {
  if (!room.task || !room.task.finale) return;
  const studentsIn = [...room.clients.values()].filter(c => c.role !== 'teacher').length;
  if (studentsIn > 0 && room.dones.size >= studentsIn) bcast(room, { t: 'celebrate' });
}
const authUser = u => ({ id: u.id, name: u.name, role: u.role, status: u.status || null, code: u.code || null, stars: u.stars || 0, avatar: u.avatar || null, schedule: u.schedule || '' });

// ================= WS =================
// Молчащее соединение прокси закрывает через пару минут. Ребёнок стоит, читает подсказку —
// и сокет тихо умирает; дальше все его нажатия уходят в никуда. Поэтому — сердцебиение.
const HEARTBEAT_MS = 25000;
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { try { ws.terminate(); } catch (_) {} continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch (_) {}
  }
}, HEARTBEAT_MS);
wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  // за туннелем или прокси настоящий адрес приходит заголовком — по нему и считаем попытки
  const ip = String((req && req.headers && (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'])) ||
    (req && req.socket && req.socket.remoteAddress) || '?').split(',')[0].trim();
  let room = null, me = null, authed = null;
  const guestGarden = newGarden(); let guestStars = 0; // сад гостя живёт в этом соединении
  // перенос этого игрока в другой мир по чужой команде (групповой старт из зоны сбора)
  const moveMe = (target, role) => {
    if (!target || !me || target === room) return;
    room.clients.delete(me.id);
    bcast(room, { t: 'del', id: me.id });
    if (room.clients.size === 0) { persistRoom(room); rooms.delete(room.code); }
    const name = me.name;
    room = target;
    me = joinRoom(room, ws, name, role || 'student', authed && authed.id, authed && authed.avatar, { guestGarden, moveMe });
    me.moveMe = moveMe;
    me.guestGarden = guestGarden; // сад гостя переезжает вместе с ним, иначе соседи видят пустой участок
  };

  const onMessage = data => {
    let m; try { m = JSON.parse(data); } catch (e) { return; }
    ws.isAlive = true;
    if (m.t === 'ping') return send(ws, { t: 'pong' }); // держим канал живым и даём клиенту проверить связь
    if (me && !me.moveMe) { me.moveMe = moveMe; me.guestGarden = guestGarden; } // группу может увести другой; сад гостя виден соседям

    // ---------- аккаунты ----------
    if (m.t === 'autoUser') { // молчаливый аккаунт: ребёнок ничего не заполняет, сад сразу на сервере
      if (authed) return send(ws, { t: 'authok', token: authed.token, user: authUser(authed) });
      let name = clean(m.name);
      if (name.length < 2 || findByName(name)) name = 'Игрок-' + Math.random().toString(36).slice(2, 6).toUpperCase();
      const id = uid();
      const u = { id, role: 'student', name, pin: null, token: newToken(), stars: 0,
                  avatar: null, auto: true, createdAt: Date.now() };
      db.users[id] = u; saveSoon();
      authed = u;
      if (me) me.name = name;
      send(ws, { t: 'authok', token: u.token, user: authUser(u), fresh: true });
      console.log(`заведён сад: ${name}`);
    }
    else if (m.t === 'rename') { // ребёнок вписал своё имя — по нему его потом и найдут в школе
      if (!authed) return send(ws, { t: 'err', msg: 'Сначала войди' });
      const name = clean(m.name);
      if (name.length < 2) return send(ws, { t: 'err', msg: 'Имя слишком короткое' });
      const busy = findByName(name);
      if (busy && busy.id !== authed.id) return send(ws, { t: 'err', msg: 'Такое имя уже занято — придумай другое' });
      authed.name = name; saveSoon();
      if (me) { me.name = name; bcast(room, { t: 'rename', id: me.id, name }); }
      send(ws, { t: 'authok', token: authed.token, user: authUser(authed) });
    }
    else if (m.t === 'reg') { // регистрация ученика
      const name = clean(m.name), pin = String(m.pin || '');
      if (name.length < 2) return send(ws, { t: 'err', msg: 'Имя слишком короткое' });
      if (pin.length < 4) return send(ws, { t: 'err', msg: 'PIN — минимум 4 цифры' });
      if (findByName(name)) return send(ws, { t: 'err', msg: 'Такое имя уже занято' });
      const id = uid();
      const u = { id, role: 'student', name, pin: hash(pin), token: newToken(), stars: 0, avatar: null, createdAt: Date.now() };
      db.users[id] = u; saveSoon();
      authed = u;
      send(ws, { t: 'authok', token: u.token, user: authUser(u) });
      console.log(`регистрация ученика: ${name}`);
    }
    else if (m.t === 'regTeacher') { // заявка преподавателя = аккаунт в статусе pending
      const name = clean(m.name), pin = String(m.pin || '');
      if (name.length < 2) return send(ws, { t: 'err', msg: 'Имя слишком короткое' });
      if (pin.length < 6) return send(ws, { t: 'err', msg: 'PIN преподавателя — минимум 6 цифр' });
      if (findByName(name)) return send(ws, { t: 'err', msg: 'Такое имя уже занято' });
      const id = uid();
      const u = { id, role: 'teacher', status: 'pending', name, pin: hash(pin), token: newToken(),
        phone: clean(m.phone), about: String(m.about || '').slice(0, 300), createdAt: Date.now() };
      db.users[id] = u;
      db.leads.push({ kind: 'teacher', name, phone: u.phone, about: u.about, userId: id, ts: Date.now() });
      saveSoon();
      authed = u;
      send(ws, { t: 'authok', token: u.token, user: authUser(u) });
      console.log(`заявка преподавателя: ${name}`);   // телефон в лог не пишем
    }
    else if (m.t === 'login') {
      const key = failKey(ip, clean(m.name));
      const wait = lockedFor(key);
      if (wait) return send(ws, { t: 'err', msg: `Слишком много попыток. Подожди ${wait > 60 ? Math.ceil(wait / 60) + ' мин.' : wait + ' сек.'}` });
      const u = findByName(clean(m.name));
      if (!u || u.pin !== hash(String(m.pin || ''))) { noteFail(key); return send(ws, { t: 'err', msg: 'Неверное имя или PIN' }); }
      noteOk(key);
      u.token = u.token || newToken(); saveSoon();
      authed = u;
      send(ws, { t: 'authok', token: u.token, user: authUser(u) });
    }
    else if (m.t === 'auth') { // вход по сохранённому токену
      const u = Object.values(db.users).find(x => x.token && x.token === m.token);
      if (!u) return send(ws, { t: 'autherr' });
      authed = u;
      send(ws, { t: 'authok', token: u.token, user: authUser(u) });
    }
    else if (m.t === 'lead') { // стойка «Хочу учиться»
      const name = clean(m.name), phone = clean(m.phone);
      if (!name || phone.length < 5) return send(ws, { t: 'err', msg: 'Укажите имя и телефон' });
      db.leads.push({ kind: 'student', name, phone, ts: Date.now() });
      saveSoon();
      send(ws, { t: 'leadok' });
      console.log(`заявка ученика: ${name}`);          // телефон в лог не пишем
    }

    // ---------- админ (владелец) ----------
    else if (m.t === 'adminList') {
      if (!authed || authed.role !== 'owner') return;
      const teachers = Object.values(db.users).filter(u => u.role === 'teacher')
        .map(u => ({ id: u.id, name: u.name, status: u.status, code: u.code || null, phone: u.phone || '', about: u.about || '' }));
      const students = Object.values(db.users).filter(u => u.role === 'student').length;
      send(ws, { t: 'adminData', teachers, leads: db.leads.slice(-50).reverse(), students });
    }
    else if (m.t === 'activate') {
      if (!authed || authed.role !== 'owner') return;
      const u = db.users[m.id];
      if (!u || u.role !== 'teacher') return;
      u.status = 'active';
      if (!u.code) {
        u.code = makeCode();
        db.classes[u.code] = { teacherId: u.id, seed: (Math.random() * 2147483647) | 0, edits: {}, words: [], createdAt: Date.now() };
      }
      saveSoon();
      console.log(`преподаватель ${u.name} активирован, класс ${u.code}`);
      send(ws, { t: 'adminData', teachers: Object.values(db.users).filter(x => x.role === 'teacher').map(x => ({ id: x.id, name: x.name, status: x.status, code: x.code || null, phone: x.phone || '', about: x.about || '' })), leads: db.leads.slice(-50).reverse(), students: Object.values(db.users).filter(x => x.role === 'student').length });
    }
    else if (m.t === 'blockTeacher') {
      if (!authed || authed.role !== 'owner') return;
      const u = db.users[m.id];
      if (!u || u.role !== 'teacher') return;
      u.status = 'blocked'; saveSoon();
      send(ws, { t: 'adminData', teachers: Object.values(db.users).filter(x => x.role === 'teacher').map(x => ({ id: x.id, name: x.name, status: x.status, code: x.code || null, phone: x.phone || '', about: x.about || '' })), leads: db.leads.slice(-50).reverse(), students: Object.values(db.users).filter(x => x.role === 'student').length });
    }

    // ---------- вход в миры ----------
    else if (m.t === 'enter' && !me) { // преподаватель входит в СВОЙ постоянный класс
      if (!authed || authed.role !== 'teacher' || authed.status !== 'active')
        return send(ws, { t: 'err', msg: 'Класс доступен только активным преподавателям' });
      room = getOrLoadRoom(authed.code);
      if (!room) return send(ws, { t: 'err', msg: 'Класс не найден — обратитесь к владельцу' });
      me = joinRoom(room, ws, authed.name, 'teacher', authed.id, null, { guestGarden, moveMe });
    }
    else if (m.t === 'create' && !me) { // гостевой (временный) класс — для демо
      const code = makeCode();
      room = newRoom(code, (Math.random() * 2147483647) | 0, false);
      rooms.set(code, room);
      me = joinRoom(room, ws, clean(m.name) || 'Teacher', 'teacher', authed && authed.id, null, { guestGarden, moveMe });
      console.log(`гостевой класс ${code} создан`);
    }
    else if (m.t === 'join' && !me) {
      const code = String(m.code || '').toUpperCase().trim();
      const r = getOrLoadRoom(code);
      if (!r) return send(ws, { t: 'err', msg: 'Класс не найден. Проверь код.' });
      if (r.clients.size >= 20) return send(ws, { t: 'err', msg: 'Класс заполнен (максимум 20).' });
      room = r;
      const name = (authed && authed.role === 'student') ? authed.name : (clean(m.name) || ('Ученик-' + nextId));
      me = joinRoom(room, ws, name, 'student', authed && authed.id, authed && authed.avatar, { guestGarden, moveMe });
    }
    else if (m.t === 'rooms') {   // портал спрашивает, куда сейчас можно улететь
      return send(ws, { t: 'rooms', list: liveRooms(room && room.code) });
    }
    else if (m.t === 'switch') { // переход между мирами (лобби ↔ классы) в одном соединении
      const code = String(m.code || '').toUpperCase().trim();
      const target = getOrLoadRoom(code);
      if (!target) return send(ws, { t: 'err', msg: 'Мир не найден' });
      if (target.clients.size >= 30) return send(ws, { t: 'err', msg: 'Мир переполнен' });
      if (room && me) {
        room.clients.delete(me.id);
        bcast(room, { t: 'del', id: me.id });
        // Комнату выбрасываем из списка, только если уходим НЕ в неё же. Иначе последний
        // игрок «переходом в самого себя» удалял комнату, оставался в её осиротевшей копии,
        // а следующий вошедший получал новый экземпляр — и игроки переставали видеть друг друга.
        if (room !== target && room.clients.size === 0) { persistRoom(room); rooms.delete(room.code); }
      }
      room = target;
      let role = 'student', name = clean(m.name) || ('Гость-' + nextId);
      if (authed) {
        name = authed.name;
        if (authed.role === 'teacher' && authed.status === 'active' && authed.code === room.code) role = 'teacher';
        if (authed.role === 'owner') role = 'teacher'; // владелец может строить и вести везде
      }
      me = joinRoom(room, ws, name, role, authed && authed.id, authed && authed.avatar, { guestGarden, moveMe });
    }
    else if (m.t === 'party') { // групповой старт: всех, кто стоит в зоне сбора, уводим в отдельный мир
      if (!me || !room || room.code !== 'LOBBY') return;
      const x0 = Math.min(m.x0 | 0, m.x1 | 0), x1 = Math.max(m.x0 | 0, m.x1 | 0);
      const z0 = Math.min(m.z0 | 0, m.z1 | 0), z1 = Math.max(m.z0 | 0, m.z1 | 0);
      if (x1 - x0 > 14 || z1 - z0 > 14) return; // защита от «зоны во всё лобби»
      const inside = c => c.x >= x0 - 0.5 && c.x <= x1 + 1.5 && c.z >= z0 - 0.5 && c.z <= z1 + 1.5;
      if (!inside(me)) return send(ws, { t: 'err', msg: 'Встань внутрь зоны сбора' });
      const members = [...room.clients.values()].filter(inside).slice(0, 20);
      const code = makeCode();
      const target = newRoom(code, (Math.random() * 2147483647) | 0, false); // временный мир на одно занятие
      target.kind = 'garden'; // улица огородов: у каждого участника свой участок
      rooms.set(code, target);
      console.log(`групповой старт → ${code}: ${members.map(c => c.name).join(', ')}`);
      for (const c of members) {
        // роль берём из аккаунта: в лобби преподаватель ходит как обычный игрок
        const u = c.userId && db.users[c.userId];
        const isTeacher = !!u && ((u.role === 'teacher' && u.status === 'active') || u.role === 'owner');
        if (c.moveMe) c.moveMe(target, isTeacher ? 'teacher' : 'student');
      }
    }
    else if (m.t === 'setAvatar') {
      const ava = sanitizeAva(m.ava);
      if (me) { me.ava = ava; bcast(room, { t: 'look', id: me.id, ava }); }   // соседи видят смену сразу
      send(ws, { t: 'avaOk', ava });
      if (!authed) return;                       // гостю внешность тоже меняем, но хранить негде
      authed.avatar = ava; saveSoon();
      send(ws, { t: 'authok', token: authed.token, user: authUser(authed) });
    }
    else if (m.t === 'schedule') {
      if (!authed || authed.role !== 'teacher') return;
      authed.schedule = String(m.text || '').slice(0, 500); saveSoon();
      send(ws, { t: 'scheduleok' });
    }
    else if (m.t === 'wordday') {
      if (!authed) return send(ws, { t: 'err', msg: 'Войди в аккаунт, чтобы получать звёзды' });
      if (String(m.word || '').toLowerCase() !== dayWord().word) return;
      if (authed.lastWordday === today()) return send(ws, { t: 'err', msg: 'Слово дня уже получено — приходи завтра!' });
      authed.lastWordday = today();
      authed.stars = (authed.stars || 0) + 1;
      saveSoon();
      send(ws, { t: 'worddayok', stars: authed.stars });
    }

    // ---------- внутри комнаты ----------
    else if (!room || !me) return;
    else if (m.t === 'move') {
      me.x = +m.x || 0; me.y = +m.y || 0; me.z = +m.z || 0; me.yaw = +m.yaw || 0; me.pitch = +m.pitch || 0;
      bcast(room, { t: 'move', id: me.id, x: me.x, y: me.y, z: me.z, yaw: me.yaw, pitch: me.pitch }, me.id);
    }
    else if (m.t === 'block') {
      const x = m.x | 0, y = m.y | 0, z = m.z | 0, id = m.id | 0;
      if (x < 0 || x > 127 || y < 1 || y > 63 || z < 0 || z > 127) return;
      if (id < 0 || id > 23 || id === 7) return; // 11..23 — цветные блоки учебных объектов
      // в лобби строить можно только в песочнице (x>=100) или владельцу
      if (room.code === 'LOBBY' && me.role !== 'teacher' && x < 100) return;
      room.edits.set(`${x},${y},${z}`, id);
      bcast(room, { t: 'block', x, y, z, id }, me.id);
      persistRoom(room);
    }
    else if (m.t === 'garden') { // 🌱 сад: семя-тема → грядка растёт сама → урожай собирают голосом
      const u = authed ? db.users[authed.id] : null;
      if (authed && !u) return send(ws, { t: 'err', msg: 'Твой аккаунт не найден — перезайди' });
      if (u) { migrateTrees(u); u.garden = u.garden || newGarden(); }
      const g = u ? u.garden : guestGarden;
      // отказ никогда не молчит: игрок должен видеть причину, а не гадать
      const deny = (why) => { send(ws, { t: 'err', msg: why }); send(ws, { t: 'gardenDeny', act: String(m.act || ''), bed: m.bed | 0, why }); };
      const reply = (extra) => {
        grantStarter(g); // пустому саду — стартовые семена; после restore, иначе подарок затрётся
        ripenGarden(g);
        const bev = bossTick(g);      // босс топчет грядки, пока идёт бой
        if (bev && bev.length) extra = Object.assign({ bossEvents: bev }, extra || {});
        send(ws, Object.assign({ t: 'gardenData', garden: g, tiers: TIERS, priceStep: 0.12, nextUp: hintNext(g),
          shopWords: shopWords(g), bosses: BOSSES, weapons: WEAPONS, bossWords: g.boss ? bossWords(g) : null,
          bossNeed: { have: distinctPlanted(g), need: bossNeedPlants(g.bossDone), next: g.bossDone,
                      days: activeDays(g), needDays: bossNeedDays(g.bossDone) },
          bag: bagList(g),
          near: room ? [...room.clients.values()].filter(c => c.id !== me.id
                  && Math.hypot((c.x || 0) - (me.x || 0), (c.z || 0) - (me.z || 0)) <= 12)
                  .map(c => ({ id: c.id, name: c.name })) : [],
          stars: u ? (u.stars || 0) : guestStars, guest: !u, now: Date.now() }, extra || {}));
        if (u) saveSoon();
        bcastPlots(room); // соседи по улице видят чужие грядки
      };
      if (m.act === 'get') return reply();
      if (m.act === 'restore') { // гость вернулся — поднимаем сад из его браузера
        if (u) return reply();
        const src = sanitizeGarden(m.garden);
        guestGarden.beds = src.beds; guestGarden.coins = src.coins;
        guestGarden.seeds = src.seeds; guestGarden.basket = src.basket; guestGarden.done = src.done;
        guestGarden.open = src.open; guestGarden.crops = src.crops; guestGarden.gifted = src.gifted;
        guestGarden.openW = src.openW; guestGarden.cropsW = src.cropsW; guestGarden.freeSeed = src.freeSeed;
        guestGarden.bossDone = src.bossDone; guestGarden.weapon = src.weapon;
        guestGarden.pets = src.pets; guestGarden.sinceBoss = src.sinceBoss;
        guestGarden.items = src.items; guestGarden.soldOnce = src.soldOnce;
        guestGarden.days = src.days;
        return reply();
      }
      if (m.act === 'buy') { // семя из киоска: сперва по одному слову, тема целиком — позже
        const raw = String(m.lesson || '');
        const ws = parseSeed(raw);
        if (ws) {                                   // семя одного слова
          const lesson = loadLesson(ws.lesson);
          if (!lesson) return deny(`Урок «${ws.lesson}» не найден на сервере`);
          if (wordIndex(lesson, ws.word) < 0) return deny(`Слова «${ws.word}» нет в этой теме`);
          if (!g.openW[raw]) return deny(`Эти семена сейчас недоступны — собери урожай попроще, и они появятся`);
          const price = (g.freeSeed === raw) ? 0 : wordSeedPrice(lesson, ws.word);
          if (g.coins < price) return deny(`Не хватает ${price - g.coins} 🪙 — сдай плоды в лавку`);
          g.coins -= price;
          if (g.freeSeed === raw) g.freeSeed = '';        // подарок одноразовый
          g.seeds[raw] = (g.seeds[raw] | 0) + 1;
          logAct(room, me, `взял семя «${ws.word}»`, 'buy');
          return reply({ bought: raw });
        }
        const lesson = loadLesson(raw);
        if (!lesson) return deny(`Урок «${raw || '—'}» не найден на сервере`);
        const price = seedPrice(lesson);
        if (!g.open[lesson.id]) return deny(`Эти семена сейчас недоступны — собери тему по словам, и набор появится`);
        if (g.coins < price) return deny(`Не хватает ${price - g.coins} 🪙 — сдай плоды в лавку`);
        g.coins -= price;
        g.seeds[lesson.id] = (g.seeds[lesson.id] | 0) + 1;
        return reply({ bought: lesson.id });
      }
      if (m.act === 'bossMove') {       // клиент сообщает, где игрок; сервер водит босса и решает урон
        if (!g.boss) return;
        const st = g.boss, B = BOSSES[st.i], mv = BOSS_MOVE[B.move] || BOSS_MOVE.walk;
        const px = +m.x || 0, pz = +m.z || 0;
        const now = Date.now();
        const dt = Math.min(1.5, Math.max(0, (now - (st.tick || now)) / 1000));
        st.tick = now;
        st.px = px; st.pz = pz;                    // помним игрока: киркой достанем только вблизи
        if (st.stage === 'stun' && now > st.until) { st.stage = 'rage'; st.meter = 0; }
        if (st.x === null) { st.x = px + 7; st.z = pz + 7; }          // появляется поодаль
        const dx = px - st.x, dz = pz - st.z, d = Math.hypot(dx, dz) || 1;
        const stunned = st.stage === 'stun';
        const slowK = stunned ? 0 : (now < st.slowUntil ? 0.35 : 1);   // оглушён — стоит, ушиблен — ползёт
        if (d > mv.reach * 0.8 && slowK > 0) {                         // догоняет
          const step = Math.min(d, mv.sp * slowK * dt);
          st.x += dx / d * step; st.z += dz / d * step;
        }
        const ev = [];
        if (!stunned && d <= mv.reach && now >= st.cd) {                // достал — бьёт
          st.cd = now + mv.every;
          st.php = Math.max(0, (st.php | 0) - 1);
          ev.push({ t: 'hit', how: BOSS_ATTACK[st.i] || 'бьёт', php: st.php });
          if (!st.php) {
            const r = bossLose(g);
            logAct(room, me, `проиграл боссу ${B.emoji} ${B.name}`, 'boss');
            return reply({ bossLost: { boss: B.name, emoji: B.emoji, plant: r.plant } });
          }
        }
        return reply({ bossAt: { x: +st.x.toFixed(2), z: +st.z.toFixed(2), d: +d.toFixed(1),
                                 php: st.php, pmax: st.pmax, reach: mv.reach,
                                 stage: st.stage, left: Math.max(0, st.need - st.meter),
                                 need: st.need, stunLeft: stunned ? Math.max(0, st.until - now) : 0,
                                 slow: !stunned && now < st.slowUntil }, bossEv: ev });
      }
      if (m.act === 'bossHit') {          // кирка: урона мало, зато босс вязнет и слабеет
        if (!g.boss) return deny('Сейчас никакого босса нет');
        const st = g.boss, B = BOSSES[st.i], wp = weaponOf(g);
        if (st.stage === 'stun') return reply({ bossHit: { already: true } });
        const mv = BOSS_MOVE[B.move] || BOSS_MOVE.walk;
        if (st.x !== null && st.px !== null) {   // киркой достаём только вплотную
          const d = Math.hypot(st.px - st.x, st.pz - st.z);
          if (d > mv.reach + 1.6) return reply({ bossHit: { tooFar: true, d: +d.toFixed(1) } });
        }
        st.meter += 1;
        st.slowUntil = Date.now() + SLOW_MS;      // ударил — босс замедлился
        const light = Math.max(1, Math.round(st.max * 0.004 * (wp.power + artBonus(g, 'hit'))));
        st.hp = Math.max(0, st.hp - light);
        if (st.meter >= st.need) { st.stage = 'stun'; st.until = Date.now() + STUN_MS; }
        if (st.hp <= 0) return reply({ bossWin: bossReward(g) });
        return reply({ bossHit: { dmg: light, stage: st.stage, slow: true,
                                  left: Math.max(0, st.need - st.meter) } });
      }
      if (m.act === 'bossWord') {        // главный урон — произнесённое слово
        if (!g.boss) return deny('Сейчас никакого босса нет');
        const st = g.boss, B = BOSSES[st.i], wp = weaponOf(g);
        const word = String(m.word || '').toLowerCase();
        if (!bossWords(g).includes(word)) return deny(`«${word}» ты ещё не выращивал — говори свои слова`);
        const weak = st.stage === 'stun';          // главный урон — по ослабевшему
        const crit = weak && (st.until - Date.now()) > STUN_MS - CRIT_MS;   // успел сразу — супер-удар
        const base = weak ? wordShare(st.i) * (crit ? CRIT_X : 1) : WORD_FAR;
        const dmg = Math.max(1, Math.round(st.max * base * (1 + wp.power / 12) * (1 + artBonus(g, 'word'))));
        st.hp = Math.max(0, st.hp - dmg);
        // оглушение не тратится с первого слова: пока он лежит, можно ударить словом несколько раз —
        // иначе на каждого босса пришлось бы по десятку подходов вплотную, и жизней не хватит
        // добивающий удар — тоже удар: цифру урона и «супер» игрок должен увидеть,
        // иначе самый приятный момент проходит вообще без отклика
        const shot = { word, dmg, hp: st.hp, weak, crit };
        if (st.hp <= 0) { const r = bossReward(g); logAct(room, me, `победил босса ${r.emoji} ${r.boss}! 🏆`, 'win');
                          return reply({ bossWin: r, bossDmg: shot }); }
        return reply({ bossDmg: shot });
      }
      if (m.act === 'bossFlee') {        // сбежать: босс уходит, но грядки уже потоптаны
        if (!g.boss) return deny('Сейчас никакого босса нет');
        g.boss = null; g.sinceBoss = 0;
        return reply({ bossFled: true });
      }
      if (m.act === 'buyWeapon') {
        const id = m.id | 0, w = WEAPONS[id];
        if (!w) return deny('Такого оружия нет');
        if (id <= (g.weapon | 0)) return deny('Это оружие у тебя уже есть');
        if (id > (g.weapon | 0) + 1) return deny('Сначала купи или выиграй предыдущее');
        if (g.coins < w.price) return deny(`Не хватает ${w.price - g.coins} 🪙`);
        g.coins -= w.price; g.weapon = id;
        return reply({ gotWeapon: w });
      }
      if (m.act === 'gift') {          // отдать вещь соседу — так старшие бустят новичков
        const toId = m.to | 0, id = String(m.item || '');
        const other = room && [...room.clients.values()].find(c => c.id === toId);
        if (!other) return deny('Этого игрока нет рядом');
        const d = Math.hypot((other.x || 0) - (me.x || 0), (other.z || 0) - (me.z || 0));
        if (d > 12) return deny(`${other.name} слишком далеко — подойди ближе`);
        const og = gardenOf(other);
        if (!og) return deny('У этого игрока ещё нет сада');
        let label = '';
        if (parseSeed(id) || loadLesson(id)) {                 // семя
          if (!(g.seeds[id] > 0)) return deny('Такого семени у тебя нет');
          g.seeds[id]--; if (!g.seeds[id]) delete g.seeds[id];
          og.seeds[id] = (og.seeds[id] | 0) + 1;
          og.openW[id] = 1;                                    // подарили — значит уже можно сажать
          const ws = parseSeed(id); label = ws ? ws.word : id;
        } else {
          const a = artById(id);
          if (!a) return deny('Такой вещи не существует');
          if (!bagTake(g, id, 1)) return deny('Такой вещи у тебя нет');
          bagAdd(og, id, 1);
          label = a.name;
        }
        if (other.ws) send(other.ws, { t: 'gifted', from: me.name, item: label });
        console.log(`подарок: ${me.name} → ${other.name}: ${label}`);
        return reply({ gaveTo: other.name, gave: label });
      }
      if (m.act === 'reset') {   // начать сад заново — для проверки первых шагов и для новых учеников
        const fresh = newGarden();
        for (const k of Object.keys(g)) delete g[k];
        Object.assign(g, fresh);
        grantStarter(g);
        console.log(`сад обнулён: ${u ? u.name : 'гость'}`);
        return reply({ reset: true });
      }
      if (m.act === 'phrase') {        // подошёл к станции: показываем её заказ
        const kind = talkKind(m.kind);
        const card = orderCard(g);
        if (!card || card.kind !== kind) {
          // у этой станции сейчас заказа нет — и придумывать бесконечные фразы не надо
          const mine = card ? ORDER_KINDS.indexOf(card.kind) : -1;
          return reply({ order: null, orderKind: kind,
            orderWhere: card ? card.kind : '', orderTheme: card ? card.theme : '' });
        }
        let t = null;
        if (!card.sayDone) {
          t = phraseTask(g, kind);
          if (t) { g.phraseNow = t.lesson + '#' + t.word; g.phraseKind = t.kind; }
        }
        return reply({ order: card, phrase: t });
      }
      if (m.act === 'orderGive') {     // сдать плоды в заказ
        const card = orderCard(g);
        if (!card) return deny('Заказа сейчас нет');
        if (card.bringDone) return deny('Плоды уже сданы — осталось сказать фразы');
        const r = orderGive(g);
        if (!r.moved) return deny('В корзине нет нужных плодов — собери урожай этой темы');
        logAct(room, me, `сдал ${r.moved} плодов в заказ 📦`, 'sell');
        return reply({ orderGave: r.moved, order: orderCard(g) });
      }
      if (m.act === 'orderTake') {     // забрать приз
        const card = orderCard(g);
        if (!card) return deny('Заказа сейчас нет');
        if (!card.ready) return deny('Заказ ещё не готов');
        const res = orderFinish(g);
        if (u) u.stars = (u.stars || 0) + 5; else guestStars += 5;
        markDay(g);
        logAct(room, me, `выполнил заказ «${res.theme}» 🏆`, 'win');
        console.log(`заказ выполнен: ${u ? u.name : 'гость'} — ${res.theme} (+${res.prize})`);
        return reply({ orderDone: res, opened: res.opened });
      }
      if (m.act === 'phraseSaid') {    // ребёнок произнёс фразу — проверяем и платим
        const key = String(m.key || g.phraseNow || '');
        const kind = talkKind(m.kind || g.phraseKind);
        const ws = parseSeed(key);
        if (!ws) return deny('Задание не выдано');
        const les = loadLesson(ws.lesson), tpl = les && phraseTemplate(les, kind);
        if (!tpl) return deny('Для этой темы фразы ещё нет');
        const parts = tpl.parts.slice();
        if (tpl.slot >= 0) parts[tpl.slot] = ws.word;
        const said = String(m.said || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
        const strip = w => w.endsWith('s') ? w.slice(0, -1) : w;
        const toks = said.map(strip);
        // фраза принимается, когда все слова шаблона прозвучали в правильном порядке
        let pos = 0, ok = true;
        for (const need of parts.map(x => strip(String(x).toLowerCase()))) {
          const i = toks.indexOf(need, pos);
          if (i < 0) { ok = false; break; }
          pos = i + 1;
        }
        if (!ok) return reply({ phraseMiss: { text: parts.join(' '), heard: String(m.said || '') } });
        if (!g.order || g.order.kind !== kind) return deny('Заказа на этой станции сейчас нет');
        g.said = g.said || {};
        const sk = saidKey(kind, ws.lesson, ws.word);
        const pay = phrasePay(les, g, sk, kind);
        g.said[sk] = (g.said[sk] | 0) + 1;
        g.phrases = (g.phrases | 0) + 1;
        g.coins += pay;
        if (u) u.stars = (u.stars || 0) + 2; else guestStars += 2;
        markDay(g);
        logAct(room, me, `сказал фразу «${parts.join(' ')}» 🗣`, 'say');
        console.log(`фраза: ${u ? u.name : 'гость'} — ${parts.join(' ')} (+${pay})`);
        g.order.said = (g.order.said | 0) + 1;
        const card = orderCard(g);
        const more = card.sayDone ? null : phraseTask(g, kind);
        if (more) { g.phraseNow = more.lesson + '#' + more.word; g.phraseKind = kind; }
        return reply({ phraseOk: { text: parts.join(' '), pay, total: g.phrases | 0,
                                   reply: tpl.reply || '' }, order: card, phrase: more });
      }
      if (m.act === 'sell') { // лавка плодов: корзина превращается в монеты
        let coins = 0, fruits = 0;
        for (const [id, n] of Object.entries(g.basket)) {
          const lesson = loadLesson(id);
          if (!lesson || !(n > 0)) continue;
          coins += fruitPrice(lesson) * n; fruits += n;
        }
        if (!fruits) return deny('Корзина пуста — сначала собери урожай');
        g.basket = {}; g.coins += coins; g.soldOnce = 1;   // первый круг замкнут — с этого дня возможны боссы
        console.log(`продано плодов: ${u ? u.name : 'гость'} — ${fruits} шт. за ${coins} монет`);
        logAct(room, me, `продал ${fruits} плодов за ${coins} 🪙`, 'sell');
        return reply({ sold: { fruits, coins } });
      }
      const bed = String(m.bed | 0);
      if (+bed < 0 || +bed >= BEDS_MAX) return deny(`Грядка №${bed} вне участка`);
      const b = g.beds[bed];
      if (m.act === 'plant') {
        const raw = String(m.lesson || ''), ws = parseSeed(raw);
        const lesson = loadLesson(ws ? ws.lesson : raw);
        if (!lesson) return deny(`Урок «${raw || '—'}» не найден на сервере`);
        const label = ws ? ws.word : (lesson.theme || lesson.title);
        if (!(g.seeds[raw] > 0)) return deny(`Семени «${label}» нет в сумке — возьми в киоске 🏪`);
        const words = ws ? (lesson.words || []).filter(w => w.word === ws.word) : lesson.words;
        if (!words.length) return deny(`Слова «${label}» нет в этой теме`);
        // одно и то же слово можно посадить на нескольких грядках: больше кустов — больше повторений
        // на одной грядке помещается несколько растений — каждое своё слово
        if (b) {
          if (b.lesson !== lesson.id)
            return deny(`На этой грядке растёт «${b.theme || b.title}» — досаживай слова той же темы или выбери пустую`);
          if ((b.words || []).length >= BED_SLOTS)
            return deny(`Грядка полная: ${BED_SLOTS} кустов — посади на соседнюю`);
          g.seeds[raw]--;
          if (!g.seeds[raw]) delete g.seeds[raw];
          const word = words[0].word;
          const again = (b.words || []).some(w => w.word === word);
          b.words = b.words.concat(words);     // повторы разрешены: это ещё один куст того же слова
          b.theme = bedKinds(b).length > 1 ? (lesson.theme || lesson.title) : b.theme;
          b.st = b.st || {};
          if (again) {                          // ещё один куст: урожай станет больше и придёт скорее
            const st = plantState(b, word);
            st.k = (st.k | 0 || 1) + 1;
            st.r = Math.min(st.r, Date.now() + growMs(0, g, raw));
          } else {
            b.st[word] = { c: 0, r: Date.now() + growMs(0, g, raw), n: 0, k: 1 };  // новое растение зреет быстро
          }
          console.log(`досажено: ${u ? u.name : 'гость'} — ${raw} на грядку ${bed} (${b.words.length} кустов)`);
          logAct(room, me, `досадил «${label}» — на грядке ${b.words.length}`, 'plant');
        } else {
          g.seeds[raw]--;
          if (!g.seeds[raw]) delete g.seeds[raw];
          g.beds[bed] = { seed: raw, lesson: lesson.id, title: lesson.title,
            theme: ws ? ws.word : lesson.theme, tier: lesson.tier,
            words, ripe: [], cycle: 0, readyAt: Date.now() + growMs(0, g, raw) };
        markDay(g);
          console.log(`посажено: ${u ? u.name : 'гость'} — ${raw} на грядку ${bed}`);
          logAct(room, me, `посадил «${label}»`, 'plant');
        }
        // следующее семя появляется в киоске сразу после посадки предыдущего:
        // деньгами прыгнуть вперёд нельзя — нужно именно посадить
        const opened = ws ? unlockNextWord(g, lesson.id, ws.word) : [];
        let bossCame = null;
        if (bossCanCome(g)) { bossCame = bossSpawn(g); g.sinceBoss = 0;
          console.log(`пришёл босс: ${u ? u.name : 'гость'} — ${bossCame.name}`); }
        return reply({ planted: raw,
          opened: opened.map(x => ({ id: x.id, theme: x.theme, level: x.level })),
          bossCame: bossCame ? { i: g.boss.i, name: bossCame.name, emoji: bossCame.emoji } : null });
      } else if (m.act === 'uproot') { // выкорчевать куст: место освобождается под новое слово
        if (!b) return deny('На этой грядке ничего не растёт');
        const word = String(m.word || '').toLowerCase();
        const all = !!m.all;
        const idx = (b.words || []).map(w => w.word).lastIndexOf(word);
        if (idx < 0) return deny(`«${word}» на этой грядке не растёт`);
        const st = plantState(b, word);
        const gone = all ? (st.k | 0 || 1) : 1;
        if (all) b.words = b.words.filter(w => w.word !== word);
        else b.words = b.words.slice(0, idx).concat(b.words.slice(idx + 1));
        st.k = (st.k | 0 || 1) - gone;
        if (st.k <= 0) { delete b.st[word]; }
        else st.n = Math.min(st.n | 0, bedFruits(b, word, st.c) * st.k);
        if (!b.words.length) { delete g.beds[bed]; }           // грядка опустела — она снова свободна
        else { ripenGarden(g); b.theme = bedKinds(b).length > 1 ? (b.title || b.theme) : b.theme; }
        console.log(`выкорчевано: ${u ? u.name : 'гость'} — ${word}${all ? ' (все)' : ''} с грядки ${bed}`);
        logAct(room, me, `убрал «${word}» с грядки`, 'plant');
        return reply({ uprooted: { word, n: gone, bed: +bed } });
      } else if (m.act === 'pick') { // собрал плод, назвав слово
        if (!b) return deny('На этой грядке ничего не растёт');
        ripenGarden(g);
        if (!b.ripe.length) {
          const sec = Math.max(1, Math.ceil((b.readyAt - Date.now()) / 1000));
          return deny(sec < 90 ? `Урожай ещё не созрел — осталось ${sec} с`
                               : `Этот куст на повторении — вернись через ${Math.round(sec / 60)} мин`);
        }
        const word = String(m.word || '').toLowerCase();
        const at = b.ripe.indexOf(word);
        if (at < 0) return deny(`«${word}» тут не растёт. Осталось: ${[...new Set(b.ripe)].join(', ')}`);
        b.ripe.splice(at, 1);
        logAct(room, me, `сказал «${word}» ✅`, 'say');
        markDay(g);
        const pst = plantState(b, word);
        pst.n = Math.max(0, (pst.n | 0) - 1);
        g.basket[b.lesson] = (g.basket[b.lesson] | 0) + 1;
        if (u) u.stars = (u.stars || 0) + 1; else guestStars += 1;
        if (!pst.n) {   // этот куст обобран — он один и уходит на следующий круг
          pst.c++;
          pst.r = Date.now() + growMs(pst.c, g, wordSeedId(b.lesson, word));
          b.cycle = Math.min(...bedKinds(b).map(w => b.st[w].c));
          g.done[String(b.tier)] = (g.done[String(b.tier)] | 0) + 1;
          const wordSeed = parseSeed(String(b.seed || ''));
          const sid = wordSeed ? wordSeedId(b.lesson, word) : null;
          let spare = null;
          if (sid) {
            g.cropsW[sid] = (g.cropsW[sid] | 0) + 1;
            if (g.cropsW[sid] % 3 === 0) {          // каждый третий сбор — запасное семя
              g.seeds[sid] = (g.seeds[sid] | 0) + 1;
              spare = { id: sid, word };
            }
          }
          else g.crops[b.lesson] = (g.crops[b.lesson] | 0) + 1;
          const opened = sid ? unlockAfterWord(g, b.lesson, word) : unlockAfter(g, b.lesson);
          g.sinceBoss = (g.sinceBoss | 0) + 1;
          let bossCame = null;
          if (bossCanCome(g)) {
            bossCame = bossSpawn(g); g.sinceBoss = 0;
            console.log(`пришёл босс: ${u ? u.name : 'гость'} — ${bossCame.name}`);
            logAct(room, me, `бьётся с боссом ${bossCame.emoji} ${bossCame.name}`, 'boss');
          }
          console.log(`куст собран: ${u ? u.name : 'гость'} — ${b.lesson}/${word}, круг ${pst.c}`);
          logAct(room, me, `собрал куст «${word}» целиком`, 'done');
          return reply({ harvested: { lesson: b.lesson, theme: word, count: 1, cycle: pst.c }, spare,
            bossCame: bossCame ? { i: g.boss.i, name: bossCame.name, emoji: bossCame.emoji } : null,
            opened: opened.map(x => ({ id: x.id, theme: x.theme || x.title, level: x.level })) });
        }
      } else if (m.act === 'clear') { // выкорчевать, чтобы посадить другое
        if (!b) return deny('Грядка и так пустая');
        delete g.beds[bed];
      } else return deny(`Сервер не знает действия «${String(m.act || '')}»`);
      reply();
    }
    else if (m.t === 'lesson') { // учитель запускает/завершает урок по программе
      if (me.role !== 'teacher') return;
      room.lesson = m.id ? { id: m.id, stage: 0 } : null;
      bcast(room, { t: 'lesson', lesson: room.lesson }, me.id);
    }
    else if (m.t === 'stage') {
      if (me.role !== 'teacher' || !room.lesson) return;
      room.lesson.stage = m.n | 0;
      bcast(room, { t: 'stage', n: room.lesson.stage }, me.id);
    }
    else if (m.t === 'markDone') { // учитель зачитывает вручную (role-play и т.п.)
      if (me.role !== 'teacher' || !room.task) return;
      const target = room.clients.get(m.id | 0);
      if (!target || room.dones.has(target.id)) return;
      room.dones.set(target.id, target.name);
      const tAuthed = target.userId ? db.users[target.userId] : null;
      creditStudent(room, tAuthed, 1, 0);
      bcast(room, { t: 'done', id: target.id, name: target.name });
      checkFinale(room);
    }
    else if (m.t === 'crm') { // CRM класса для учителя
      if (me.role !== 'teacher' || !room.persistent || room.code === 'LOBBY') return;
      const cls = db.classes[room.code] || {};
      const students = Object.entries(cls.students || {}).map(([uidKey, s]) => ({
        name: s.name, visits: s.visits, words: s.words, stars: s.stars,
        totalStars: (db.users[uidKey] && db.users[uidKey].stars) || 0,
        lastSeen: s.lastSeen || 0,
      }));
      send(ws, { t: 'crmData', students });
    }
    else if (m.t === 'task') {
      if (me.role !== 'teacher') return;
      room.task = m.task || null;
      room.dones = new Map();
      bcast(room, { t: 'task', task: room.task }, me.id);
    }
    else if (m.t === 'done') {
      if (!room.task || room.dones.has(me.id)) return;
      room.dones.set(me.id, me.name);
      creditStudent(room, authed, 1, 1);
      bcast(room, { t: 'done', id: me.id, name: me.name }, me.id);
      checkFinale(room);
    }
    else if (m.t === 'words') {
      if (me.role !== 'teacher') return;
      room.words = Array.isArray(m.stations) ? m.stations.slice(0, 12) : [];
      bcast(room, { t: 'words', stations: room.words }, me.id);
      persistRoom(room);
    }
    else if (m.t === 'voice') {
      me.voiceOn = !!m.on;
      bcast(room, { t: 'voice', id: me.id, on: me.voiceOn }, me.id);
    }
    else if (m.t === 'talk') {
      bcast(room, { t: 'talk', id: me.id, on: !!m.on }, me.id);
    }
    else if (m.t === 'race') {
      if (me.role !== 'teacher') return;
      for (const c of room.clients.values()) c.raceGot = new Set();
      room.race = m.words ? { words: m.words.slice(0, 12), done: [] } : null;
      bcast(room, { t: 'race', words: room.race ? room.race.words : null }, me.id);
    }
    else if (m.t === 'rgot') {
      if (!room.race) return;
      const w = String(m.word || '');
      if (!room.race.words.some(x => x.word === w)) return;
      me.raceGot = me.raceGot || new Set();
      if (me.raceGot.has(w)) return;
      me.raceGot.add(w);
      let rank = 0;
      if (me.raceGot.size === room.race.words.length) {
        room.race.done.push(me.id);
        rank = room.race.done.length;
        creditStudent(room, authed, 3, 0);
      } else {
        creditStudent(room, authed, 0, 1); // слово произнесено — в копилку слов
      }
      bcast(room, { t: 'rgot', id: me.id, word: w, count: me.raceGot.size, rank });
    }
    else if (m.t === 'rtc') {
      const dest = room.clients.get(m.to | 0);
      if (dest) send(dest.ws, { t: 'rtc', from: me.id, data: m.data });
    }
  };
  ws.on('message', data => {            // сбой в одном сообщении не должен уносить мир всех остальных
    try { onMessage(data); }
    catch (e) {
      console.error('ошибка при обработке сообщения:', (e && e.stack) || e);
      try { send(ws, { t: 'err', msg: 'Что-то пошло не так — попробуй ещё раз' }); } catch (_) {}
    }
  });

  ws.on('close', () => {
    if (!room || !me) return;
    room.clients.delete(me.id);
    bcast(room, { t: 'del', id: me.id });
    if (room.clients.size === 0) {
      persistRoom(room);
      rooms.delete(room.code);
      console.log(`комната ${room.code} выгружена${room.persistent ? ' (сохранена)' : ''}`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Pixel English server: http://localhost:${PORT} · сборка ${BUILD}`);
  console.log(PUBLIC ? 'режим: ОТКРЫТ В ИНТЕРНЕТ' : 'режим: локальный (PUBLIC=1 — для публикации)');
});
