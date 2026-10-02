// Сервер для Railway: запускает бота и мини-приложение.
// Данные хранятся в папке DATA_DIR (на Railway это подключённый Volume /data).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import bot from './bot.js';

const PORT = +process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.resolve('data'));
const PUBLIC_URL = (process.env.PUBLIC_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN : '')).replace(/\/$/, '');
const BOT_TOKEN = (process.env.BOT_TOKEN || '').trim();

if (!BOT_TOKEN) {
  console.error('❌ Не задана переменная BOT_TOKEN. Добавь её в Railway → Variables.');
  process.exit(1);
}
fs.mkdirSync(path.join(DATA_DIR, 'lessons'), { recursive: true });
if (DATA_DIR !== '/data') console.warn('⚠️  Папка /data не найдена, данные пишутся в ' + DATA_DIR + '. На Railway подключи Volume с путём /data, иначе данные сотрутся при обновлении.');

// ---------- база SQLite с тем же интерфейсом, что у Cloudflare D1 ----------
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
    try { for (const s of list) s.runSync(); sqlite.exec('COMMIT'); }
    catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    return [];
  },
};

// ---------- хранилище уроков (файлы) ----------
const lessonFile = id => path.join(DATA_DIR, 'lessons', id.replace(/[^a-z0-9]/gi, '') + '.html');
const LESSONS = {
  async get(id) { try { return await fs.promises.readFile(lessonFile(id), 'utf8'); } catch { return null; } },
  async put(id, text) { await fs.promises.writeFile(lessonFile(id), text); },
  async delete(id) { await fs.promises.rm(lessonFile(id), { force: true }); },
};

// секрет вебхука выводится из токена, чтобы не заводить лишнюю переменную
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || createHash('sha256').update('planner:' + BOT_TOKEN).digest('hex').slice(0, 40);
const env = () => ({ DB, LESSONS, BOT_TOKEN, WEBHOOK_SECRET, TG_API: process.env.TG_API, OWNER_ID: (process.env.OWNER_ID || '').trim() });
const ctx = { waitUntil: p => Promise.resolve(p).catch(e => console.error('task error', e)) };

// ---------- HTTP ----------
const server = http.createServer(async (req, res) => {
  try {
    const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0];
    const url = `${proto}://${req.headers.host}${req.url}`;
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const init = { method: req.method, headers: req.headers };
    if (!['GET', 'HEAD'].includes(req.method)) init.body = Buffer.concat(chunks);
    const r = await bot.fetch(new Request(url, init), env(), ctx);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    console.error('request error', e);
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Ошибка сервера');
  }
});

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`✅ Сервер запущен на порту ${PORT}, данные в ${DATA_DIR}`);
  if (!PUBLIC_URL) {
    console.warn('⚠️  Нет публичного адреса. В Railway: Settings → Networking → Generate Domain, затем перезапусти деплой.');
    return;
  }
  // подключаем вебхук и кнопку «Планер» автоматически
  const r = await bot.fetch(new Request(`${PUBLIC_URL}/setup?key=${encodeURIComponent(WEBHOOK_SECRET)}`), env(), ctx);
  console.log('Настройка Telegram:', (await r.text()).split('\n')[0], '→', PUBLIC_URL);
});

// ---------- напоминания: раз в минуту ----------
const tick = () => bot.scheduled({ cron: '* * * * *' }, env(), ctx);
setTimeout(tick, 15e3);
setInterval(tick, 60e3);

process.on('SIGTERM', () => { server.close(); try { sqlite.close(); } catch {} process.exit(0); });
