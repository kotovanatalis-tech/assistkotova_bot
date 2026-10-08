// Превращает книгу (PDF, EPUB, FB2) в одну HTML-страницу для чтения в планере.
// Текст сохраняется полностью и на языке оригинала.
import zlib from 'node:zlib';
import path from 'node:path';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escA = s => esc(s).replace(/"/g, '&quot;');
const unent = s => String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
const stripTags = s => unent(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

export class BookError extends Error { constructor(m) { super(m); this.name = 'BookError'; } }

// ---------- общая страница для чтения ----------
function readerDoc({ title, author, lang, body }) {
  return `<!doctype html>
<html lang="${escA(lang || 'en')}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="book-mode" content="read">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,600;1,7..72,400&display=swap" rel="stylesheet">
<style>
:root{--bg:#fbf7ec;--ink:#29251a;--soft:#7a7259;--line:rgba(41,37,26,.12);--accent:#a3621a;color-scheme:light}
:root[data-theme="dark"]{--bg:#1d1a13;--ink:#ece3cb;--soft:#a69c80;--line:rgba(236,227,203,.14);--accent:#e3a857;color-scheme:dark}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:400 1.125rem/1.7 "Literata",Georgia,"Times New Roman",serif;overflow-wrap:break-word}
main{max-width:38rem;margin:0 auto;padding:28px 20px 140px}
.book-head{text-align:center;margin:24px 0 48px}
.book-head .bt{font:700 1.9rem/1.2 -apple-system,"Segoe UI",Roboto,sans-serif;letter-spacing:-.02em;margin:0}
.book-head .ba{color:var(--soft);margin-top:10px}
h1,h2,h3,h4,h5,h6{font-family:-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.25;letter-spacing:-.01em}
h1{font-size:1.55rem;margin:2.4em 0 .8em}h2{font-size:1.3rem;margin:2em 0 .6em}h3,h4,h5,h6{font-size:1.1rem;margin:1.6em 0 .5em}
p{margin:0 0 .9em;hyphens:auto;-webkit-hyphens:auto}
blockquote{margin:1.2em 0;padding:.1em 0 .1em 1em;border-left:3px solid var(--accent);color:var(--soft);font-style:italic}
blockquote p{margin:.3em 0}
img{max-width:100%;height:auto;display:block;margin:1.2em auto;border-radius:4px}
a{color:var(--accent)}
section.ch+section.ch{border-top:1px solid var(--line);margin-top:3em;padding-top:1em}
table{border-collapse:collapse;max-width:100%;display:block;overflow-x:auto;margin:1em 0;font-size:.95rem}
td,th{border:1px solid var(--line);padding:4px 8px;vertical-align:top}
pre{white-space:pre-wrap;font-size:.9rem}
.poem{margin:1.2em 0 1.2em 1.5em;font-style:italic}
.ta{text-align:right;color:var(--soft)}
</style></head><body><main>
<header class="book-head"><h1 class="bt">${esc(title)}</h1>${author ? `<div class="ba">${esc(author)}</div>` : ''}</header>
${body}
</main></body></html>`;
}

// ---------- ZIP ----------
function unzip(buf) {
  let e = buf.length - 22;
  const stop = Math.max(0, buf.length - 65557);
  while (e >= stop && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < stop) throw new BookError('Файл повреждён: не получается открыть архив.');
  const count = buf.readUInt16LE(e + 10);
  let p = buf.readUInt32LE(e + 16);
  const files = new Map();
  for (let i = 0; i < count && p + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), lo = buf.readUInt32LE(p + 42);
    files.set(buf.toString('utf8', p + 46, p + 46 + nl), { method, csize, lo });
    p += 46 + nl + xl + cl;
  }
  const get = name => {
    const f = files.get(name); if (!f) return null;
    const nl = buf.readUInt16LE(f.lo + 26), xl = buf.readUInt16LE(f.lo + 28);
    const start = f.lo + 30 + nl + xl, data = buf.subarray(start, start + f.csize);
    try { return f.method === 0 ? Buffer.from(data) : f.method === 8 ? zlib.inflateRawSync(data) : null; } catch { return null; }
  };
  return { names: [...files.keys()], get };
}

// ---------- EPUB ----------
const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'col', 'source', 'wbr', 'base', 'param', 'track', 'embed']);
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i')); return m ? unent(m[1] ?? m[2]) : null; };
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp' };

