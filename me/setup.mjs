// Готовит аккаунты для тестов и печатает их последней строкой как JSON:
//   {"studentToken":"…","teacherToken":"…","code":"ABCD"}
// Нужен тестам, которые входят не гостем: ученик, преподаватель и его постоянный класс.
// Класс выдаёт только владелец, поэтому здесь же заходим админом и активируем преподавателя.
import { WebSocket } from 'ws';
const URL = process.env.ME_URL || 'ws://127.0.0.1:8642';
const PIN = process.env.ADMIN_PIN || '2468';
const tag = Math.random().toString(36).slice(2, 8);

function talk(steps) {           // steps: [{send, want}] — шлём и ждём нужный ответ
  return new Promise((res, rej) => {
    const ws = new WebSocket(URL);
    const got = [];
    let i = 0;
    const to = setTimeout(() => { try { ws.close(); } catch (_) {} rej(new Error('setup: сервер молчит')); }, 15000);
    const step = () => {
      if (i >= steps.length) { clearTimeout(to); try { ws.close(); } catch (_) {} return res(got); }
      ws.send(JSON.stringify(steps[i].send));
    };
    ws.on('open', step);
    ws.on('error', e => { clearTimeout(to); rej(e); });
    ws.on('message', raw => {
      let m; try { m = JSON.parse(raw); } catch (_) { return; }
      if (m.t === 'err') { clearTimeout(to); try { ws.close(); } catch (_) {} return rej(new Error('setup: ' + m.msg)); }
      if (m.t !== steps[i].want) return;
      got.push(m); i++; step();
    });
  });
}

const [stu] = await talk([{ send: { t: 'reg', name: 'Учен' + tag, pin: '1234' }, want: 'authok' }]);
const [tea] = await talk([{ send: { t: 'regTeacher', name: 'Препод' + tag, pin: '123456', phone: '', about: 'тест' }, want: 'authok' }]);
const [, adm] = await talk([
  { send: { t: 'login', name: 'admin', pin: PIN }, want: 'authok' },
  { send: { t: 'activate', id: tea.user.id }, want: 'adminData' },
]);
const mine = (adm.teachers || []).find(t => t.id === tea.user.id);
if (!mine || !mine.code) throw new Error('setup: класс преподавателю не выдан');
console.log(JSON.stringify({ studentToken: stu.token, teacherToken: tea.token, code: mine.code }));
