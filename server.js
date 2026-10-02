// Сервер для Railway: запускает бота и мини-приложение.
// Сообщения из Telegram бот забирает сам (long polling), домен нужен только для мини-приложения.
// Данные хранятся в DATA_DIR (на Railway это подключённый Volume /data).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---------- проверки при старте ----------
const [maj, min] = process.versions.node.split('.').map(Number);
if (maj < 22 || (maj === 22 && min < 13)) {
  console.error(`❌ Нужна Node.js 22.13 или новее, а сейчас ${process.versions.node}. В Railway → Variables добавь RAILPACK_NODE_VERSION = 22 (или NIXPACKS_NODE_VERSION = 22) и перезапусти.`);
  process.exit(1);
}
const { DatabaseSync } = await import('node:sqlite');
const bot = (await import('./bot.js')).default;

const PORT = +process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.resolve('data'));
const PUBLIC_URL = (process.env.PUBLIC_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN : '')).trim().replace(/\/$/, '');
const BOT_TOKEN = (process.env.BOT_TOKEN || '').trim();
const OWNER_ID = (process.env.OWNER_ID || '').trim();
const TG = process.env.TG_API || 'https://api.telegram.org';

if (!BOT_TOKEN) { console.error('❌ Не задана переменная BOT_TOKEN. Добавь её в Railway → Variables.'); process.exit(1); }
if (OWNER_ID && !/^\d+$/.test(OWNER_ID)) console.error(`❌ OWNER_ID должен состоять только из цифр, а сейчас: "${OWNER_ID}". Бот никому не будет отвечать, пока это не исправлено.`);
fs.mkdirSync(path.join(DATA_DIR, 'lessons'), { recursive: true });
if (DATA_DIR !== '/data') log(`⚠️  Volume /data не подключён, данные пишутся в ${DATA_DIR} и сотрутся при обновлении. Подключи Volume с путём /data.`);

// ---------- база SQLite с интерфейсом как у Cloudflare D1 ----------
const sqlite = new DatabaseSync(path.join(DATA_DIR, 'planner.db'));
sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
const clean = row => (row ? { ...row } : null);
class Stmt {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...a) { this.args = a.map(v => (v === undefined ? null : typeof v === 'boolean' ? +v : v)); return this; }
  async all() { return { results: sqlite.prepare(this.sql).all(...this.args).map(clean) }; }
  async first() { return clean(sqlite.prepare(this.sql).get(...this.args)); }
  async run() { const r = sqlite.prepare(this.sql).run(...this.args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } }; }
  runSync() { sqlite.prepare(this.sql).run(...this.args); }
}
const DB = {
  prepare: sql => new Stmt(sql),
  async batch(list) {
    sqlite.exec('BEGIN');
    try { for (const s of list) s.runSync(); sqlite.exec('COMMIT'); } catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    return [];
  },
};
const lessonFile = id => path.join(DATA_DIR, 'lessons', String(id).replace(/[^a-z0-9]/gi, '') + '.html');
const LESSONS = {
  async get(id) { try { return await fs.promises.readFile(lessonFile(id), 'utf8'); } catch { return null; } },
  async put(id, text) { await fs.promises.writeFile(lessonFile(id), text); },
  async delete(id) { await fs.promises.rm(lessonFile(id), { force: true }); },
};

const SECRET = createHash('sha256').update('planner:' + BOT_TOKEN).digest('hex').slice(0, 40);
const env = () => ({ DB, LESSONS, BOT_TOKEN, WEBHOOK_SECRET: SECRET, TG_API: process.env.TG_API, OWNER_ID });
const ctx = { waitUntil: p => Promise.resolve(p).catch(e => log('ошибка задачи', e)) };
const BASE = PUBLIC_URL || 'http://localhost';