function cleanHtml(html, { imgSrc, linkHref }) {
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '');
  s = s.replace(/<(script|style|iframe|object|noscript|template|head)\b[\s\S]*?<\/\1\s*>/gi, '');
  s = s.replace(/<svg\b[\s\S]*?<\/svg\s*>/gi, m => { const im = m.match(/<image\b[^>]*>/i); const h = im && (attr(im[0], 'xlink:href') || attr(im[0], 'href')); return h ? `<img src="${escA(h)}">` : ''; });
  s = s.replace(/<(link|meta|base|embed|input|button|form|select|textarea)\b[^>]*>/gi, '');
  s = s.replace(/<\/(form|select|textarea|button)>/gi, '');
  // XHTML: <p/> -> <p></p>
  s = s.replace(/<([a-zA-Z][\w:-]*)(\s[^<>]*?)?\s*\/>/g, (m, t, a) => (VOID.has(t.toLowerCase()) ? `<${t}${a || ''}>` : `<${t}${a || ''}></${t}>`));
  s = s.replace(/<([a-zA-Z][\w:-]*)((?:\s+[^\s=<>\/"']+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"']+))?)*)\s*>/g, (m, t, a) => {
    const tag = t.toLowerCase().replace(/^\w+:/, '');
    if (tag === 'img') { const src = imgSrc(attr(m, 'src') || attr(m, 'xlink:href') || ''); return src ? `<img src="${src}" alt="${escA(attr(m, 'alt') || '')}" loading="lazy">` : ''; }
    const keep = [];
    const id = attr(m, 'id'); if (id) keep.push(`id="${escA(id)}"`);
    if (tag === 'a') { const h = linkHref(attr(m, 'href') || ''); if (h) keep.push(`href="${escA(h)}"`, ...(/^https?:/i.test(h) ? ['target="_blank" rel="noopener"'] : [])); }
    if (tag === 'td' || tag === 'th') { for (const k of ['colspan', 'rowspan']) { const v = attr(m, k); if (v && /^\d+$/.test(v)) keep.push(`${k}="${v}"`); } }
    return `<${tag}${keep.length ? ' ' + keep.join(' ') : ''}>`;
  });
  s = s.replace(/<\/([a-zA-Z][\w:-]*)\s*>/g, (m, t) => `</${t.toLowerCase().replace(/^\w+:/, '')}>`);
  s = s.replace(/<\/?(body|html|span|font|o:p)>/gi, '');
  return s.trim();
}

function epubToHtml(buf) {
  const z = unzip(buf);
  const cont = z.get('META-INF/container.xml');
  if (!cont) throw new BookError('Это не похоже на EPUB-книгу.');
  const opfPath = (cont.toString('utf8').match(/full-path\s*=\s*["']([^"']+)["']/) || [])[1];
  const opfBuf = opfPath && z.get(opfPath);
  if (!opfBuf) throw new BookError('EPUB повреждён: не нашла оглавление.');
  const opf = opfBuf.toString('utf8'), dir = path.posix.dirname(opfPath);
  const meta = n => stripTags((opf.match(new RegExp(`<dc:${n}\\b[^>]*>([\\s\\S]*?)<\\/dc:${n}>`, 'i')) || [])[1]);
  const manifest = new Map();
  for (const m of opf.matchAll(/<item\b[^>]*>/gi)) { const id = attr(m[0], 'id'), href = attr(m[0], 'href'); if (id && href) manifest.set(id, { href: path.posix.normalize(path.posix.join(dir, decodeURIComponent(href))), type: attr(m[0], 'media-type') || '' }); }
  const spine = [...opf.matchAll(/<itemref\b[^>]*>/gi)].map(m => manifest.get(attr(m[0], 'idref'))).filter(x => x && /html|xml/i.test(x.type + x.href));
  if (!spine.length) throw new BookError('В EPUB не нашлось глав.');
  const secId = new Map(spine.map((it, i) => [it.href, 'ch-' + (i + 1)]));
  let total = 0;
  const parts = [];
  spine.forEach((it, i) => {
    const b = z.get(it.href); if (!b) return;
    const x = b.toString('utf8');
    const bm = x.match(/<body\b[^>]*>([\s\S]*)<\/body>/i);
    const base = path.posix.dirname(it.href);
    const res = h => path.posix.normalize(path.posix.join(base, decodeURIComponent(h.split('#')[0])));
    const html = cleanHtml(bm ? bm[1] : x, {
      imgSrc: src => {
        if (!src || /^data:/i.test(src)) return src && src.length < 2e6 ? src : '';
        const p = res(src), data = z.get(p); if (!data || data.length > 1.5e6 || total > 20e6) return '';
        const mime = MIME[path.extname(p).slice(1).toLowerCase()]; if (!mime) return '';
        total += data.length; return `data:${mime};base64,${data.toString('base64')}`;
      },
      linkHref: h => {
        if (!h) return ''; if (/^(https?:|mailto:)/i.test(h)) return h;
        const [file, frag] = h.split('#');
        if (!file) return frag ? '#' + frag : '';
        return frag ? '#' + frag : (secId.get(res(file)) ? '#' + secId.get(res(file)) : '');
      },
    });
    if (!stripTags(html) && !/<img/i.test(html)) return;
    parts.push(`<section class="ch" id="${secId.get(it.href)}">\n${html}\n</section>`);
  });
  if (!parts.length) throw new BookError('Не получилось достать текст из EPUB.');
  return { title: meta('title'), author: meta('creator'), lang: meta('language'), body: parts.join('\n') };
}

// ---------- FB2 ----------
function fb2ToHtml(buf) {
  const head = buf.subarray(0, 300).toString('latin1');
  const enc = (head.match(/encoding\s*=\s*["']([^"']+)["']/i) || [])[1] || 'utf-8';
  let x;
  try { x = new TextDecoder(enc.toLowerCase()).decode(buf); } catch { x = buf.toString('utf8'); }
  const bins = new Map();
  for (const m of x.matchAll(/<binary\b([^>]*)>([\s\S]*?)<\/binary>/gi)) bins.set(attr(m[0], 'id'), `data:${attr(m[0], 'content-type') || 'image/jpeg'};base64,${m[2].replace(/\s+/g, '')}`);
  const ti = (x.match(/<title-info>([\s\S]*?)<\/title-info>/i) || [])[1] || '';
  const title = stripTags((ti.match(/<book-title>([\s\S]*?)<\/book-title>/i) || [])[1]);
  const au = (ti.match(/<author>([\s\S]*?)<\/author>/i) || [])[1] || '';
  const author = ['first-name', 'middle-name', 'last-name'].map(n => stripTags((au.match(new RegExp(`<${n}>([\\s\\S]*?)<\\/${n}>`)) || [])[1])).filter(Boolean).join(' ');
  const lang = stripTags((ti.match(/<lang>([\s\S]*?)<\/lang>/i) || [])[1]);
  const bodies = [...x.matchAll(/<body\b[^>]*>([\s\S]*?)<\/body>/gi)].map(m => m[1]);
  if (!bodies.length) throw new BookError('Это не похоже на FB2-книгу.');
  let depth = 0;
  const conv = s => s
    .replace(/<image\b[^>]*>/gi, m => { const h = (attr(m, 'l:href') || attr(m, 'xlink:href') || attr(m, 'href') || '').replace(/^#/, ''); return bins.get(h) ? `<img src="${bins.get(h)}" alt="">` : ''; })
    .replace(/<a\b[^>]*>/gi, m => { const h = attr(m, 'l:href') || attr(m, 'xlink:href') || attr(m, 'href') || ''; return h.startsWith('#') || /^https?:/.test(h) ? `<a href="${escA(h)}">` : '<a>'; })
    .replace(/<(\/?)section\b[^>]*>/gi, (m, c) => { depth += c ? -1 : 1; return c ? '</section>' : '<section>'; })
    .replace(/<title>([\s\S]*?)<\/title>/gi, (m, t) => `<h2>${stripTags(t.replace(/<\/p>/gi, ' '))}</h2>`)
    .replace(/<subtitle>/gi, '<h3>').replace(/<\/subtitle>/gi, '</h3>')
    .replace(/<(\/?)(epigraph|cite)\b[^>]*>/gi, '<$1blockquote>')
    .replace(/<(\/?)emphasis>/gi, '<$1em>')
    .replace(/<(\/?)(poem)\b[^>]*>/gi, (m, c) => (c ? '</div>' : '<div class="poem">'))
    .replace(/<stanza>/gi, '<p>').replace(/<\/stanza>/gi, '</p>')
    .replace(/<v>/gi, '').replace(/<\/v>/gi, '<br>')
    .replace(/<text-author>/gi, '<p class="ta">').replace(/<\/text-author>/gi, '</p>')
    .replace(/<empty-line\s*\/?>/gi, '')
    .replace(/<(\/?)strikethrough>/gi, '<$1s>')
    .replace(/<\/?(annotation|date|style)\b[^>]*>/gi, '');
  const body = bodies.map((b, i) => `<section class="ch" id="ch-${i + 1}">${conv(b)}</section>`).join('\n')
    .replace(/<p>\s*<\/p>/g, '');
  return { title, author, lang, body };
}

// ---------- PDF ----------
let pdfjsP = null;
async function loadPdfjs() {
  if (!pdfjsP) pdfjsP = import('pdfjs-dist/legacy/build/pdf.mjs').catch(e => { pdfjsP = null; throw new BookError('Модуль для PDF не установлен. Проверь, что на GitHub загружен новый package.json, и перезапусти деплой.'); });
  return pdfjsP;
}
const mode = arr => { const m = new Map(); let best = null, bn = 0; for (const [v, w] of arr) { const n = (m.get(v) || 0) + w; m.set(v, n); if (n > bn) { bn = n; best = v; } } return best; };

async function pdfToHtml(buf) {
  const pdfjs = await loadPdfjs();
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(buf), disableFontFace: true, isEvalSupported: false, useSystemFonts: false, verbosity: 0 }).promise;
  } catch (e) {
    throw new BookError(/password/i.test(String(e && e.name || e)) ? 'PDF защищён паролем, такой я открыть не могу.' : 'Не получилось открыть PDF.');
  }
  const info = (await doc.getMetadata().catch(() => ({}))).info || {};
  const pages = [];
  let chars = 0;
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const tc = await page.getTextContent();
    const items = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const [, , c, d, x, y] = it.transform;
      items.push({ s: it.str, x, y, w: it.width, size: Math.round((Math.hypot(c, d) || it.height || 10) * 2) / 2 });
    }
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const it of items) {
      const L = lines.find(l => Math.abs(l.y - it.y) < Math.max(2, it.size * 0.45));
      if (L) L.items.push(it); else lines.push({ y: it.y, items: [it] });
    }
    for (const L of lines) {
      L.items.sort((a, b) => a.x - b.x);
      let t = '', end = null;
      for (const it of L.items) {
        if (end !== null && it.x - end > it.size * 0.12 && !/\s$/.test(t) && !/^\s/.test(it.s)) t += ' ';
        t += it.s; end = it.x + it.w;
      }
      L.text = t.replace(/\s+/g, ' ').trim();
      L.x = L.items[0].x; L.xe = end; L.size = mode(L.items.map(i => [i.size, i.s.length])); L.page = n;
      chars += L.text.length;
    }
    lines.sort((a, b) => b.y - a.y);
    pages.push(lines.filter(l => l.text));
    page.cleanup();
  }
  if (chars < doc.numPages * 40) throw new BookError('В этом PDF почти нет текста: похоже, это скан (картинки страниц). Такие книги нужно сначала распознать (OCR), либо найти EPUB-версию.');

  // колонтитулы и номера страниц
  const keyOf = t => t.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
  const edge = new Map();
  for (const ls of pages) for (const l of [...ls.slice(0, 2), ...ls.slice(-2)]) { const k = keyOf(l.text); edge.set(k, (edge.get(k) || 0) + 1); }
  const thr = Math.max(3, pages.length * 0.25);
  for (let i = 0; i < pages.length; i++) {
    const ls = pages[i], cand = new Set([...ls.slice(0, 2), ...ls.slice(-2)]);
    pages[i] = ls.filter(l => !(cand.has(l) && ((pages.length >= 4 && edge.get(keyOf(l.text)) >= thr) || /^[-–—\s]*([0-9]{1,4}|[ivxlc]{1,6})[-–—\s]*$/i.test(l.text))));
  }
  const all = pages.flat();
  const body = mode(all.map(l => [l.size, l.text.length])) || 10;
  const bodyLines = all.filter(l => Math.abs(l.size - body) < 0.6);
  const left = mode(bodyLines.map(l => [Math.round(l.x), l.text.length])) || 0;
  const rights = bodyLines.map(l => l.xe).sort((a, b) => a - b);
  const right = rights[Math.floor(rights.length * 0.9)] || 0;
  const gaps = [];
  for (const ls of pages) for (let i = 1; i < ls.length; i++) if (Math.abs(ls[i].size - body) < 0.6 && Math.abs(ls[i - 1].size - body) < 0.6) gaps.push([Math.round((ls[i - 1].y - ls[i].y) * 2) / 2, 1]);
  const lineGap = mode(gaps.filter(g => g[0] > 0)) || body * 1.4;

  const out = [];
  let cur = null, prev = null;
  const flush = () => { if (!cur) return; out.push(cur); cur = null; };
  for (let pi = 0; pi < pages.length; pi++) {
    for (const l of pages[pi]) {
      const isHead = l.size >= body * 1.18 && l.text.length < 140 && /\p{L}/u.test(l.text);
      if (isHead) {
        const lvl = l.size >= body * 1.55 ? 'h1' : l.size >= body * 1.3 ? 'h2' : 'h3';
        if (cur && cur.tag === lvl && prev && prev.page === l.page && prev.y - l.y < l.size * 2) { cur.text += ' ' + l.text; }
        else { flush(); cur = { tag: lvl, text: l.text, page: l.page }; }
        prev = l; continue;
      }
      let brk = !cur || cur.tag !== 'p';
      if (!brk) {
        const samePage = prev.page === l.page;
        const indent = l.x > left + body * 0.8 && l.x < left + (right - left) / 3;
        const shortPrev = prev.xe < right - body * 2.5 && /[.!?:;…»"”)\]]$/.test(prev.text);
        if (samePage && prev.y - l.y > lineGap * 1.45) brk = true;
        else if (indent || shortPrev) brk = true;
      }
      if (brk) { flush(); cur = { tag: 'p', text: l.text, page: l.page }; }
      else if (/[-­‐]$/.test(cur.text) && /^\p{Ll}/u.test(l.text)) cur.text = cur.text.replace(/[-­‐]$/, '') + l.text;
      else cur.text += ' ' + l.text;
      prev = l;
    }
  }
  flush();
  let lastPage = 0;
  const html = out.map(b => {
    const pg = b.page !== lastPage ? ` data-page="${b.page}"` : ''; lastPage = b.page;
    return `<${b.tag}${pg}>${esc(b.text)}</${b.tag}>`;
  }).join('\n');
  const junk = t => !t || /\.(docx?|pdf|indd|tex|rtf|odt)$|^(microsoft|untitled|document|без имени)/i.test(t);
  const mt = String(info.Title || '').trim();
  return { title: junk(mt) ? '' : mt, author: String(info.Author || '').trim(), lang: '', body: `<section class="ch" id="ch-1">\n${html}\n</section>` };
}