async function tg(method, body) {
  try {
    const r = await fetch(`${TG}/bot${BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
    return await r.json();
  } catch (e) { return { ok: false, description: String(e) }; }
}
const status = { started: new Date().toISOString(), bot: null, updates: 0, lastError: null };

// ---------- HTTP: мини-приложение ----------
const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: true, node: process.versions.node, dataDir: DATA_DIR, volume: DATA_DIR === '/data', publicUrl: PUBLIC_URL || null, ownerIdSet: !!OWNER_ID, ...status }, null, 2));
    }
    const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0];
    const chunks = []; for await (const c of req) chunks.push(c);
    const init = { method: req.method, headers: req.headers };
    if (!['GET', 'HEAD'].includes(req.method)) init.body = Buffer.concat(chunks);
    const r = await bot.fetch(new Request(`${proto}://${req.headers.host}${req.url}`, init), env(), ctx);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    log('ошибка запроса', e);
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Ошибка сервера');
  }
});
server.listen(PORT, '0.0.0.0', () => log(`✅ Сервер слушает порт ${PORT}, данные в ${DATA_DIR}`));

// ---------- Telegram: проверка токена, настройка, приём сообщений ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function start() {
  const me = await tg('getMe');
  if (!me.ok) {
    status.lastError = me.description;
    console.error(`❌ Telegram не принял токен: ${me.description}. Проверь BOT_TOKEN (без пробелов и кавычек).`);
    return;
  }
  status.bot = '@' + me.result.username;
  log(`🤖 Бот ${status.bot} на связи`);

  // запоминаем адрес приложения и ставим кнопку «Планер» (без вебхука: сообщения забираем сами)
  if (PUBLIC_URL) {
    const r = await bot.fetch(new Request(`${PUBLIC_URL}/setup?poll=1&key=${SECRET}`), env(), ctx);
    log('Кнопка «Планер»:', (await r.text()).split('\n')[0]);
  } else {
    log('⚠️  Нет домена: бот в чате работает, но приложение не откроется. Railway → Settings → Networking → Generate Domain, потом Redeploy.');
  }
  await tg('deleteWebhook', { drop_pending_updates: false });

  if (OWNER_ID) {
    const hello = await tg('sendMessage', { chat_id: OWNER_ID, text: `✅ Бот запущен.${PUBLIC_URL ? '' : '\n⚠️ Приложение пока без домена: создай домен в Railway и перезапусти.'}\nНапиши /start, чтобы появились кнопки.` });
    if (!hello.ok) log(`⚠️  Не смогла написать владельцу ${OWNER_ID}: ${hello.description}. Проверь OWNER_ID и что ты нажала Start в боте.`);
  }

  let offset = 0;
  for (;;) {
    const r = await tg('getUpdates', { offset, timeout: 50, allowed_updates: ['message', 'callback_query'] });
    if (!r.ok) {
      status.lastError = r.description;
      log('⚠️  getUpdates:', r.description);
      if (r.error_code === 409) await tg('deleteWebhook', { drop_pending_updates: false });
      await sleep(r.error_code === 401 ? 60e3 : 3e3);
      continue;
    }
    for (const u of r.result) {
      offset = u.update_id + 1;
      status.updates++;
      const from = (u.message || u.callback_query || {}).from || {};
      log(`📩 ${u.message ? 'сообщение' : 'кнопка'} от id ${from.id}`);
      try {
        await bot.fetch(new Request(`${BASE}/webhook`, { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': SECRET, 'content-type': 'application/json' }, body: JSON.stringify(u) }), env(), ctx);
      } catch (e) { log('ошибка обработки', e); }
    }
  }
}
start().catch(e => { status.lastError = String(e); log('❌ Ошибка запуска', e); });

// ---------- напоминания: раз в минуту ----------
const tick = () => bot.scheduled({ cron: '* * * * *' }, env(), ctx).catch(e => log('ошибка напоминаний', e));
setTimeout(tick, 20e3);
setInterval(tick, 60e3);

process.on('SIGTERM', () => { server.close(); try { sqlite.close(); } catch {} process.exit(0); });