// ---------- точка входа ----------
export async function convertBook(buf, fileName = '') {
  buf = Buffer.from(buf);
  const name = fileName.toLowerCase();
  let r;
  if (name.endsWith('.pdf') || buf.subarray(0, 5).toString('latin1') === '%PDF-') r = await pdfToHtml(buf);
  else if (name.endsWith('.epub')) r = epubToHtml(buf);
  else if (name.endsWith('.fb2')) r = fb2ToHtml(buf);
  else if (name.endsWith('.fb2.zip') || (name.endsWith('.zip') && buf.readUInt32LE(0) === 0x04034b50)) {
    const z = unzip(buf), f = z.names.find(n => /\.fb2$/i.test(n));
    if (f) r = fb2ToHtml(z.get(f));
    else if (z.get('META-INF/container.xml')) r = epubToHtml(buf);
    else throw new BookError('В архиве не нашлось книги FB2 или EPUB.');
  } else throw new BookError('Этот формат я не умею читать. Подходят PDF, EPUB, FB2 и HTML.');
  const fallback = fileName.replace(/\.(fb2\.zip|pdf|epub|fb2|zip)$/i, '').replace(/[_]+/g, ' ').trim();
  const title = r.title || fallback || 'Книга';
  return { title, author: r.author || '', html: readerDoc({ title, author: r.author, lang: r.lang, body: r.body }) };
}
