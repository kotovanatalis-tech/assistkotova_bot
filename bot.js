// ============================================================
//  Личный планер: Telegram-бот + мини-приложение
//  Cloudflare Worker (один файл). Нужны привязки:
//    DB       — база D1
//    LESSONS  — KV-хранилище для HTML-уроков
//    BOT_TOKEN, WEBHOOK_SECRET — секреты
//  Cron: "* * * * *" (каждую минуту) — для напоминаний
// ============================================================

const APP_HTML = "<!doctype html>\n<html lang=\"ru\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1\">\n<title>Планер</title>\n<script src=\"https://telegram.org/js/telegram-web-app.js\"></script>\n<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>\n<link href=\"https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700;800&display=swap\" rel=\"stylesheet\">\n<style>\n:root {\n  --sage: #e3e3cf; --cream: #f3ecd6; --butter: #f8e3a6; --sun: #f6cd62;\n  --ink: #2c2817; --soft: #6f684f; --faint: #a39b80; --line: rgba(44, 40, 23, .11);\n  --surface: rgba(255, 253, 244, .74); --surface-2: rgba(255, 253, 244, .5);\n  --yolk: #efb21f; --yolk-ink: #6b4c00;\n  --nap: #6f68b3; --wb: #a3417b; --urgent: #cf4526; --important: #548541;\n  --font: \"Onest\", -apple-system, \"Segoe UI\", Roboto, sans-serif;\n  --bar: 64px;\n  color-scheme: light;\n  box-sizing: border-box;\n}\n:root[data-theme=\"dark\"] {\n  --sage: #1c1c15; --cream: #221f16; --butter: #2f2714; --sun: #4a3a12;\n  --ink: #f4ecd6; --soft: #b9ae8d; --faint: #857c62; --line: rgba(244, 236, 214, .12);\n  --surface: rgba(40, 36, 25, .82); --surface-2: rgba(40, 36, 25, .55);\n  --yolk: #f2be3f; --yolk-ink: #2c2000;\n  --nap: #9d97e0; --wb: #df7bb4; --urgent: #f08263; --important: #8fc178;\n  color-scheme: dark;\n}\n* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }\nhtml, body { margin: 0; min-height: 100%; }\nbody {\n  font: 400 16px/1.45 var(--font); color: var(--ink);\n  background: var(--cream);\n  background-image: radial-gradient(120% 70% at 105% -5%, var(--sun) 0%, transparent 55%),\n                    linear-gradient(100deg, var(--sage) 0%, var(--cream) 45%, var(--butter) 100%);\n  background-attachment: fixed;\n  padding: env(safe-area-inset-top, 0) 0 calc(var(--bar) + env(safe-area-inset-bottom, 0px) + 24px);\n  font-variant-numeric: tabular-nums;\n  -webkit-font-smoothing: antialiased;\n}\nbutton, input, select, textarea { font: inherit; color: inherit; }\nbutton { cursor: pointer; border: 0; background: none; padding: 0; }\n:focus-visible { outline: 2px solid var(--yolk); outline-offset: 2px; }\n.wrap { max-width: 560px; margin: 0 auto; padding: 0 16px; }\n\n/* шапка */\n.top { padding: 18px 0 6px; }\n.top .wd { font-size: 15px; color: var(--soft); }\n.top .dt { font-size: 34px; font-weight: 800; letter-spacing: -.025em; line-height: 1.05; margin-top: 2px; }\n.today-line { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }\n.pill { display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; border-radius: 999px; background: var(--surface); font-size: 14px; line-height: 1.3; }\n.pill b { font-weight: 700; }\n.pill.past { color: var(--faint); }\n.pill.lesson::before, .pill.event::before, .pill.shift::before { content: \"\"; width: 8px; height: 8px; border-radius: 50%; flex: none; }\n.pill.lesson::before { background: var(--yolk); }\n.pill.event::before { background: var(--ink); }\n.pill.shift::before { background: var(--important); border-radius: 2px; }\n\n/* разделы */\nh2 { font-size: 21px; font-weight: 700; letter-spacing: -.01em; margin: 28px 0 10px; }\nh3 { font-size: 16px; font-weight: 700; margin: 0; }\n.panel { background: var(--surface); border-radius: 20px; padding: 14px 16px; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }\n.panel + .panel { margin-top: 10px; }\n.muted { color: var(--soft); }\n.small { font-size: 14px; }\n.hint { font-size: 14px; color: var(--soft); margin: 10px 2px 0; }\n.empty { padding: 18px 4px; color: var(--soft); font-size: 15px; }\n.row { display: flex; align-items: center; gap: 10px; }\n.grow { flex: 1; min-width: 0; }\n\n/* переключатель периода */\n.stepper { display: flex; align-items: center; justify-content: space-between; margin: 18px 0 12px; }\n.stepper .lbl { font-weight: 700; font-size: 17px; text-align: center; flex: 1; }\n.stepper .lbl small { display: block; font-weight: 500; font-size: 13px; color: var(--soft); }\n.arrow { width: 40px; height: 40px; border-radius: 50%; background: var(--surface); display: grid; place-items: center; font-size: 20px; }\n\n/* матрица */\n.matrix { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }\n.tile { text-align: left; border-radius: 18px; padding: 12px 14px 12px; background: var(--surface); position: relative; overflow: hidden; min-height: 84px; border: 2px solid transparent; transition: border-color .15s; }\n.tile::after { content: \"\"; position: absolute; inset: auto 0 0 0; height: 5px; background: var(--c); }\n.tile .tn { font-size: 14px; font-weight: 600; color: var(--c); }\n.tile .tc { font-size: 32px; font-weight: 800; line-height: 1.1; letter-spacing: -.02em; margin-top: 4px; }\n.tile .tc small { font-size: 14px; font-weight: 500; color: var(--soft); letter-spacing: 0; }\n.tile.on { border-color: var(--c); }\n.q-nap { --c: var(--nap); } .q-wb { --c: var(--wb); } .q-urgent { --c: var(--urgent); } .q-important { --c: var(--important); }\n\n.group h3 { color: var(--c); margin: 20px 2px 4px; display: flex; justify-content: space-between; }\n.task { display: flex; align-items: flex-start; gap: 12px; padding: 11px 2px; border-bottom: 1px solid var(--line); }\n.task:last-child { border-bottom: 0; }\n.chk { width: 26px; height: 26px; border-radius: 50%; border: 2px solid var(--c); flex: none; display: grid; place-items: center; margin-top: -1px; transition: background .15s; }\n.chk svg { opacity: 0; width: 15px; height: 15px; }\n.task.done .chk { background: var(--c); }\n.task.done .chk svg { opacity: 1; }\n.task.done .tt { color: var(--faint); text-decoration: line-through; }\n.tt { flex: 1; min-width: 0; overflow-wrap: anywhere; padding-top: 1px; }\n.tag { display: inline-block; font-size: 12px; font-weight: 600; padding: 1px 7px; border-radius: 6px; background: var(--surface-2); color: var(--soft); margin-left: 6px; vertical-align: 1px; }\n.more { width: 32px; height: 28px; border-radius: 8px; color: var(--soft); flex: none; font-size: 20px; line-height: 1; }\n\n/* поля ввода */\n.field { width: 100%; padding: 12px 14px; border-radius: 14px; border: 1.5px solid var(--line); background: var(--surface); outline: none; }\n.field:focus { border-color: var(--yolk); }\n.addbar { display: flex; gap: 8px; }\n.btn { padding: 12px 18px; border-radius: 14px; font-weight: 700; background: var(--ink); color: var(--cream); white-space: nowrap; }\n:root[data-theme=\"dark\"] .btn { color: #1d1a10; }\n:root[data-theme=\"dark\"] .btn.ghost { color: var(--ink); }\n:root[data-theme=\"dark\"] .mswitch button.on { background: rgba(244, 236, 214, .14); }\n.btn.yolk { background: var(--yolk); color: var(--yolk-ink); }\n.btn.ghost { background: var(--surface); color: var(--ink); }\n.btn.wide { width: 100%; }\n.btn:disabled { opacity: .45; }\n.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }\n.chip { padding: 7px 12px; border-radius: 999px; background: var(--surface-2); font-size: 14px; font-weight: 500; border: 1.5px solid transparent; }\n.chip.on { border-color: var(--c, var(--ink)); background: var(--surface); font-weight: 700; color: var(--c, var(--ink)); }\ndetails { margin-top: 10px; }\ndetails summary { list-style: none; cursor: pointer; padding: 12px 2px; font-weight: 600; color: var(--soft); display: flex; justify-content: space-between; }\ndetails summary::-webkit-details-marker { display: none; }\ndetails summary::after { content: \"+\"; font-size: 20px; line-height: 1; }\ndetails[open] summary::after { content: \"−\"; }\n.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }\nlabel.lb { display: block; font-size: 13px; color: var(--soft); margin: 10px 2px 4px; }\n\n/* календарь */\n.cal { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }\n.cal .h { text-align: center; font-size: 12px; color: var(--soft); padding-bottom: 2px; }\n.day { aspect-ratio: 1 / 1.08; border-radius: 12px; background: var(--surface-2); display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding-top: 6px; position: relative; font-weight: 600; font-size: 15px; }\n.day.out { visibility: hidden; }\n.day.today { background: var(--yolk); color: var(--yolk-ink); }\n.day.sel { outline: 2px solid var(--ink); outline-offset: -2px; }\n.day .dots { display: flex; gap: 3px; margin-top: 4px; }\n.day .dots i { width: 6px; height: 6px; border-radius: 50%; background: var(--ink); }\n.day .dots i.l { background: var(--yolk); }\n.day.today .dots i.l { background: var(--yolk-ink); }\n.day.shift::after { content: \"\"; position: absolute; left: 7px; right: 7px; bottom: 5px; height: 4px; border-radius: 2px; background: var(--important); }\n.legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 13px; color: var(--soft); margin-top: 10px; }\n.legend span { display: inline-flex; align-items: center; gap: 6px; }\n.legend i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }\n.ev { display: flex; gap: 12px; padding: 10px 2px; border-bottom: 1px solid var(--line); align-items: baseline; }\n.ev:last-child { border-bottom: 0; }\n.ev .tm { font-weight: 700; width: 46px; flex: none; }\n.ev .x { margin-left: auto; color: var(--faint); font-size: 14px; }\n\n/* деньги */\n.stat { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-top: 12px; }\n.stat:first-child { margin-top: 0; }\n.stat .v { font-weight: 800; font-size: 20px; letter-spacing: -.01em; }\n.stat .v small { font-size: 14px; font-weight: 500; color: var(--soft); }\n.bar { height: 8px; border-radius: 4px; background: var(--line); margin-top: 6px; overflow: hidden; display: flex; }\n.bar i { display: block; height: 100%; background: var(--yolk); border-radius: 4px; }\n.bar.seg i { border-radius: 0; }\n.catlist { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 13px; color: var(--soft); margin-top: 8px; }\n.catlist i { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 5px; }\n.entry { display: flex; gap: 10px; padding: 10px 2px; border-bottom: 1px solid var(--line); align-items: center; }\n.entry:last-child { border-bottom: 0; }\n.entry .am { font-weight: 700; white-space: nowrap; }\n.entry .am.inc { color: var(--important); }\n.seg-switch { display: inline-flex; background: var(--surface-2); border-radius: 12px; padding: 3px; }\n.seg-switch button { padding: 7px 14px; border-radius: 9px; font-weight: 600; font-size: 14px; color: var(--soft); }\n.seg-switch button.on { background: var(--surface); color: var(--ink); box-shadow: 0 1px 2px rgba(0,0,0,.08); }\n\n/* соцсети */\n.soc { padding: 14px 0; border-bottom: 1px solid var(--line); }\n.soc:last-child { border-bottom: 0; padding-bottom: 2px; }\n.soc:first-child { padding-top: 0; }\n.soc .cnt { font-size: 30px; font-weight: 800; letter-spacing: -.02em; line-height: 1; }\n.soc .cnt small { font-size: 15px; font-weight: 500; color: var(--soft); letter-spacing: 0; }\n.round { width: 44px; height: 44px; border-radius: 50%; background: var(--ink); color: var(--cream); font-size: 22px; font-weight: 600; display: grid; place-items: center; flex: none; }\n.round.light { background: var(--surface-2); color: var(--ink); }\n:root[data-theme=\"dark\"] .round { color: #1d1a10; }\n:root[data-theme=\"dark\"] .round.light { color: var(--ink); }\n.pips { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 10px; }\n.pips i { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--yolk); }\n.pips i.f { background: var(--yolk); }\n.pips i.x { border-color: var(--important); background: var(--important); }\n.goalset { display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--soft); margin-top: 10px; }\n.mini { width: 30px; height: 30px; border-radius: 9px; background: var(--surface-2); font-weight: 700; }\n.idea { display: flex; gap: 10px; padding: 10px 2px; border-bottom: 1px solid var(--line); align-items: flex-start; }\n.idea:last-child { border-bottom: 0; }\n\n/* язык */\n.review-cta { display: flex; align-items: center; gap: 14px; width: 100%; text-align: left; border-radius: 22px; padding: 18px; background: var(--ink); color: var(--cream); }\n:root[data-theme=\"dark\"] .review-cta { color: #1d1a10; }\n.review-cta .n { font-size: 44px; font-weight: 800; letter-spacing: -.03em; line-height: 1; }\n.review-cta .t { font-weight: 600; line-height: 1.3; }\n.review-cta .t small { display: block; font-weight: 400; opacity: .7; font-size: 14px; }\n.lesson { display: flex; gap: 12px; align-items: center; padding: 12px 2px; width: 100%; text-align: left; }\n.lrow { border-bottom: 1px solid var(--line); }\n.lrow:last-child { border-bottom: 0; }\n.lesson .ico { width: 42px; height: 50px; border-radius: 6px 10px 10px 6px; background: linear-gradient(160deg, var(--butter), var(--yolk)); flex: none; position: relative; }\n.lesson .ico::before { content: \"\"; position: absolute; left: 5px; top: 0; bottom: 0; width: 2px; background: rgba(0,0,0,.12); }\n.card-row { padding: 10px 2px; border-bottom: 1px solid var(--line); display: flex; gap: 10px; align-items: flex-start; }\n.card-row:last-child { border-bottom: 0; }\n.card-row .term { font-weight: 700; }\n.card-row .def { font-size: 14px; color: var(--soft); white-space: pre-line; }\n.card-row .due { font-size: 12px; color: var(--faint); white-space: nowrap; margin-top: 3px; }\n\n/* методика */\n.mhead { display: flex; justify-content: space-between; align-items: baseline; margin: 18px 2px 8px; font-size: 13px; color: var(--soft); }\n.lnk { color: var(--soft); font-weight: 600; font-size: 13px; text-decoration: underline; text-underline-offset: 2px; }\n.tagcloud { display: flex; flex-wrap: wrap; gap: 6px; }\n.tg { padding: 7px 11px; border-radius: 999px; background: var(--surface); font-size: 14px; font-weight: 600; border: 1.5px solid transparent; line-height: 1.2; }\n.tg small { font-weight: 500; color: var(--soft); margin-left: 2px; }\n.tg.on { background: var(--ink); color: var(--cream); }\n.tg.on small { color: inherit; opacity: .7; }\n:root[data-theme=\"dark\"] .tg.on { color: #1d1a10; }\n.tg.dim { opacity: .35; }\n.tg.sm { padding: 4px 9px; font-size: 13px; background: var(--surface-2); }\n.tg.sm.on { background: var(--ink); color: var(--cream); }\n:root[data-theme=\"dark\"] .tg.sm.on { color: #1d1a10; }\n.mbooks { flex-wrap: nowrap; overflow-x: auto; margin: 12px -16px 0; padding: 0 16px 4px; scrollbar-width: none; }\n.mbooks .chip { white-space: nowrap; flex: none; }\n.mi { background: var(--surface); border-radius: 18px; padding: 14px 14px 12px 16px; margin-top: 10px; }\n.mi .mt { font-weight: 700; font-size: 16px; line-height: 1.3; overflow-wrap: anywhere; }\n.mtx { margin-top: 8px; font-size: 15px; white-space: pre-line; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; cursor: pointer; }\n.mtx.open { display: block; -webkit-line-clamp: unset; }\n.mnote { margin-top: 8px; padding: 8px 10px; border-radius: 10px; background: var(--surface-2); font-size: 14px; white-space: pre-line; }\n.mnote::before { content: \"📝 \"; }\n.mtags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }\n.chip small { color: var(--soft); font-weight: 500; }\n.trow { display: flex; align-items: center; gap: 10px; padding: 10px 2px; border-bottom: 1px solid var(--line); }\n.trow:last-child { border-bottom: 0; }\n\n/* чтение */\n.mswitch { display: flex; background: var(--surface-2); border-radius: 14px; padding: 4px; margin-top: 18px; }\n.mswitch button { flex: 1; padding: 10px; border-radius: 11px; font-weight: 700; font-size: 15px; color: var(--soft); }\n.mswitch button.on { background: var(--surface); color: var(--ink); box-shadow: 0 1px 3px rgba(0,0,0,.08); }\n.cont { display: flex; gap: 14px; align-items: center; width: 100%; text-align: left; background: var(--ink); color: var(--cream); border-radius: 22px; padding: 16px 18px; margin-top: 16px; }\n:root[data-theme=\"dark\"] .cont { color: #1d1a10; }\n.cont .cv { width: 46px; height: 62px; border-radius: 5px 10px 10px 5px; background: linear-gradient(160deg, var(--butter), var(--yolk)); flex: none; position: relative; }\n.cont .cv::before { content: \"\"; position: absolute; left: 6px; top: 0; bottom: 0; width: 2px; background: rgba(0,0,0,.12); }\n.cont .k { font-size: 13px; opacity: .7; }\n.cont .tt { font-weight: 700; font-size: 17px; line-height: 1.25; overflow-wrap: anywhere; }\n.cont .pb { height: 4px; border-radius: 2px; background: rgba(255,255,255,.2); margin-top: 8px; overflow: hidden; }\n:root[data-theme=\"dark\"] .cont .pb { background: rgba(0,0,0,.15); }\n.cont .pb i { display: block; height: 100%; background: var(--yolk); }\n.rbar { height: 4px; border-radius: 2px; background: var(--line); margin-top: 6px; overflow: hidden; max-width: 160px; }\n.rbar i { display: block; height: 100%; background: var(--yolk); }\n.rq { font-family: Georgia, \"Times New Roman\", serif; font-size: 16px; line-height: 1.5; border-left: 3px solid var(--yolk); padding: 2px 0 2px 12px; white-space: pre-line; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 6; -webkit-box-orient: vertical; overflow: hidden; cursor: pointer; }\n.rq.open { display: block; }\n.upl { display: flex; gap: 10px; align-items: center; justify-content: center; }\n\n/* нижняя навигация */\n.tabs { position: fixed; left: 0; right: 0; bottom: 0; z-index: 20; background: var(--surface); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border-top: 1px solid var(--line); padding-bottom: env(safe-area-inset-bottom, 0px); }\n.tabs .in { max-width: 560px; margin: 0 auto; display: grid; grid-template-columns: repeat(6, 1fr); height: var(--bar); }\n.tabs button { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; font-size: 10.5px; min-width: 0; letter-spacing: -.01em; font-weight: 600; color: var(--faint); }\n.tabs button svg { width: 24px; height: 24px; stroke: currentColor; fill: none; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }\n.tabs button.on { color: var(--ink); }\n.tabs button.on svg { stroke-width: 2.3; }\n\n/* шторка */\n.scrim { display: none; position: fixed; inset: 0; background: rgba(30, 26, 12, .35); z-index: 40; opacity: 0; transition: opacity .2s; }\n.scrim.show { opacity: 1; }\n.sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 41; background: var(--cream); border-radius: 24px 24px 0 0; padding: 10px 18px calc(20px + env(safe-area-inset-bottom, 0px)); max-height: 88vh; overflow: auto; transform: translateY(100%); transition: transform .24s cubic-bezier(.2, .8, .2, 1); max-width: 560px; margin: 0 auto; }\n.sheet.show { transform: none; }\n.sheet .grab { width: 40px; height: 5px; border-radius: 3px; background: var(--line); margin: 0 auto 12px; }\n.sheet h3 { font-size: 18px; margin-bottom: 4px; overflow-wrap: anywhere; }\n.sheet .sect { font-size: 13px; color: var(--soft); margin: 16px 2px 6px; }\n.sheet .opts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }\n.sheet .opt { padding: 12px; border-radius: 14px; background: var(--surface); font-weight: 600; text-align: left; border: 2px solid transparent; }\n.sheet .opt.on { border-color: var(--c, var(--ink)); color: var(--c, var(--ink)); }\n.sheet .danger { color: var(--urgent); font-weight: 700; padding: 14px 4px 4px; }\n\n/* полноэкранные слои */\n.layer { position: fixed; inset: 0; z-index: 30; background: var(--cream); display: none; flex-direction: column; }\n.layer.show { display: flex; }\n.layer .lh { display: flex; align-items: center; gap: 10px; padding: calc(10px + env(safe-area-inset-top, 0px)) 12px 10px; border-bottom: 1px solid var(--line); background: var(--cream); }\n.layer .lh .ttl { font-weight: 700; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.layer iframe { flex: 1; border: 0; width: 100%; background: #fff; }\n.back { padding: 8px 10px; border-radius: 10px; font-weight: 600; color: var(--soft); }\n\n/* карточки */\n.flash { flex: 1; display: flex; flex-direction: column; padding: 20px 18px calc(20px + env(safe-area-inset-bottom, 0px)); max-width: 560px; width: 100%; margin: 0 auto; }\n.fcard { flex: 1; border-radius: 28px; background: var(--surface); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 28px 22px; position: relative; overflow: hidden; }\n.fcard::before { content: \"\"; position: absolute; width: 220px; height: 220px; border-radius: 50%; right: -70px; top: -70px; background: radial-gradient(circle, var(--sun), transparent 70%); opacity: .8; }\n.fcard .ft { font-size: 30px; font-weight: 800; letter-spacing: -.02em; line-height: 1.15; position: relative; overflow-wrap: anywhere; }\n.fcard .fi { color: var(--soft); margin-top: 6px; position: relative; }\n.fcard .fd { margin-top: 22px; font-size: 18px; line-height: 1.5; white-space: pre-line; position: relative; }\n.fcard .tap { margin-top: 26px; color: var(--faint); font-size: 14px; position: relative; }\n.fbtns { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }\n.fbtns .btn { padding: 16px; font-size: 17px; }\n.prog { text-align: center; color: var(--soft); font-size: 14px; margin-bottom: 12px; }\n\n.toast { position: fixed; left: 50%; bottom: calc(var(--bar) + 18px + env(safe-area-inset-bottom, 0px)); transform: translate(-50%, 20px); background: var(--ink); color: var(--cream); padding: 10px 16px; border-radius: 14px; font-weight: 600; font-size: 14px; opacity: 0; transition: .2s; z-index: 60; pointer-events: none; max-width: 90vw; }\n:root[data-theme=\"dark\"] .toast { color: #1d1a10; }\n.toast.show { opacity: 1; transform: translate(-50%, 0); }\n.gate { padding: 60px 24px; text-align: center; }\n.gate .dt { font-size: 28px; font-weight: 800; }\n@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }\n</style>\n</head>\n<body>\n<div class=\"wrap\">\n  <header class=\"top\" id=\"top\"></header>\n  <main id=\"view\"></main>\n</div>\n\n<nav class=\"tabs\"><div class=\"in\" id=\"tabs\">\n  <button data-tab=\"tasks\"><svg viewBox=\"0 0 24 24\"><rect x=\"3.5\" y=\"3.5\" width=\"7\" height=\"7\" rx=\"2\"/><rect x=\"13.5\" y=\"3.5\" width=\"7\" height=\"7\" rx=\"2\"/><rect x=\"3.5\" y=\"13.5\" width=\"7\" height=\"7\" rx=\"2\"/><path d=\"M14.5 17l2 2 3.5-4\"/></svg>Дела</button>\n  <button data-tab=\"cal\"><svg viewBox=\"0 0 24 24\"><rect x=\"3.5\" y=\"5\" width=\"17\" height=\"15.5\" rx=\"3\"/><path d=\"M3.5 10h17M8 3v4M16 3v4\"/></svg>Календарь</button>\n  <button data-tab=\"money\"><svg viewBox=\"0 0 24 24\"><path d=\"M9 20V5h5a4 4 0 0 1 0 8H6.5M6.5 16.5H14\"/></svg>Деньги</button>\n  <button data-tab=\"social\"><svg viewBox=\"0 0 24 24\"><rect x=\"4\" y=\"4\" width=\"16\" height=\"16\" rx=\"5\"/><circle cx=\"12\" cy=\"12\" r=\"3.6\"/><circle cx=\"16.8\" cy=\"7.2\" r=\".6\"/></svg>Соцсети</button>\n  <button data-tab=\"lang\"><svg viewBox=\"0 0 24 24\"><path d=\"M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z\"/></svg>Язык</button>\n  <button data-tab=\"method\"><svg viewBox=\"0 0 24 24\"><path d=\"M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z\"/></svg>Методика</button>\n</div></nav>\n\n<div class=\"scrim\" id=\"scrim\"></div>\n<div class=\"sheet\" id=\"sheet\"></div>\n\n<div class=\"layer\" id=\"viewer\">\n  <div class=\"lh\"><button class=\"back\" id=\"vback\">‹ Уроки</button><div class=\"ttl\" id=\"vtitle\"></div></div>\n  <iframe id=\"vframe\" title=\"Урок\"></iframe>\n</div>\n<div class=\"layer\" id=\"flash\">\n  <div class=\"lh\"><button class=\"back\" id=\"fback\">‹ Готово</button><div class=\"ttl\">Повторение</div></div>\n  <div class=\"flash\" id=\"fbody\"></div>\n</div>\n<div class=\"toast\" id=\"toast\"></div>\n\n<script>\nconst TG = window.Telegram && Telegram.WebApp;\nconst $ = s => document.querySelector(s);\nconst esc = s => String(s ?? '').replace(/[&<>\"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[c]));\nconst WD = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];\nconst WDF = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];\nconst MG = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];\nconst MN = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];\nconst MS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];\nconst QUADS = { nap: 'Сон ребёнка', wb: 'ВБ', urgent: 'Важно и срочно', important: 'Важно, не срочно' };\nconst EXP = { work: ['Работа', '#6f68b3'], home: ['Быт', '#efb21f'], self: ['На себя', '#a3417b'], other: ['Другое', '#9b937a'] };\nconst INC = { work: 'Работа', other: 'Другое' };\nconst SOC = { tg: 'Посты в Telegram', car: 'Карусели в Instagram', reels: 'Рилс в Instagram' };\nconst CHECK = '<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#fff\" stroke-width=\"3.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 12.5l4.5 4.5L19 7.5\"/></svg>';\n\nconst pd = s => new Date(s + 'T00:00:00Z');\nconst ymd = d => d.toISOString().slice(0, 10);\nconst addDays = (s, n) => { const d = pd(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };\nconst wdi = s => (pd(s).getUTCDay() + 6) % 7;\nconst fmtDay = s => { const d = pd(s); return `${WD[wdi(s)]}, ${d.getUTCDate()} ${MG[d.getUTCMonth()]}`; };\nconst fmtShort = s => { const d = pd(s); return `${d.getUTCDate()} ${MS[d.getUTCMonth()]}`; };\nconst fmtMonth = m => { const [y, mm] = m.split('-').map(Number); return `${MN[mm - 1]} ${y}`; };\nconst addMonth = (m, n) => { const [y, mm] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mm - 1 + n, 1)); return ymd(d).slice(0, 7); };\nconst num = n => Math.round(n).toString().replace(/\\B(?=(\\d{3})+(?!\\d))/g, '\\u2009');\nconst rub = n => num(n) + '\\u00a0₽';\nconst plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };\nconst haptic = (t = 'light') => { try { TG.HapticFeedback.impactOccurred(t); } catch (e) {} };\n\nconst S = { tab: 'tasks', today: null, day: null, filter: null, newQuad: 'nap', month: null, sel: null, mmonth: null, mkind: 'exp', mcat: 'home', week: null };\n\nasync function api(op, args = {}) {\n  const r = await fetch('/api', { method: 'POST', headers: { 'content-type': 'application/json', 'x-init-data': (TG && TG.initData) || '' }, body: JSON.stringify({ op, args }) });\n  const j = await r.json().catch(() => ({ error: 'Сервер не ответил' }));\n  if (!r.ok) { toast(j.error || 'Ошибка'); throw new Error(j.error); }\n  return j;\n}\nlet toastT;\nfunction toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); }\n\n/* ---------- шапка ---------- */\nasync function loadTop() {\n  const d = await api('today');\n  S.today = d.today; S.day = S.day || d.today; S.month = S.month || d.today.slice(0, 7); S.sel = S.sel || d.today; S.mmonth = S.mmonth || d.today.slice(0, 7);\n  const dt = pd(d.today);\n  let pills = '';\n  for (const e of d.events) pills += `<span class=\"pill ${e.kind}${e.time && e.time < d.hm ? ' past' : ''}\">${e.time ? `<b>${e.time}</b>` : ''} ${esc(e.title)}</span>`;\n  pills += `<span class=\"pill ${d.shift ? 'shift' : ''}\">${d.shift ? 'Муж на смене' : 'Муж дома'}</span>`;\n  if (d.due) pills += `<span class=\"pill\">${d.due} ${plural(d.due, 'слово', 'слова', 'слов')} на повторение</span>`;\n  $('#top').innerHTML = `<div class=\"wd\">${WDF[wdi(d.today)]}</div><div class=\"dt\">${dt.getUTCDate()} ${MG[dt.getUTCMonth()]}</div><div class=\"today-line\">${pills}</div>`;\n}\n\n/* ---------- шторка ---------- */\nlet sheetClose = null;\nfunction openSheet(html, bind) {\n  const sh = $('#sheet'), sc = $('#scrim');\n  sh.innerHTML = '<div class=\"grab\"></div>' + html;\n  sc.style.display = 'block';\n  requestAnimationFrame(() => { sc.classList.add('show'); sh.classList.add('show'); });\n  sheetClose = () => { sh.classList.remove('show'); sc.classList.remove('show'); setTimeout(() => { sc.style.display = 'none'; }, 220); sheetClose = null; syncBack(); };\n  bind && bind(sh);\n  syncBack();\n}\n$('#scrim').onclick = () => sheetClose && sheetClose();\nfunction syncBack() {\n  if (!TG || !TG.BackButton) return;\n  const any = sheetClose || $('#viewer').classList.contains('show') || $('#flash').classList.contains('show');\n  any ? TG.BackButton.show() : TG.BackButton.hide();\n}\nfunction goBack() {\n  if (sheetClose) return sheetClose();\n  if ($('#flash').classList.contains('show')) return closeFlash();\n  if ($('#viewer').classList.contains('show')) return closeViewer();\n}\n\n/* ---------- ДЕЛА ---------- */\nasync function renderTasks() {\n  const d = await api('tasks', { day: S.day });\n  const t = S.today, isToday = S.day === t;\n  const label = isToday ? 'Сегодня' : S.day === addDays(t, 1) ? 'Завтра' : S.day === addDays(t, -1) ? 'Вчера' : fmtDay(S.day);\n  const open = d.tasks.filter(x => !x.done), done = d.tasks.filter(x => x.done);\n  const cnt = k => open.filter(x => x.quad === k).length;\n  let h = `<div class=\"stepper\"><button class=\"arrow\" data-d=\"-1\" aria-label=\"Предыдущий день\">‹</button>\n    <div class=\"lbl\">${label}<small>${fmtDay(S.day)}</small></div>\n    <button class=\"arrow\" data-d=\"1\" aria-label=\"Следующий день\">›</button></div>`;\n  h += '<div class=\"matrix\">' + Object.keys(QUADS).map(k => `<button class=\"tile q-${k}${S.filter === k ? ' on' : ''}\" data-f=\"${k}\"><div class=\"tn\">${QUADS[k]}</div><div class=\"tc\">${cnt(k)}${cnt(k) ? '' : ' <small>пусто</small>'}</div></button>`).join('') + '</div>';\n  const keys = S.filter ? [S.filter] : Object.keys(QUADS);\n  let body = '';\n  for (const k of keys) {\n    const g = open.filter(x => x.quad === k);\n    if (!g.length && !S.filter) continue;\n    body += `<div class=\"group q-${k}\"><h3>${QUADS[k]}</h3><div class=\"panel\">` + (g.length ? g.map(taskRow).join('') : '<div class=\"empty\">Здесь пока пусто.</div>') + '</div></div>';\n  }\n  if (!body) body = `<div class=\"empty\">${isToday ? 'На сегодня дел нет. Добавь первое ниже или просто напиши боту.' : 'На этот день дел нет.'}</div>`;\n  h += body;\n  const nq = S.filter || S.newQuad;\n  h += `<h2>Новое дело</h2><div class=\"addbar\"><input class=\"field\" id=\"newtask\" placeholder=\"Что сделать?\" autocomplete=\"off\" enterkeyhint=\"done\"><button class=\"btn\" id=\"addtask\">Добавить</button></div>\n    <div class=\"chips\">${Object.keys(QUADS).map(k => `<button class=\"chip q-${k}${nq === k ? ' on' : ''}\" data-nq=\"${k}\">${QUADS[k]}</button>`).join('')}</div>`;\n  if (done.length) h += `<details><summary>Сделано: ${done.length}</summary><div class=\"panel\">${done.map(taskRow).join('')}</div></details>`;\n  $('#view').innerHTML = h;\n\n  $('#view').querySelectorAll('[data-d]').forEach(b => b.onclick = () => { S.day = addDays(S.day, +b.dataset.d); renderTasks(); });\n  $('#view').querySelectorAll('[data-f]').forEach(b => b.onclick = () => { S.filter = S.filter === b.dataset.f ? null : b.dataset.f; haptic(); renderTasks(); });\n  $('#view').querySelectorAll('[data-nq]').forEach(b => b.onclick = () => { S.newQuad = b.dataset.nq; if (S.filter) S.filter = b.dataset.nq; renderTasks(); });\n  const add = async () => {\n    const v = $('#newtask').value.trim(); if (!v) return;\n    await api('task.add', { text: v, quad: S.filter || S.newQuad, day: S.day }); haptic(); renderTasks();\n  };\n  $('#addtask').onclick = add;\n  $('#newtask').onkeydown = e => { if (e.key === 'Enter') add(); };\n  const map = Object.fromEntries(d.tasks.map(x => [x.id, x]));\n  $('#view').querySelectorAll('.task').forEach(el => {\n    const task = map[el.dataset.id];\n    el.querySelector('.chk').onclick = async () => { el.classList.toggle('done'); haptic(task.done ? 'light' : 'medium'); await api('task.upd', { id: task.id, done: !task.done }); renderTasks(); };\n    el.querySelector('.more').onclick = () => taskSheet(task);\n  });\n}\nfunction taskRow(x) {\n  const late = !x.done && x.day < S.day ? `<span class=\"tag\">с ${fmtShort(x.day)}</span>` : '';\n  return `<div class=\"task q-${x.quad}${x.done ? ' done' : ''}\" data-id=\"${x.id}\"><button class=\"chk\" aria-label=\"Отметить\">${CHECK}</button><div class=\"tt\">${esc(x.text)}${late}</div><button class=\"more\" aria-label=\"Действия\">⋯</button></div>`;\n}\nfunction taskSheet(task) {\n  const t = S.today;\n  openSheet(`<h3>${esc(task.text)}</h3>\n    <div class=\"sect\">Перенести в колонку</div>\n    <div class=\"opts\">${Object.keys(QUADS).map(k => `<button class=\"opt q-${k}${task.quad === k ? ' on' : ''}\" data-q=\"${k}\">${QUADS[k]}</button>`).join('')}</div>\n    <div class=\"sect\">Перенести на день</div>\n    <div class=\"opts\"><button class=\"opt\" data-day=\"${t}\">Сегодня</button><button class=\"opt\" data-day=\"${addDays(t, 1)}\">Завтра</button></div>\n    <input type=\"date\" class=\"field\" id=\"tdate\" value=\"${task.day}\" style=\"margin-top:8px\">\n    <div class=\"sect\">Текст</div>\n    <div class=\"addbar\"><input class=\"field\" id=\"ttext\" value=\"${esc(task.text)}\"><button class=\"btn ghost\" id=\"tsave\">Сохранить</button></div>\n    <button class=\"danger\" id=\"tdel\">Удалить дело</button>`, sh => {\n    const upd = async a => { await api('task.upd', { id: task.id, ...a }); haptic(); sheetClose(); renderTasks(); };\n    sh.querySelectorAll('[data-q]').forEach(b => b.onclick = () => upd({ quad: b.dataset.q }));\n    sh.querySelectorAll('[data-day]').forEach(b => b.onclick = () => upd({ day: b.dataset.day }).then(() => toast('Перенесено на ' + fmtDay(b.dataset.day))));\n    sh.querySelector('#tdate').onchange = e => e.target.value && upd({ day: e.target.value }).then(() => toast('Перенесено на ' + fmtDay(e.target.value)));\n    sh.querySelector('#tsave').onclick = () => upd({ text: sh.querySelector('#ttext').value });\n    sh.querySelector('#tdel').onclick = async () => { await api('task.del', { id: task.id }); sheetClose(); renderTasks(); };\n  });\n}\n\n/* ---------- КАЛЕНДАРЬ ---------- */\nasync function renderCal() {\n  const d = await api('cal', { month: S.month });\n  const [y, m] = S.month.split('-').map(Number);\n  const first = `${S.month}-01`, lead = wdi(first), days = new Date(Date.UTC(y, m, 0)).getUTCDate();\n  const shifts = new Set(d.shifts);\n  let h = `<div class=\"stepper\"><button class=\"arrow\" data-m=\"-1\" aria-label=\"Предыдущий месяц\">‹</button><div class=\"lbl\">${fmtMonth(S.month)}</div><button class=\"arrow\" data-m=\"1\" aria-label=\"Следующий месяц\">›</button></div>`;\n  h += '<div class=\"cal\">' + WD.map(w => `<div class=\"h\">${w}</div>`).join('');\n  for (let i = 0; i < lead; i++) h += '<div class=\"day out\"></div>';\n  for (let i = 1; i <= days; i++) {\n    const ds = `${S.month}-${String(i).padStart(2, '0')}`;\n    const evs = d.events.filter(e => e.date === ds);\n    const dots = evs.slice(0, 4).map(e => `<i class=\"${e.kind === 'lesson' ? 'l' : ''}\"></i>`).join('');\n    h += `<button class=\"day${ds === d.today ? ' today' : ''}${ds === S.sel ? ' sel' : ''}${shifts.has(ds) ? ' shift' : ''}\" data-ds=\"${ds}\">${i}<span class=\"dots\">${dots}</span></button>`;\n  }\n  h += '</div><div class=\"legend\"><span><i style=\"background:var(--yolk)\"></i>урок</span><span><i style=\"background:var(--ink)\"></i>событие</span><span><i style=\"background:var(--important);border-radius:2px;width:14px;height:4px\"></i>смена мужа</span></div>';\n\n  const sel = S.sel.slice(0, 7) === S.month ? S.sel : null;\n  if (sel) {\n    const evs = d.events.filter(e => e.date === sel);\n    h += `<h2>${fmtDay(sel)}</h2><div class=\"panel\">`;\n    if (shifts.has(sel)) h += `<div class=\"ev\"><span class=\"tm\">👷</span><span>Муж на смене</span></div>`;\n    h += evs.map(e => `<div class=\"ev\"><span class=\"tm\">${e.time || 'весь день'}</span><span>${esc(e.title)}${e.kind === 'lesson' ? ` <span class=\"tag\">каждый ${WD[wdi(sel)]}</span>` : ''}</span>${e.kind === 'event' ? `<button class=\"x\" data-del=\"${e.id}\">Удалить</button>` : ''}</div>`).join('');\n    if (!evs.length && !shifts.has(sel)) h += '<div class=\"empty\">Свободный день.</div>';\n    h += `</div><h2>Добавить событие</h2><div class=\"grid2\"><input type=\"date\" class=\"field\" id=\"edate\" value=\"${sel}\"><input type=\"time\" class=\"field\" id=\"etime\"></div>\n      <div class=\"addbar\" style=\"margin-top:8px\"><input class=\"field\" id=\"etitle\" placeholder=\"Что за событие?\" enterkeyhint=\"done\"><button class=\"btn\" id=\"eadd\">Добавить</button></div>\n      <p class=\"hint\">Можно и боту: «15.10 14:00 врач» или «завтра в 10 стоматолог». Напомню за день и за час.</p>`;\n  }\n  h += `<details><summary>Постоянное расписание</summary><div class=\"panel\">${d.recurring.map(r => `<div class=\"ev\"><span class=\"tm\">${r.time}</span><span>${esc(r.title)} <span class=\"tag\">${WDF[r.weekday - 1]}</span></span><button class=\"x\" data-rdel=\"${r.id}\">Удалить</button></div>`).join('') || '<div class=\"empty\">Пусто.</div>'}</div>\n    <div class=\"grid2\" style=\"margin-top:8px\"><select class=\"field\" id=\"rwd\">${WDF.map((w, i) => `<option value=\"${i + 1}\">${w}</option>`).join('')}</select><input type=\"time\" class=\"field\" id=\"rtime\" value=\"11:00\"></div>\n    <div class=\"addbar\" style=\"margin-top:8px\"><input class=\"field\" id=\"rtitle\" placeholder=\"Например, урок\" value=\"Урок\"><button class=\"btn\" id=\"radd\">Добавить</button></div></details>`;\n  const hb = d.husband || {};\n  h += `<details><summary>Смены мужа</summary><div class=\"grid2\"><div><label class=\"lb\">Первый рабочий день</label><input type=\"date\" class=\"field\" id=\"hstart\" value=\"${hb.start || ''}\"></div><div><label class=\"lb\">График до</label><input type=\"date\" class=\"field\" id=\"hend\" value=\"${hb.end || ''}\"></div>\n    <div><label class=\"lb\">Рабочих дней подряд</label><input type=\"number\" min=\"1\" class=\"field\" id=\"hon\" value=\"${hb.on || 2}\"></div><div><label class=\"lb\">Выходных подряд</label><input type=\"number\" min=\"1\" class=\"field\" id=\"hoff\" value=\"${hb.off || 2}\"></div></div>\n    <button class=\"btn wide\" id=\"hsave\" style=\"margin-top:10px\">Сохранить график</button></details>`;\n  $('#view').innerHTML = h;\n\n  $('#view').querySelectorAll('[data-m]').forEach(b => b.onclick = () => { S.month = addMonth(S.month, +b.dataset.m); renderCal(); });\n  $('#view').querySelectorAll('[data-ds]').forEach(b => b.onclick = () => { S.sel = b.dataset.ds; haptic(); renderCal(); });\n  $('#view').querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { await api('event.del', { id: +b.dataset.del }); renderCal(); loadTop(); });\n  $('#view').querySelectorAll('[data-rdel]').forEach(b => b.onclick = async () => { if (!confirm('Удалить из постоянного расписания?')) return; await api('rec.del', { id: +b.dataset.rdel }); renderCal(); loadTop(); });\n  const ea = $('#eadd');\n  if (ea) {\n    const add = async () => {\n      const title = $('#etitle').value.trim(), date = $('#edate').value; if (!title || !date) return toast('Нужны дата и название');\n      await api('event.add', { title, date, time: $('#etime').value || null }); haptic(); S.sel = date; S.month = date.slice(0, 7); toast('Событие добавлено'); renderCal(); loadTop();\n    };\n    ea.onclick = add; $('#etitle').onkeydown = e => { if (e.key === 'Enter') add(); };\n  }\n  $('#radd').onclick = async () => { await api('rec.add', { weekday: +$('#rwd').value, time: $('#rtime').value, title: $('#rtitle').value }); toast('Добавлено в расписание'); renderCal(); loadTop(); };\n  $('#hsave').onclick = async () => { await api('husband.set', { start: $('#hstart').value, end: $('#hend').value, on: $('#hon').value, off: $('#hoff').value }); toast('График сохранён'); renderCal(); loadTop(); };\n}\n\n/* ---------- ДЕНЬГИ ---------- */\nfunction goalBlock(label, val, goal) {\n  const p = goal > 0 ? Math.min(100, val / goal * 100) : 0;\n  return `<div class=\"stat\"><span class=\"muted\">${label}</span><span class=\"v\">${rub(val)}${goal > 0 ? ` <small>из ${rub(goal)}</small>` : ''}</span></div>${goal > 0 ? `<div class=\"bar\"><i style=\"width:${p}%\"></i></div>` : ''}`;\n}\nfunction expBlock(s) {\n  const tot = s.exp;\n  const seg = tot ? Object.keys(EXP).filter(k => s.byCat[k]).map(k => `<i style=\"width:${s.byCat[k] / tot * 100}%;background:${EXP[k][1]}\"></i>`).join('') : '';\n  const lst = Object.keys(EXP).filter(k => s.byCat[k]).map(k => `<span><i style=\"background:${EXP[k][1]}\"></i>${EXP[k][0]} ${rub(s.byCat[k])}</span>`).join('');\n  return `<div class=\"stat\"><span class=\"muted\">Расходы</span><span class=\"v\">${rub(tot)}</span></div>${tot ? `<div class=\"bar seg\">${seg}</div><div class=\"catlist\">${lst}</div>` : ''}`;\n}\nasync function renderMoney() {\n  const d = await api('money', { month: S.mmonth });\n  const curMonth = d.today.slice(0, 7);\n  let h = `<h2>Неделя ${fmtShort(d.week)} – ${fmtShort(d.weekEnd)}</h2><div class=\"panel\">${goalBlock('Доход', d.weekSums.inc, d.weekGoal.income)}${goalBlock('Из них работа', d.weekSums.work, d.weekGoal.work)}${expBlock(d.weekSums)}</div>`;\n  h += `<div class=\"stepper\"><button class=\"arrow\" data-mm=\"-1\" aria-label=\"Предыдущий месяц\">‹</button><div class=\"lbl\">${fmtMonth(d.month)}</div><button class=\"arrow\" data-mm=\"1\" aria-label=\"Следующий месяц\">›</button></div>`;\n  h += `<div class=\"panel\">${goalBlock('Доход', d.monthSums.inc, d.monthGoal.income)}${goalBlock('Из них работа', d.monthSums.work, d.monthGoal.work)}${expBlock(d.monthSums)}</div>`;\n  h += `<button class=\"btn yolk wide\" id=\"goals\" style=\"margin-top:10px\">Цели на неделю и ${d.month === curMonth ? 'месяц' : fmtMonth(d.month)}</button>`;\n  const cats = S.mkind === 'exp' ? Object.fromEntries(Object.entries(EXP).map(([k, v]) => [k, v[0]])) : INC;\n  if (!cats[S.mcat]) S.mcat = S.mkind === 'exp' ? 'home' : 'work';\n  h += `<h2>Записать вручную</h2><div class=\"seg-switch\"><button data-k=\"exp\" class=\"${S.mkind === 'exp' ? 'on' : ''}\">Расход</button><button data-k=\"inc\" class=\"${S.mkind === 'inc' ? 'on' : ''}\">Доход</button></div>\n    <div class=\"grid2\" style=\"margin-top:10px\"><input class=\"field\" id=\"mamt\" type=\"number\" inputmode=\"decimal\" placeholder=\"Сумма, ₽\"><input class=\"field\" id=\"mday\" type=\"date\" value=\"${d.today}\"></div>\n    <input class=\"field\" id=\"mnote\" placeholder=\"Комментарий, если нужен\" style=\"margin-top:8px\">\n    <div class=\"chips\">${Object.entries(cats).map(([k, v]) => `<button class=\"chip${S.mcat === k ? ' on' : ''}\" data-c=\"${k}\">${v}</button>`).join('')}</div>\n    <button class=\"btn wide\" id=\"madd\" style=\"margin-top:10px\">Записать</button>\n    <p class=\"hint\">Быстрее через бота: «350» или «350 кофе» для траты, «+15000» для дохода.</p>`;\n  h += `<h2>Записи за ${MN[+d.month.slice(5) - 1]}</h2><div class=\"panel\">` + (d.items.length ? d.items.map(x => `<div class=\"entry\" data-id=\"${x.id}\"><div class=\"grow\"><div>${x.kind === 'exp' ? EXP[x.cat][0] : 'Доход, ' + INC[x.cat].toLowerCase()}${x.note ? ` <span class=\"muted\">${esc(x.note)}</span>` : ''}</div><div class=\"small muted\">${fmtDay(x.day)}</div></div><span class=\"am ${x.kind}\">${x.kind === 'inc' ? '+' : '−'}${rub(x.amount)}</span><button class=\"more\" aria-label=\"Удалить\">⋯</button></div>`).join('') : '<div class=\"empty\">Записей пока нет.</div>') + '</div>';\n  $('#view').innerHTML = h;\n\n  $('#view').querySelectorAll('[data-mm]').forEach(b => b.onclick = () => { S.mmonth = addMonth(S.mmonth, +b.dataset.mm); renderMoney(); });\n  $('#view').querySelectorAll('[data-k]').forEach(b => b.onclick = () => { S.mkind = b.dataset.k; renderMoney(); });\n  $('#view').querySelectorAll('[data-c]').forEach(b => b.onclick = () => { S.mcat = b.dataset.c; $('#view').querySelectorAll('[data-c]').forEach(x => x.classList.toggle('on', x === b)); });\n  $('#madd').onclick = async () => {\n    const amount = parseFloat(($('#mamt').value || '').replace(',', '.'));\n    if (!(amount > 0)) return toast('Введи сумму');\n    await api('money.add', { kind: S.mkind, amount, cat: S.mcat, note: $('#mnote').value, day: $('#mday').value }); haptic(); toast('Записано'); renderMoney();\n  };\n  $('#view').querySelectorAll('.entry .more').forEach(b => b.onclick = () => {\n    const id = +b.closest('.entry').dataset.id;\n    openSheet('<h3>Удалить запись?</h3><button class=\"danger\" id=\"del\">Удалить</button>', sh => sh.querySelector('#del').onclick = async () => { await api('money.del', { id }); sheetClose(); renderMoney(); });\n  });\n  $('#goals').onclick = () => openSheet(`<h3>Цели по доходу</h3>\n    <div class=\"sect\">Неделя ${fmtShort(d.week)} – ${fmtShort(d.weekEnd)}</div>\n    <div class=\"grid2\"><div><label class=\"lb\">Весь доход</label><input class=\"field\" id=\"gwi\" type=\"number\" inputmode=\"numeric\" value=\"${d.weekGoal.income || ''}\"></div><div><label class=\"lb\">Работа</label><input class=\"field\" id=\"gww\" type=\"number\" inputmode=\"numeric\" value=\"${d.weekGoal.work || ''}\"></div></div>\n    <div class=\"sect\">${fmtMonth(d.month)}</div>\n    <div class=\"grid2\"><div><label class=\"lb\">Весь доход</label><input class=\"field\" id=\"gmi\" type=\"number\" inputmode=\"numeric\" value=\"${d.monthGoal.income || ''}\"></div><div><label class=\"lb\">Работа</label><input class=\"field\" id=\"gmw\" type=\"number\" inputmode=\"numeric\" value=\"${d.monthGoal.work || ''}\"></div></div>\n    <button class=\"btn wide\" id=\"gsave\" style=\"margin-top:16px\">Сохранить цели</button>`, sh => sh.querySelector('#gsave').onclick = async () => {\n      await api('goals.set', { period: 'w:' + d.week, income: sh.querySelector('#gwi').value, work: sh.querySelector('#gww').value });\n      await api('goals.set', { period: 'm:' + d.month, income: sh.querySelector('#gmi').value, work: sh.querySelector('#gmw').value });\n      sheetClose(); toast('Цели сохранены'); renderMoney();\n    });\n}\n\n/* ---------- СОЦСЕТИ ---------- */\nasync function renderSocial() {\n  const d = await api('social', { week: S.week });\n  S.week = d.week;\n  const lbl = d.week === d.current ? 'Эта неделя' : d.week > d.current ? 'Следующая неделя' : 'Прошлая неделя';\n  let h = `<div class=\"stepper\"><button class=\"arrow\" data-w=\"-7\" aria-label=\"Предыдущая неделя\">‹</button><div class=\"lbl\">${lbl}<small>${fmtShort(d.week)} – ${fmtShort(d.weekEnd)}</small></div><button class=\"arrow\" data-w=\"7\" aria-label=\"Следующая неделя\">›</button></div><div class=\"panel\">`;\n  for (const k of Object.keys(SOC)) {\n    const it = d.items[k], n = Math.max(it.goal, it.done);\n    const pips = Array.from({ length: n }, (_, i) => `<i class=\"${i < it.done ? (i >= it.goal ? 'x' : 'f') : ''}\"></i>`).join('');\n    h += `<div class=\"soc\"><div class=\"row\"><div class=\"grow\"><h3>${SOC[k]}</h3><div class=\"cnt\" style=\"margin-top:6px\">${it.done}${it.goal ? ` <small>из ${it.goal}</small>` : ''}${it.goal && it.done >= it.goal ? ' <small>готово</small>' : ''}</div></div>\n      <button class=\"round light\" data-s=\"${k}\" data-delta=\"-1\" aria-label=\"Минус один\">−</button><button class=\"round\" data-s=\"${k}\" data-delta=\"1\" aria-label=\"Плюс один\">+</button></div>\n      ${n ? `<div class=\"pips\">${pips}</div>` : ''}\n      <div class=\"goalset\">Цель на неделю <button class=\"mini\" data-g=\"${k}\" data-gv=\"${it.goal - 1}\" aria-label=\"Уменьшить цель\">−</button><b style=\"color:var(--ink);min-width:18px;text-align:center\">${it.goal}</b><button class=\"mini\" data-g=\"${k}\" data-gv=\"${it.goal + 1}\" aria-label=\"Увеличить цель\">+</button></div></div>`;\n  }\n  h += '</div>';\n  h += `<h2>Банк идей</h2><div class=\"addbar\"><input class=\"field\" id=\"idea\" placeholder=\"Идея для поста или рилс\" enterkeyhint=\"done\"><button class=\"btn\" id=\"iadd\">Добавить</button></div>\n    <div class=\"panel\" style=\"margin-top:10px\">${d.ideas.length ? d.ideas.map(x => `<div class=\"idea\"><div class=\"grow\">${esc(x.text)}</div><button class=\"more\" data-i=\"${x.id}\" aria-label=\"Действия\">⋯</button></div>`).join('') : '<div class=\"empty\">Идей пока нет. Можно и боту: «💡 рилс про утро с малышом».</div>'}</div>`;\n  $('#view').innerHTML = h;\n\n  $('#view').querySelectorAll('[data-w]').forEach(b => b.onclick = () => { S.week = addDays(S.week, +b.dataset.w); renderSocial(); });\n  $('#view').querySelectorAll('[data-delta]').forEach(b => b.onclick = async () => { haptic(b.dataset.delta > 0 ? 'medium' : 'light'); await api('social.set', { week: S.week, key: b.dataset.s, delta: +b.dataset.delta }); renderSocial(); });\n  $('#view').querySelectorAll('[data-g]').forEach(b => b.onclick = async () => { await api('social.set', { week: S.week, key: b.dataset.g, goal: Math.max(0, +b.dataset.gv) }); renderSocial(); });\n  const add = async () => { const v = $('#idea').value.trim(); if (!v) return; await api('idea.add', { text: v }); haptic(); renderSocial(); };\n  $('#iadd').onclick = add; $('#idea').onkeydown = e => { if (e.key === 'Enter') add(); };\n  $('#view').querySelectorAll('[data-i]').forEach(b => b.onclick = () => {\n    const id = +b.dataset.i, text = d.ideas.find(x => x.id === id).text;\n    openSheet(`<h3>${esc(text)}</h3><div class=\"sect\">Сделать делом</div><div class=\"opts\">${Object.keys(QUADS).map(k => `<button class=\"opt q-${k}\" data-q=\"${k}\">${QUADS[k]}</button>`).join('')}</div><button class=\"danger\" id=\"idel\">Удалить идею</button>`, sh => {\n      sh.querySelectorAll('[data-q]').forEach(x => x.onclick = async () => { await api('task.add', { text, quad: x.dataset.q, day: S.today }); await api('idea.del', { id }); sheetClose(); toast('Добавлено в дела на сегодня'); renderSocial(); });\n      sh.querySelector('#idel').onclick = async () => { await api('idea.del', { id }); sheetClose(); renderSocial(); };\n    });\n  });\n}\n\n/* ---------- ЯЗЫК ---------- */\nlet LANG = null;\nasync function renderLang() {\n  const d = LANG = await api('lang');\n  const due = d.cards.filter(c => c.due <= d.today);\n  let h = `<h2 style=\"margin-top:20px\">Повторение</h2><button class=\"review-cta\" id=\"rev\"><span class=\"n\">${due.length}</span><span class=\"t\">${due.length ? `${plural(due.length, 'слово ждёт', 'слова ждут', 'слов ждут')} повторения<small>Нажми, чтобы начать</small>` : 'На сегодня всё повторено<small>' + (d.cards.length ? 'Можно пройти все слова заново' : 'Добавляй слова из уроков') + '</small>'}</span></button>`;\n  h += `<h2>Уроки</h2><div class=\"panel\">` + (d.lessons.length ? d.lessons.map(l => `<div class=\"row lrow\"><button class=\"lesson grow\" data-l=\"${l.id}\"><span class=\"ico\"></span><span class=\"grow\"><b>${esc(l.title)}</b><br><span class=\"small muted\">${fmtShort(l.created)}${l.count ? `, ${l.count} ${plural(l.count, 'выражение', 'выражения', 'выражений')}` : ''}</span></span></button><button class=\"more\" data-ld=\"${l.id}\" aria-label=\"Действия\">⋯</button></div>`).join('') : '<div class=\"empty\">Пришли боту HTML-файл с уроком, и он появится здесь.</div>') + '</div>';\n  h += `<h2>Все слова: ${d.cards.length}</h2><div class=\"panel\">` + (d.cards.length ? d.cards.map(c => `<div class=\"card-row\" data-c=\"${c.id}\"><div class=\"grow\"><div class=\"term\">${esc(c.term)}</div>${c.def ? `<div class=\"def\">${esc(c.def)}</div>` : ''}</div><div class=\"due\">${c.due <= d.today ? 'сегодня' : fmtShort(c.due)}</div><button class=\"more\" aria-label=\"Действия\">⋯</button></div>`).join('') : '<div class=\"empty\">Слов пока нет. Открой урок и нажми на подсвеченное выражение.</div>') + '</div>';\n  $('#view').innerHTML = h;\n\n  $('#rev').onclick = () => startFlash(due.length ? due : d.cards);\n  $('#view').querySelectorAll('[data-l]').forEach(b => b.onclick = () => openLesson(b.dataset.l, d.lessons.find(l => l.id === b.dataset.l).title));\n  $('#view').querySelectorAll('[data-ld]').forEach(b => b.onclick = () => openSheet('<h3>Удалить урок?</h3><p class=\"muted small\">Слова из него останутся в повторении.</p><button class=\"danger\" id=\"del\">Удалить урок</button>', sh => sh.querySelector('#del').onclick = async () => { await api('lesson.del', { id: b.dataset.ld }); sheetClose(); renderLang(); }));\n  $('#view').querySelectorAll('.card-row .more').forEach(b => b.onclick = () => {\n    const c = d.cards.find(x => x.id === +b.closest('.card-row').dataset.c);\n    openSheet(`<h3>${esc(c.term)}</h3><label class=\"lb\">Значение или перевод</label><textarea class=\"field\" id=\"cdef\" rows=\"3\">${esc(c.def)}</textarea><button class=\"btn wide\" id=\"csave\" style=\"margin-top:10px\">Сохранить</button><button class=\"danger\" id=\"cdel\">Удалить слово</button>`, sh => {\n      sh.querySelector('#csave').onclick = async () => { await api('card.upd', { id: c.id, def: sh.querySelector('#cdef').value }); sheetClose(); renderLang(); };\n      sh.querySelector('#cdel').onclick = async () => { await api('card.del', { id: c.id }); sheetClose(); renderLang(); };\n    });\n  });\n}\n\n/* просмотр урока */\nlet VIEW_ID = null, VIEW_KIND = 'lesson';\nfunction openLesson(id, title) { openViewer('lesson', id, title); }\nfunction openBook(id, title, ref) { openViewer('book', id, title, ref); }\nfunction openRead(id, title, ref) { openViewer('read', id, title, ref); }\nfunction openViewer(kind, id, title, ref) {\n  VIEW_ID = id; VIEW_KIND = kind;\n  $('#vtitle').textContent = title || (kind === 'lesson' ? 'Урок' : 'Книга');\n  $('#vback').textContent = kind === 'lesson' ? '‹ Уроки' : '‹ Методика';\n  const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';\n  $('#vframe').src = '/' + kind + '/' + id + (kind === 'read' ? '?theme=' + theme : '') + (ref ? '#' + encodeURIComponent(ref) : '');\n  $('#viewer').classList.add('show');\n  document.body.style.overflow = 'hidden';\n  syncBack();\n}\nfunction closeViewer() { try { $('#vframe').contentWindow.dispatchEvent(new Event('pagehide')); } catch (e) {} $('#viewer').classList.remove('show'); setTimeout(() => { if (!$('#viewer').classList.contains('show')) $('#vframe').src = 'about:blank'; }, 300); document.body.style.overflow = ''; VIEW_ID = null; syncBack(); if (S.tab === 'lang' || S.tab === 'method') RENDER[S.tab]().catch(() => {}); loadTop(); }\n$('#vback').onclick = closeViewer;\nwindow.addEventListener('message', async e => {\n  if (e.origin !== location.origin || !e.data || !e.data.lx) return;\n  const fr = $('#vframe').contentWindow;\n  if (e.data.lx === 'hello') {\n    const r = await api('card.terms'); fr && fr.postMessage({ lx: 'terms', terms: r.terms }, location.origin);\n  } else if (e.data.lx === 'add') {\n    const items = e.data.items.map(x => ({ ...x, lesson: VIEW_ID }));\n    const r = await api('card.add', { items }); haptic('medium');\n    fr && fr.postMessage({ lx: 'terms', terms: r.terms, added: items.length }, location.origin);\n  } else if (['mhello', 'msave', 'mdel'].includes(e.data.lx) && VIEW_KIND === 'book') {\n    let st;\n    if (e.data.lx === 'mhello') st = await api('midea.state', { book: VIEW_ID });\n    else if (e.data.lx === 'msave') { st = await api('midea.save', { ...e.data.item, book: VIEW_ID }); haptic('medium'); }\n    else st = await api('midea.del', { book: VIEW_ID, ref: e.data.ref });\n    fr && fr.postMessage({ lx: 'mstate', saved: st.saved, tags: st.tags }, location.origin);\n  } else if (VIEW_KIND === 'read' && ['rhello', 'rsave', 'rdel', 'rpos'].includes(e.data.lx)) {\n    const book = VIEW_ID;\n    if (e.data.lx === 'rpos') {\n      api('rbook.pos', { book: e.data.book || book, pos: e.data.pos, pct: e.data.pct }).then(() => {\n        if (!$('#viewer').classList.contains('show') && S.tab === 'method' && M.mode === 'read') renderReading().catch(() => {});\n      }).catch(() => {});\n      return;\n    }\n    let st;\n    if (e.data.lx === 'rhello') st = await api('rbook.state', { book });\n    else if (e.data.lx === 'rsave') { st = await api('rnote.save', { ...e.data.item, book }); haptic('medium'); }\n    else st = await api('rnote.del', { id: e.data.id, book });\n    fr && fr.postMessage({ lx: 'rstate', notes: st.notes, tags: st.tags, pos: st.pos }, location.origin);\n  }\n});\n\n/* карточки */\nlet FL = null;\nfunction startFlash(list) {\n  if (!list.length) return toast('Пока нечего повторять');\n  FL = { list: [...list].sort(() => Math.random() - .5), i: 0, flip: false, ok: 0 };\n  $('#flash').classList.add('show'); document.body.style.overflow = 'hidden'; syncBack(); drawFlash();\n}\nfunction drawFlash() {\n  const b = $('#fbody');\n  if (FL.i >= FL.list.length) {\n    b.innerHTML = `<div class=\"fcard\"><div class=\"ft\">Готово!</div><div class=\"fd\">Помню: ${FL.ok} из ${FL.list.length}.<br>Остальные вернутся завтра.</div></div><div class=\"fbtns\" style=\"grid-template-columns:1fr\"><button class=\"btn\" id=\"fdone\">Закрыть</button></div>`;\n    $('#fdone').onclick = closeFlash; return;\n  }\n  const c = FL.list[FL.i];\n  b.innerHTML = `<div class=\"prog\">${FL.i + 1} из ${FL.list.length}</div><button class=\"fcard\" id=\"fc\"><div class=\"ft\">${esc(c.term)}</div>${FL.flip ? `<div class=\"fd\">${esc(c.def || 'Значение не добавлено. Его можно дописать в списке слов.')}</div>` : '<div class=\"tap\">Вспомни значение и нажми на карточку</div>'}</button>\n    <div class=\"fbtns\">${FL.flip ? '<button class=\"btn ghost\" id=\"fno\">Не помню</button><button class=\"btn yolk\" id=\"fyes\">Помню</button>' : '<button class=\"btn ghost\" id=\"fshow\" style=\"grid-column:1/-1\">Показать ответ</button>'}</div>`;\n  const flip = () => { FL.flip = true; haptic(); drawFlash(); };\n  $('#fc').onclick = () => !FL.flip && flip();\n  if (!FL.flip) $('#fshow').onclick = flip;\n  else {\n    const ans = async ok => { if (ok) FL.ok++; api('card.review', { id: c.id, ok }); FL.i++; FL.flip = false; haptic(ok ? 'medium' : 'light'); drawFlash(); };\n    $('#fyes').onclick = () => ans(true); $('#fno').onclick = () => ans(false);\n  }\n}\nfunction closeFlash() { $('#flash').classList.remove('show'); document.body.style.overflow = ''; syncBack(); if (S.tab === 'lang') renderLang(); loadTop(); }\n$('#fback').onclick = closeFlash;\n\n\n/* ---------- МЕТОДИКА ---------- */\nconst MGROUPS = [\n  ['Уровень', ['a1', 'a2', 'b1', 'b2', 'c1', 'c2']],\n  ['Навык', ['speaking', 'listening', 'reading', 'writing', 'grammar', 'vocabulary', 'pronunciation']],\n  ['Тип', ['warm-up', 'game', 'filler', 'revision', 'project', 'homework']],\n  ['Для кого', ['kids', 'teens', 'adults', '1-to-1', 'group']],\n  ['Формат', ['online', 'offline']],\n];\nconst PRESET = new Set(MGROUPS.flatMap(g => g[1]));\nconst normTag = s => String(s || '').trim().replace(/^#+/, '').toLowerCase().replace(/[\\s_]+/g, '-').replace(/[,;\"'<>#]+/g, '').replace(/^-+|-+$/g, '').slice(0, 40);\nconst showTag = t => (/^[abc][12]\\+?$/.test(t) ? t.toUpperCase() : t);\nconst ideaSrc = i => (i.book_title ? i.book_title + (i.page ? ', с. ' + i.page : '') : 'своя идея');\nconst M = { sel: [], book: '', q: '', sort: 'count', open: new Set(), mode: (() => { try { return localStorage.getItem('m-mode') || 'ideas'; } catch (e) { return 'ideas'; } })() };\nconst R = { sel: [], book: '', q: '', open: new Set() };\nlet RD = { books: [], notes: [] };\nlet MD = { books: [], ideas: [] };\nconst tagTotals = () => { const m = new Map(); for (const i of MD.ideas) for (const t of i.tags) m.set(t, (m.get(t) || 0) + 1); return m; };\n\nasync function renderMethod() {\n  if (M.mode === 'read') return renderReading();\n  MD = await api('method');\n  drawMethod();\n}\nfunction modeSwitch() {\n  return `<div class=\"mswitch\"><button data-mode=\"ideas\" class=\"${M.mode !== 'read' ? 'on' : ''}\">💡 Идеи</button><button data-mode=\"read\" class=\"${M.mode === 'read' ? 'on' : ''}\">📖 Чтение</button></div>`;\n}\nfunction bindModeSwitch() {\n  $('#view').querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {\n    if (M.mode === b.dataset.mode) return;\n    M.mode = b.dataset.mode; try { localStorage.setItem('m-mode', M.mode); } catch (e) {}\n    haptic(); renderMethod();\n  });\n}\nfunction drawMethod() {\n  const d = MD, total = tagTotals();\n  M.sel = M.sel.filter(t => total.has(t));\n  const q = M.q.trim().toLowerCase();\n  const base = d.ideas.filter(i => (!M.book || i.book_title === M.book) && (!q || [i.title, i.text, i.note, i.book_title, i.tags.join(' ')].join(' ').toLowerCase().includes(q)));\n  const res = base.filter(i => M.sel.every(t => i.tags.includes(t)));\n  const facet = new Map(); for (const i of res) for (const t of i.tags) facet.set(t, (facet.get(t) || 0) + 1);\n  let tags = [...total.keys()].sort(M.sort === 'alpha' ? (a, b) => showTag(a).localeCompare(showTag(b), 'ru') : (a, b) => total.get(b) - total.get(a) || a.localeCompare(b));\n  tags = [...M.sel, ...tags.filter(t => !M.sel.includes(t))];\n\n  let h = modeSwitch() + `<div style=\"margin-top:12px\"><input class=\"field\" id=\"mq\" type=\"search\" placeholder=\"Поиск по идеям и заметкам\" value=\"${esc(M.q)}\" autocomplete=\"off\"></div>`;\n  if (tags.length) {\n    h += `<div class=\"mhead\"><span>Теги</span><span><button class=\"lnk\" id=\"msort\">${M.sort === 'alpha' ? 'по алфавиту' : 'по частоте'}</button>${M.sel.length ? ' · <button class=\"lnk\" id=\"mreset\">сбросить</button>' : ''}</span></div><div class=\"tagcloud\">` +\n      tags.map(t => { const on = M.sel.includes(t), n = on ? res.length : (facet.get(t) || 0); return `<button class=\"tg${on ? ' on' : ''}${!on && !n ? ' dim' : ''}\" data-t=\"${esc(t)}\"${!on && !n ? ' disabled' : ''}>${esc(showTag(t))} <small>${n}</small></button>`; }).join('') + '</div>';\n  }\n  const bt = new Map(); for (const i of d.ideas) if (i.book_title) bt.set(i.book_title, (bt.get(i.book_title) || 0) + 1);\n  for (const b of d.books) if (!bt.has(b.title)) bt.set(b.title, 0);\n  if (bt.size > 1 || M.book) h += `<div class=\"chips mbooks\"><button class=\"chip${!M.book ? ' on' : ''}\" data-b=\"\">Все книги</button>${[...bt].map(([t, n]) => `<button class=\"chip${M.book === t ? ' on' : ''}\" data-b=\"${esc(t)}\">${esc(t)} <small>${n}</small></button>`).join('')}</div>`;\n\n  const filtered = M.sel.length || M.book || q;\n  h += `<h2>${filtered ? 'Найдено' : 'Банк идей'}: ${res.length}</h2>`;\n  if (!d.ideas.length) h += '<div class=\"empty\">Здесь появятся идеи из книг. Пришли боту HTML-файл методички, открой его и нажимай «＋ В банк идей» под нужными идеями.</div>';\n  else if (!res.length) h += '<div class=\"empty\">Ничего не нашлось. Попробуй снять один из тегов.</div>';\n  h += res.map(i => `<div class=\"mi\" data-id=\"${i.id}\"><div class=\"row\" style=\"align-items:flex-start\"><div class=\"grow\"><div class=\"mt\">${esc(i.title || (i.text || '').slice(0, 80) || 'Идея')}</div><div class=\"small muted\">${esc(ideaSrc(i))}</div></div><button class=\"more\" aria-label=\"Действия\">⋯</button></div>` +\n    (i.text ? `<div class=\"mtx${M.open.has(i.id) ? ' open' : ''}\">${esc(i.text)}</div>` : '') +\n    (i.note ? `<div class=\"mnote\">${esc(i.note)}</div>` : '') +\n    (i.tags.length ? `<div class=\"mtags\">${i.tags.map(t => `<button class=\"tg sm${M.sel.includes(t) ? ' on' : ''}\" data-t=\"${esc(t)}\">${esc(showTag(t))}</button>`).join('')}</div>` : '') + '</div>').join('');\n  h += `<button class=\"btn ghost wide\" id=\"madd\" style=\"margin-top:12px\">＋ Своя идея</button>`;\n\n  h += `<h2>Книги</h2><div class=\"panel\">` + (d.books.length ? d.books.map(b => {\n    const n = d.ideas.filter(i => i.book === b.id).length;\n    return `<div class=\"row lrow\"><button class=\"lesson grow\" data-bk=\"${b.id}\"><span class=\"ico\"></span><span class=\"grow\"><b>${esc(b.title)}</b>${b.part ? ` <span class=\"muted small\">${esc(b.part)}</span>` : ''}<br><span class=\"small muted\">${b.author ? esc(b.author) + ', ' : ''}в банке ${n}${b.total ? ' из ' + b.total : ''}</span></span></button><button class=\"more\" data-bd=\"${b.id}\" aria-label=\"Действия\">⋯</button></div>`;\n  }).join('') : '<div class=\"empty\">Пришли боту HTML-файл книги, и она появится здесь.</div>') + '</div>';\n\n  if (total.size) h += `<details><summary>Управление тегами</summary><div class=\"panel\">${[...total].sort((a, b) => showTag(a[0]).localeCompare(showTag(b[0]), 'ru')).map(([t, n]) => `<div class=\"trow\"><span class=\"grow\"><b>${esc(showTag(t))}</b> <span class=\"muted small\">${n} ${plural(n, 'идея', 'идеи', 'идей')}</span></span><button class=\"more\" data-tm=\"${esc(t)}\" aria-label=\"Изменить тег\">⋯</button></div>`).join('')}</div><p class=\"hint\">Чтобы объединить два тега, переименуй один в другой.</p></details>`;\n  h += '<p class=\"hint\">В чате с ботом: «#B1 #revision» найдёт идеи по тегам, /tags покажет все теги.</p>';\n\n  const active = document.activeElement && document.activeElement.id === 'mq';\n  $('#view').innerHTML = h;\n  const mq = $('#mq');\n  bindModeSwitch();\n  if (active) { mq.focus(); mq.setSelectionRange(mq.value.length, mq.value.length); }\n  let qt; mq.oninput = () => { M.q = mq.value; clearTimeout(qt); qt = setTimeout(drawMethod, 250); };\n  $('#view').querySelectorAll('[data-t]').forEach(b => b.onclick = () => { const t = b.dataset.t; M.sel = M.sel.includes(t) ? M.sel.filter(x => x !== t) : [...M.sel, t]; haptic(); drawMethod(); });\n  $('#view').querySelectorAll('[data-b]').forEach(b => b.onclick = () => { M.book = b.dataset.b; drawMethod(); });\n  const ms = $('#msort'); if (ms) ms.onclick = () => { M.sort = M.sort === 'alpha' ? 'count' : 'alpha'; drawMethod(); };\n  const mr = $('#mreset'); if (mr) mr.onclick = () => { M.sel = []; drawMethod(); };\n  $('#view').querySelectorAll('.mi').forEach(el => {\n    const i = d.ideas.find(x => x.id === +el.dataset.id);\n    const tx = el.querySelector('.mtx'); if (tx) tx.onclick = () => { tx.classList.toggle('open'); M.open.has(i.id) ? M.open.delete(i.id) : M.open.add(i.id); };\n    el.querySelector('.more').onclick = () => ideaSheet(i);\n  });\n  $('#madd').onclick = () => ideaSheet(null);\n  $('#view').querySelectorAll('[data-bk]').forEach(b => b.onclick = () => { const bk = d.books.find(x => x.id === b.dataset.bk); openBook(bk.id, bk.title); });\n  $('#view').querySelectorAll('[data-bd]').forEach(b => b.onclick = () => openSheet('<h3>Удалить книгу?</h3><p class=\"muted small\">Идеи, которые ты сохранила в банк, останутся.</p><button class=\"danger\" id=\"del\">Удалить книгу</button>', sh => sh.querySelector('#del').onclick = async () => { await api('book.del', { id: b.dataset.bd }); sheetClose(); renderMethod(); }));\n  $('#view').querySelectorAll('[data-tm]').forEach(b => b.onclick = () => tagSheet(b.dataset.tm));\n}\n\nfunction tagEditor(el, chosen, cnt = tagTotals(), groups = MGROUPS) {\n  const sel = new Set(chosen), presets = new Set(groups.flatMap(g => g[1]));\n  const chip = t => `<button class=\"chip${sel.has(t) ? ' on' : ''}\" data-tt=\"${esc(t)}\">${esc(showTag(t))}${cnt.get(t) ? ` <small>${cnt.get(t)}</small>` : ''}</button>`;\n  const draw = () => {\n    const custom = [...new Set([...cnt.keys(), ...sel])].filter(t => !presets.has(t)).sort((a, b) => (cnt.get(b) || 0) - (cnt.get(a) || 0) || a.localeCompare(b));\n    el.innerHTML = groups.map(([g, ts]) => `<div class=\"sect\">${g}</div><div class=\"chips\" style=\"margin-top:0\">${ts.map(chip).join('')}</div>`).join('') +\n      (custom.length ? `<div class=\"sect\">${groups.length ? 'Мои теги' : 'Теги'}</div><div class=\"chips\" style=\"margin-top:0\">${custom.map(chip).join('')}</div>` : '') +\n      `<div class=\"sect\">Новый тег</div><div class=\"addbar\"><input class=\"field\" id=\"ntag\" placeholder=\"например, halloween\" autocomplete=\"off\" autocapitalize=\"off\" enterkeyhint=\"done\"><button class=\"btn ghost\" id=\"ntadd\">Добавить</button></div><div class=\"chips\" id=\"nsug\"></div>`;\n    el.querySelectorAll('[data-tt]').forEach(b => b.onclick = () => { const t = b.dataset.tt; sel.has(t) ? sel.delete(t) : sel.add(t); b.classList.toggle('on', sel.has(t)); });\n    const inp = el.querySelector('#ntag'), sug = el.querySelector('#nsug');\n    const add = v => { const t = normTag(v); if (!t) return; sel.add(t); draw(); };\n    inp.oninput = () => {\n      const v = normTag(inp.value);\n      const known = v ? [...new Set([...cnt.keys(), ...presets])].filter(t => !sel.has(t) && t.includes(v)).slice(0, 6) : [];\n      sug.innerHTML = known.map(t => `<button class=\"chip\" data-g=\"${esc(t)}\">${esc(showTag(t))}${cnt.get(t) ? ` <small>${cnt.get(t)}</small>` : ''}</button>`).join('');\n      sug.querySelectorAll('[data-g]').forEach(b => b.onclick = () => add(b.dataset.g));\n    };\n    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(inp.value); } };\n    el.querySelector('#ntadd').onclick = () => add(inp.value);\n  };\n  draw();\n  return () => { const inp = el.querySelector('#ntag'); if (inp && inp.value.trim()) sel.add(normTag(inp.value)); return [...sel].filter(Boolean); };\n}\n\nfunction ideaSheet(i) {\n  const isNew = !i, own = !i || !i.book;\n  const books = [...new Set(MD.ideas.map(x => x.book_title).concat(MD.books.map(b => b.title)).filter(Boolean))];\n  openSheet(`<h3>${isNew ? 'Своя идея' : esc(i.title || 'Идея')}</h3>${isNew ? '' : `<div class=\"small muted\">${esc(ideaSrc(i))}</div>`}\n    ${own ? `<label class=\"lb\">Название</label><input class=\"field\" id=\"ititle\" value=\"${esc(i ? i.title : '')}\" placeholder=\"Например, Two truths and a lie\">\n      <label class=\"lb\">Описание</label><textarea class=\"field\" id=\"itext\" rows=\"4\" placeholder=\"Подготовка, ход, варианты\">${esc(i ? i.text : '')}</textarea>\n      <div class=\"grid2\"><div><label class=\"lb\">Источник</label><input class=\"field\" id=\"isrc\" list=\"mbooklist\" value=\"${esc(i ? i.book_title : '')}\" placeholder=\"Книга или «своя»\"></div><div><label class=\"lb\">Страница</label><input class=\"field\" id=\"ipage\" value=\"${esc(i ? i.page || '' : '')}\" inputmode=\"numeric\"></div></div>\n      <datalist id=\"mbooklist\">${books.map(b => `<option value=\"${esc(b)}\">`).join('')}</datalist>` : ''}\n    <div id=\"ted\"></div>\n    <div class=\"sect\">Заметка</div><textarea class=\"field\" id=\"inote\" rows=\"3\" placeholder=\"Как прошло, что поменять, сколько минут\">${esc(i ? i.note : '')}</textarea>\n    <button class=\"btn yolk wide\" id=\"isave\" style=\"margin-top:14px\">Сохранить</button>\n    ${i && i.book && MD.books.some(b => b.id === i.book) ? '<button class=\"btn ghost wide\" id=\"iopen\" style=\"margin-top:8px\">Открыть в книге</button>' : ''}\n    ${i ? '<button class=\"danger\" id=\"idel\">Удалить из банка</button>' : ''}`, sh => {\n    const getTags = tagEditor(sh.querySelector('#ted'), i ? i.tags : M.sel);\n    sh.querySelector('#isave').onclick = async () => {\n      const a = { tags: getTags(), note: sh.querySelector('#inote').value };\n      if (own) Object.assign(a, { title: sh.querySelector('#ititle').value, text: sh.querySelector('#itext').value, book_title: sh.querySelector('#isrc').value, page: sh.querySelector('#ipage').value });\n      if (own && !String(a.title).trim() && !String(a.text).trim()) return toast('Напиши название или описание');\n      if (i) a.id = i.id;\n      await api('midea.save', a); haptic('medium'); sheetClose(); toast('Сохранено'); renderMethod();\n    };\n    const op = sh.querySelector('#iopen'); if (op) op.onclick = () => { const b = MD.books.find(x => x.id === i.book); sheetClose(); openBook(b.id, b.title, i.ref); };\n    const dl = sh.querySelector('#idel'); if (dl) dl.onclick = async () => { await api('midea.del', { id: i.id }); sheetClose(); renderMethod(); };\n  });\n}\n\nfunction tagSheet(t) {\n  openSheet(`<h3>Тег «${esc(showTag(t))}»</h3><label class=\"lb\">Новое название</label><input class=\"field\" id=\"tnew\" value=\"${esc(t)}\" autocomplete=\"off\" autocapitalize=\"off\">\n    <p class=\"hint\">Если такой тег уже есть, они объединятся.</p><button class=\"btn wide\" id=\"tsave\" style=\"margin-top:10px\">Переименовать</button><button class=\"danger\" id=\"tdel\">Удалить тег</button><p class=\"hint\">Сами идеи при удалении тега останутся.</p>`, sh => {\n    sh.querySelector('#tsave').onclick = async () => { const to = normTag(sh.querySelector('#tnew').value); if (!to || to === t) return sheetClose(); await api('mtag.rename', { from: t, to }); M.sel = M.sel.map(x => (x === t ? to : x)); sheetClose(); toast('Готово'); renderMethod(); };\n    sh.querySelector('#tdel').onclick = async () => { await api('mtag.rename', { from: t, to: '' }); M.sel = M.sel.filter(x => x !== t); sheetClose(); renderMethod(); };\n  });\n}\n\n\n/* ---------- МЕТОДИКА: ЧТЕНИЕ ---------- */\nconst rtagTotals = () => { const m = new Map(); for (const n of RD.notes) for (const t of n.tags) m.set(t, (m.get(t) || 0) + 1); return m; };\nasync function renderReading() {\n  RD = await api('read');\n  drawReading();\n}\nfunction drawReading() {\n  const d = RD, total = rtagTotals();\n  R.sel = R.sel.filter(t => total.has(t));\n  const q = R.q.trim().toLowerCase();\n  const base = d.notes.filter(n => (!R.book || n.book_title === R.book) && (!q || [n.quote, n.note, n.book_title, n.chapter, n.tags.join(' ')].join(' ').toLowerCase().includes(q)));\n  const res = base.filter(n => R.sel.every(t => n.tags.includes(t)));\n  const facet = new Map(); for (const n of res) for (const t of n.tags) facet.set(t, (facet.get(t) || 0) + 1);\n  let tags = [...total.keys()].sort((a, b) => total.get(b) - total.get(a) || a.localeCompare(b));\n  tags = [...R.sel, ...tags.filter(t => !R.sel.includes(t))];\n  const last = d.books.find(b => b.opened);\n\n  let h = modeSwitch();\n  if (last) h += `<button class=\"cont\" id=\"rcont\"><span class=\"cv\"></span><span class=\"grow\"><span class=\"k\">Продолжить чтение</span><div class=\"tt\">${esc(last.title)}</div><div class=\"pb\"><i style=\"width:${Math.round(last.pct * 100)}%\"></i></div></span><span class=\"k\">${Math.round(last.pct * 100)}%</span></button>`;\n\n  h += `<h2>Книги</h2><div class=\"panel\">` + (d.books.length ? d.books.map(b => `<div class=\"row lrow\"><button class=\"lesson grow\" data-rb=\"${b.id}\"><span class=\"ico\"></span><span class=\"grow\"><b>${esc(b.title)}</b><br><span class=\"small muted\">${b.author ? esc(b.author) + ' · ' : ''}${b.opened ? 'прочитано ' + Math.round(b.pct * 100) + '%' : 'не начата'}${b.notes ? ' · ' + b.notes + ' ' + plural(b.notes, 'заметка', 'заметки', 'заметок') : ''}</span>${b.opened ? `<div class=\"rbar\"><i style=\"width:${Math.round(b.pct * 100)}%\"></i></div>` : ''}</span></button><button class=\"more\" data-rd=\"${b.id}\" aria-label=\"Действия\">⋯</button></div>`).join('') : '<div class=\"empty\">Пришли боту PDF, EPUB или FB2, и книга появится здесь целиком, на языке оригинала.</div>') + '</div>';\n  h += `<button class=\"btn ghost wide upl\" id=\"rupl\" style=\"margin-top:10px\">＋ Загрузить книгу</button><input type=\"file\" id=\"rfile\" accept=\".pdf,.epub,.fb2,.zip,.html,.htm\" hidden>`;\n  h += `<p class=\"hint\">Через бота можно присылать файлы до 20 МБ, через эту кнопку — до 80 МБ.</p>`;\n\n  h += `<h2>Заметки${d.notes.length ? ': ' + (R.sel.length || R.book || q ? res.length + ' из ' + d.notes.length : d.notes.length) : ''}</h2>`;\n  if (d.notes.length) {\n    h += `<input class=\"field\" id=\"rq\" type=\"search\" placeholder=\"Поиск по цитатам и заметкам\" value=\"${esc(R.q)}\" autocomplete=\"off\">`;\n    if (tags.length) h += `<div class=\"mhead\"><span>Теги</span>${R.sel.length ? '<button class=\"lnk\" id=\"rreset\">сбросить</button>' : ''}</div><div class=\"tagcloud\">` +\n      tags.map(t => { const on = R.sel.includes(t), n = on ? res.length : (facet.get(t) || 0); return `<button class=\"tg${on ? ' on' : ''}${!on && !n ? ' dim' : ''}\" data-rt=\"${esc(t)}\"${!on && !n ? ' disabled' : ''}>${esc(showTag(t))} <small>${n}</small></button>`; }).join('') + '</div>';\n    const bt = new Map(); for (const n of d.notes) if (n.book_title) bt.set(n.book_title, (bt.get(n.book_title) || 0) + 1);\n    if (bt.size > 1 || R.book) h += `<div class=\"chips mbooks\"><button class=\"chip${!R.book ? ' on' : ''}\" data-rbk=\"\">Все книги</button>${[...bt].map(([t, n]) => `<button class=\"chip${R.book === t ? ' on' : ''}\" data-rbk=\"${esc(t)}\">${esc(t)} <small>${n}</small></button>`).join('')}</div>`;\n    if (!res.length) h += '<div class=\"empty\">Ничего не нашлось. Попробуй снять один из тегов.</div>';\n    h += res.map(n => `<div class=\"mi\" data-n=\"${n.id}\"><div class=\"row\" style=\"align-items:flex-start\"><div class=\"grow\"><div class=\"rq${R.open.has(n.id) ? ' open' : ''}\">${esc(n.quote)}</div></div><button class=\"more\" aria-label=\"Действия\">⋯</button></div>` +\n      (n.note ? `<div class=\"mnote\">${esc(n.note)}</div>` : '') +\n      `<div class=\"small muted\" style=\"margin-top:8px\">${esc([n.book_title || 'книга удалена', n.chapter, n.page ? 'с. ' + n.page : ''].filter(Boolean).join(' · '))}</div>` +\n      (n.tags.length ? `<div class=\"mtags\">${n.tags.map(t => `<button class=\"tg sm${R.sel.includes(t) ? ' on' : ''}\" data-rt=\"${esc(t)}\">${esc(showTag(t))}</button>`).join('')}</div>` : '') + '</div>').join('');\n  } else h += '<div class=\"empty\">Во время чтения выдели текст пальцем: «Подсветить» сохранит цитату, «Заметка» — цитату с твоей мыслью и тегами.</div>';\n\n  if (total.size) h += `<details><summary>Управление тегами</summary><div class=\"panel\">${[...total].sort((a, b) => showTag(a[0]).localeCompare(showTag(b[0]), 'ru')).map(([t, n]) => `<div class=\"trow\"><span class=\"grow\"><b>${esc(showTag(t))}</b> <span class=\"muted small\">${n} ${plural(n, 'заметка', 'заметки', 'заметок')}</span></span><button class=\"more\" data-rtm=\"${esc(t)}\" aria-label=\"Изменить тег\">⋯</button></div>`).join('')}</div><p class=\"hint\">Чтобы объединить два тега, переименуй один в другой.</p></details>`;\n\n  const active = document.activeElement && document.activeElement.id === 'rq';\n  $('#view').innerHTML = h;\n  bindModeSwitch();\n  const rq = $('#rq');\n  if (rq) { if (active) { rq.focus(); rq.setSelectionRange(rq.value.length, rq.value.length); } let t; rq.oninput = () => { R.q = rq.value; clearTimeout(t); t = setTimeout(drawReading, 250); }; }\n  if (last) $('#rcont').onclick = () => openRead(last.id, last.title);\n  $('#view').querySelectorAll('[data-rb]').forEach(b => b.onclick = () => { const bk = d.books.find(x => x.id === b.dataset.rb); openRead(bk.id, bk.title); });\n  $('#view').querySelectorAll('[data-rd]').forEach(b => b.onclick = () => openSheet('<h3>Удалить книгу?</h3><p class=\"muted small\">Подсветки и заметки из неё останутся в списке заметок.</p><button class=\"danger\" id=\"del\">Удалить книгу</button>', sh => sh.querySelector('#del').onclick = async () => { await api('rbook.del', { id: b.dataset.rd }); sheetClose(); renderReading(); }));\n  $('#view').querySelectorAll('[data-rt]').forEach(b => b.onclick = () => { const t = b.dataset.rt; R.sel = R.sel.includes(t) ? R.sel.filter(x => x !== t) : [...R.sel, t]; haptic(); drawReading(); });\n  $('#view').querySelectorAll('[data-rbk]').forEach(b => b.onclick = () => { R.book = b.dataset.rbk; drawReading(); });\n  const rr = $('#rreset'); if (rr) rr.onclick = () => { R.sel = []; drawReading(); };\n  $('#view').querySelectorAll('[data-n]').forEach(el => {\n    const n = d.notes.find(x => x.id === +el.dataset.n);\n    const qq = el.querySelector('.rq'); qq.onclick = () => { qq.classList.toggle('open'); R.open.has(n.id) ? R.open.delete(n.id) : R.open.add(n.id); };\n    el.querySelector('.more').onclick = () => rnoteSheet(n);\n  });\n  $('#view').querySelectorAll('[data-rtm]').forEach(b => b.onclick = () => rtagSheet(b.dataset.rtm));\n  const inp = $('#rfile');\n  $('#rupl').onclick = () => inp.click();\n  inp.onchange = async () => {\n    const f = inp.files[0]; if (!f) return;\n    const btn = $('#rupl'); btn.disabled = true; btn.textContent = '⏳ Готовлю книгу…';\n    try {\n      const r = await fetch('/upload', { method: 'POST', headers: { 'x-init-data': (TG && TG.initData) || '', 'x-file-name': encodeURIComponent(f.name), 'x-caption': 'чтение' }, body: f });\n      const j = await r.json().catch(() => ({ error: 'Сервер не ответил' }));\n      if (!r.ok || !j.ok) toast(j.error || j.message || 'Не получилось'); else { haptic('medium'); toast('Книга готова'); }\n      if (j.ok && j.kind === 'read') { await renderReading(); openRead(j.id); return; }\n    } catch (e) { toast('Не получилось загрузить файл'); }\n    renderReading();\n  };\n}\nfunction rnoteSheet(n) {\n  openSheet(`<h3>Заметка</h3><div class=\"rq open\" style=\"margin-top:10px\">${esc(n.quote)}</div><div class=\"small muted\" style=\"margin-top:6px\">${esc([n.book_title, n.chapter, n.page ? 'с. ' + n.page : ''].filter(Boolean).join(' · '))}</div>\n    <div class=\"sect\">Заметка</div><textarea class=\"field\" id=\"rnote\" rows=\"4\" placeholder=\"Мысль, вопрос, как применить на уроке\">${esc(n.note)}</textarea>\n    <div id=\"rted\"></div>\n    <button class=\"btn yolk wide\" id=\"rsave\" style=\"margin-top:14px\">Сохранить</button>\n    ${n.book && RD.books.some(b => b.id === n.book) ? '<button class=\"btn ghost wide\" id=\"ropen\" style=\"margin-top:8px\">Открыть в книге</button>' : ''}\n    <button class=\"danger\" id=\"rdel\">Удалить заметку</button>`, sh => {\n    const getTags = tagEditor(sh.querySelector('#rted'), n.tags, rtagTotals(), []);\n    sh.querySelector('#rsave').onclick = async () => { await api('rnote.save', { id: n.id, tags: getTags(), note: sh.querySelector('#rnote').value }); haptic('medium'); sheetClose(); toast('Сохранено'); renderReading(); };\n    const op = sh.querySelector('#ropen'); if (op) op.onclick = () => { const b = RD.books.find(x => x.id === n.book); sheetClose(); openRead(b.id, b.title, 'n' + n.id); };\n    sh.querySelector('#rdel').onclick = async () => { await api('rnote.del', { id: n.id }); sheetClose(); renderReading(); };\n  });\n}\nfunction rtagSheet(t) {\n  openSheet(`<h3>Тег «${esc(showTag(t))}»</h3><label class=\"lb\">Новое название</label><input class=\"field\" id=\"tnew\" value=\"${esc(t)}\" autocomplete=\"off\" autocapitalize=\"off\">\n    <p class=\"hint\">Если такой тег уже есть, они объединятся.</p><button class=\"btn wide\" id=\"tsave\" style=\"margin-top:10px\">Переименовать</button><button class=\"danger\" id=\"tdel\">Удалить тег</button><p class=\"hint\">Сами заметки при удалении тега останутся.</p>`, sh => {\n    sh.querySelector('#tsave').onclick = async () => { const to = normTag(sh.querySelector('#tnew').value); if (!to || to === t) return sheetClose(); await api('rtag.rename', { from: t, to }); R.sel = R.sel.map(x => (x === t ? to : x)); sheetClose(); toast('Готово'); renderReading(); };\n    sh.querySelector('#tdel').onclick = async () => { await api('rtag.rename', { from: t, to: '' }); R.sel = R.sel.filter(x => x !== t); sheetClose(); renderReading(); };\n  });\n}\n\n/* ---------- навигация ---------- */\nconst RENDER = { tasks: renderTasks, cal: renderCal, money: renderMoney, social: renderSocial, lang: renderLang, method: renderMethod };\nfunction go(tab) {\n  S.tab = tab;\n  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));\n  window.scrollTo(0, 0);\n  RENDER[tab]().catch(() => {});\n}\ndocument.querySelectorAll('#tabs button').forEach(b => b.onclick = () => { haptic(); go(b.dataset.tab); });\n\n(async function start() {\n  if (TG) {\n    TG.ready(); TG.expand();\n    try { TG.disableVerticalSwipes && TG.disableVerticalSwipes(); } catch (e) {}\n    const setTheme = () => { document.documentElement.dataset.theme = TG.colorScheme === 'dark' ? 'dark' : 'light'; try { TG.setHeaderColor(TG.colorScheme === 'dark' ? '#1c1c15' : '#e3e3cf'); TG.setBackgroundColor(TG.colorScheme === 'dark' ? '#221f16' : '#f3ecd6'); } catch (e) {} };\n    setTheme(); TG.onEvent('themeChanged', setTheme);\n    TG.BackButton.onClick(goBack);\n  }\n  if (!TG || !TG.initData) {\n    $('#top').innerHTML = ''; document.querySelector('.tabs').style.display = 'none';\n    $('#view').innerHTML = '<div class=\"gate\"><div class=\"dt\">Планер открывается из Telegram</div><p class=\"muted\">Нажми кнопку «Планер» в чате со своим ботом.</p></div>';\n    return;\n  }\n  try { await loadTop(); } catch (e) {\n    document.querySelector('.tabs').style.display = 'none';\n    $('#view').innerHTML = `<div class=\"gate\"><div class=\"dt\">Нет доступа</div><p class=\"muted\">${esc(e.message || 'Открой планер через своего бота.')}</p></div>`; return;\n  }\n  const qs = new URLSearchParams(location.search);\n  const lesson = qs.get('lesson'), book = qs.get('book'), read = qs.get('read');\n  if (qs.get('mode') === 'read' || read) M.mode = 'read';\n  else if (qs.get('tab') === 'method' || book) M.mode = 'ideas';\n  if (qs.get('tags')) { const tg = qs.get('tags').split(',').map(normTag).filter(Boolean); if (M.mode === 'read') R.sel = tg; else M.sel = tg; }\n  go(lesson ? 'lang' : (book || read) ? 'method' : (RENDER[qs.get('tab')] ? qs.get('tab') : 'tasks'));\n  if (read) { const b = await api('rbook.get', { id: read }).catch(() => null); if (b) openRead(b.id, b.title); }\n  if (lesson) { const l = await api('lesson.get', { id: lesson }).catch(() => null); if (l) openLesson(l.id, l.title); }\n  if (book) { const b = await api('book.get', { id: book }).catch(() => null); if (b) openBook(b.id, b.title); }\n})();\n</script>\n</body>\n</html>\n";
const INJECT_JS = "(function () {\n  var LX = window.__LX || { vocab: [] };\n  var V = LX.vocab || [];\n  var inApp = window.parent && window.parent !== window;\n  var added = new Set();\n  var norm = function (s) { return String(s || '').toLowerCase().replace(/[’']/g, \"'\").replace(/\\s+/g, ' ').trim(); };\n  var escH = function (s) { return String(s || '').replace(/[&<>\"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[c]; }); };\n  var defOf = function (v) { return [v.d, v.ru].filter(Boolean).join('\\n'); };\n\n  // ---- интерфейс в shadow DOM, чтобы не задеть стили урока ----\n  var host = document.createElement('div');\n  host.id = 'lx-host';\n  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483000';\n  document.body.appendChild(host);\n  var root = host.attachShadow({ mode: 'open' });\n  var dark = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;\n  root.innerHTML = '<style>' +\n    ':host{all:initial}*{box-sizing:border-box;font-family:\"Onest\",-apple-system,\"Segoe UI\",Roboto,sans-serif}' +\n    '.ui{--bg:#fffaf0;--ink:#2c2817;--soft:#6f684f;--line:rgba(44,40,23,.12);--yolk:#efb21f}' +\n    '.ui.dark{--bg:#2a261b;--ink:#f4ecd6;--soft:#b9ae8d;--line:rgba(244,236,214,.14)}' +\n    'button{font:inherit;cursor:pointer;border:0}' +\n    '.pill{position:fixed;right:14px;bottom:calc(16px + env(safe-area-inset-bottom,0px));pointer-events:auto;background:var(--ink);color:var(--bg);font-weight:700;font-size:15px;padding:12px 18px;border-radius:999px;box-shadow:0 6px 20px rgba(0,0,0,.22);display:flex;gap:8px;align-items:center}' +\n    '.pill i{width:10px;height:10px;border-radius:50%;background:var(--yolk);display:inline-block}' +\n    '.pop{position:fixed;pointer-events:auto;background:var(--bg);color:var(--ink);border-radius:16px;padding:12px 14px;box-shadow:0 10px 30px rgba(0,0,0,.25);max-width:min(340px,calc(100vw - 24px));font-size:15px;line-height:1.4}' +\n    '.pop b{font-size:17px}.pop .ipa{color:var(--soft);font-size:14px;margin-left:4px}.pop .d{margin-top:6px;white-space:pre-line}.pop .row{display:flex;gap:8px;margin-top:10px}' +\n    '.btn{background:var(--yolk);color:#3b2a00;font-weight:700;padding:10px 14px;border-radius:12px;font-size:15px}.btn.ghost{background:transparent;color:var(--soft)}.btn.done{background:var(--line);color:var(--soft)}' +\n    '.sel{position:fixed;pointer-events:auto;background:var(--ink);color:var(--bg);font-weight:700;font-size:14px;padding:9px 14px;border-radius:12px;box-shadow:0 6px 18px rgba(0,0,0,.25)}' +\n    '.panel{position:fixed;left:0;right:0;bottom:0;max-height:72vh;overflow:auto;pointer-events:auto;background:var(--bg);color:var(--ink);border-radius:22px 22px 0 0;padding:16px 16px calc(18px + env(safe-area-inset-bottom,0px));box-shadow:0 -8px 30px rgba(0,0,0,.2)}' +\n    '.panel h3{margin:0 0 4px;font-size:19px}.panel .sub{color:var(--soft);font-size:14px;margin-bottom:10px}' +\n    '.it{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--line)}.it:last-child{border-bottom:0}.it .g{flex:1;min-width:0}.it .t{font-weight:700}.it .x{font-size:14px;color:var(--soft);white-space:pre-line}' +\n    '.add{width:36px;height:36px;border-radius:50%;background:var(--yolk);color:#3b2a00;font-size:20px;font-weight:700;flex:none}.add.done{background:var(--line);color:var(--soft);font-size:16px}' +\n    '.head{display:flex;gap:8px;align-items:center;justify-content:space-between}' +\n    'input,textarea{width:100%;font:inherit;font-size:15px;padding:10px 12px;border-radius:12px;border:1.5px solid var(--line);background:transparent;color:var(--ink);margin-top:6px}' +\n    'label{font-size:13px;color:var(--soft);display:block;margin-top:8px}' +\n    '</style><div class=\"ui' + (dark ? ' dark' : '') + '\" id=\"ui\"></div>';\n  var ui = root.getElementById('ui');\n  var pill = null, pop = null, selBtn = null, panel = null;\n\n  function send(items) {\n    if (!inApp) { alert('Открой урок через планер в Telegram, чтобы сохранять слова.'); return; }\n    window.parent.postMessage({ lx: 'add', items: items }, location.origin);\n  }\n  function close(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }\n  function closeAll() { close(pop); pop = null; close(selBtn); selBtn = null; close(panel); panel = null; }\n\n  // ---- подсветка через CSS Highlight API (не меняет разметку урока) ----\n  var supported = !!(window.CSS && CSS.highlights && window.Highlight);\n  var style = document.createElement('style');\n  style.textContent = '::highlight(lx){background-color:rgba(247,196,58,.5);color:inherit}::highlight(lx-done){background-color:rgba(84,133,65,.22);color:inherit}';\n  document.head.appendChild(style);\n  var patterns = [];\n  V.forEach(function (v, i) {\n    (v.k && v.k.length ? v.k : [norm(v.t)]).forEach(function (k) {\n      var ws = k.split(/\\s+/).filter(Boolean);\n      if (!ws.length) return;\n      var src = ws.map(function (w) {\n        var e = w.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&').replace(/'/g, \"['’]\");\n        return w.length >= 3 && /^[a-z']+$/.test(w) ? e + \"(?:s|es|ed|d|ing|ly)?\" : e;\n      }).join('\\\\s+');\n      patterns.push({ re: new RegExp('(^|[^a-z])(' + src + ')(?![a-z])', 'gi'), i: i, len: k.length });\n    });\n  });\n  patterns.sort(function (a, b) { return b.len - a.len; });\n  var spans = [];\n  function build() {\n    if (!supported || !patterns.length) return;\n    spans = [];\n    var hl = new Highlight(), hd = new Highlight();\n    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {\n      acceptNode: function (n) {\n        var p = n.parentElement;\n        if (!p || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;\n        if (p.closest('script,style,textarea,input,select,option,noscript,#lx-host')) return NodeFilter.FILTER_REJECT;\n        return NodeFilter.FILTER_ACCEPT;\n      }\n    });\n    var n, count = 0;\n    while ((n = walker.nextNode()) && count < 4000) {\n      var text = n.nodeValue, taken = [];\n      for (var p = 0; p < patterns.length; p++) {\n        var pt = patterns[p], m;\n        pt.re.lastIndex = 0;\n        while ((m = pt.re.exec(text))) {\n          var s = m.index + m[1].length, e = s + m[2].length;\n          if (!taken.some(function (r) { return s < r[1] && e > r[0]; })) {\n            taken.push([s, e]);\n            var r = document.createRange(); r.setStart(n, s); r.setEnd(n, e);\n            var isDone = added.has(norm(V[pt.i].t));\n            (isDone ? hd : hl).add(r);\n            spans.push({ r: r, i: pt.i }); count++;\n          }\n          if (pt.re.lastIndex === m.index) pt.re.lastIndex++;\n        }\n      }\n    }\n    CSS.highlights.set('lx', hl);\n    CSS.highlights.set('lx-done', hd);\n  }\n  var t;\n  function schedule() { clearTimeout(t); t = setTimeout(build, 350); }\n  new MutationObserver(function (list) {\n    if (list.every(function (m) { return host.contains(m.target) || m.target === host; })) return;\n    schedule();\n  }).observe(document.body, { childList: true, subtree: true, characterData: true });\n\n  function caretAt(x, y) {\n    if (document.caretPositionFromPoint) { var c = document.caretPositionFromPoint(x, y); return c && { node: c.offsetNode, off: c.offset }; }\n    if (document.caretRangeFromPoint) { var r = document.caretRangeFromPoint(x, y); return r && { node: r.startContainer, off: r.startOffset }; }\n    return null;\n  }\n  function place(el, x, y) {\n    ui.appendChild(el);\n    var w = el.offsetWidth, h = el.offsetHeight;\n    var left = Math.max(12, Math.min(x - w / 2, innerWidth - w - 12));\n    var top = y + 14 + h > innerHeight - 70 ? y - h - 14 : y + 14;\n    el.style.left = left + 'px'; el.style.top = Math.max(8, top) + 'px';\n  }\n  function showPop(v, x, y) {\n    closeAll();\n    var has = added.has(norm(v.t));\n    pop = document.createElement('div'); pop.className = 'pop';\n    pop.innerHTML = '<b>' + escH(v.t) + '</b>' + (v.ipa ? '<span class=\"ipa\">' + escH(v.ipa) + '</span>' : '') +\n      (defOf(v) ? '<div class=\"d\">' + escH(defOf(v)) + '</div>' : '') +\n      '<div class=\"row\">' + (has ? '<button class=\"btn done\" disabled>Уже в повторении</button>' : '<button class=\"btn\" data-a>Повторить позже</button>') + '<button class=\"btn ghost\" data-c>Закрыть</button></div>';\n    place(pop, x, y);\n    var a = pop.querySelector('[data-a]');\n    if (a) a.onclick = function () { send([{ term: v.t, def: defOf(v) }]); a.textContent = 'Добавлено'; a.className = 'btn done'; setTimeout(closeAll, 700); };\n    pop.querySelector('[data-c]').onclick = closeAll;\n  }\n  document.addEventListener('click', function (e) {\n    if (e.composedPath().indexOf(host) >= 0) return;\n    if (!spans.length) { if (pop) closeAll(); return; }\n    var c = caretAt(e.clientX, e.clientY);\n    if (!c) return;\n    for (var i = 0; i < spans.length; i++) {\n      var r = spans[i].r;\n      try {\n        if (r.startContainer === c.node && c.off >= r.startOffset && c.off <= r.endOffset) { showPop(V[spans[i].i], e.clientX, e.clientY); return; }\n      } catch (err) {}\n    }\n    if (pop) closeAll();\n  }, true);\n\n  // ---- выделение текста -> «Повторить позже» ----\n  var st;\n  document.addEventListener('selectionchange', function () {\n    clearTimeout(st);\n    st = setTimeout(function () {\n      var s = document.getSelection();\n      var txt = s && s.toString().replace(/\\s+/g, ' ').trim();\n      if (!txt || txt.length < 2 || txt.length > 90 || s.rangeCount === 0) { close(selBtn); selBtn = null; return; }\n      var rect = s.getRangeAt(0).getBoundingClientRect();\n      close(selBtn);\n      selBtn = document.createElement('button'); selBtn.className = 'sel'; selBtn.textContent = '+ Повторить позже';\n      place(selBtn, rect.left + rect.width / 2, rect.bottom + 30);\n      selBtn.onmousedown = function (e) { e.preventDefault(); };\n      selBtn.onclick = function () { openForm(txt); };\n    }, 300);\n  });\n  function openForm(txt) {\n    closeAll();\n    var known = V.find(function (v) { return norm(v.t) === norm(txt) || (v.k || []).indexOf(norm(txt)) >= 0; });\n    panel = document.createElement('div'); panel.className = 'panel';\n    panel.innerHTML = '<div class=\"head\"><h3>Повторить позже</h3><button class=\"btn ghost\" data-c>Отмена</button></div>' +\n      '<label>Слово или выражение</label><input id=\"ft\" value=\"' + escH(known ? known.t : txt) + '\">' +\n      '<label>Значение или перевод</label><textarea id=\"fd\" rows=\"3\" placeholder=\"Можно оставить пустым и дописать потом\">' + escH(known ? defOf(known) : '') + '</textarea>' +\n      '<div style=\"margin-top:12px\"><button class=\"btn\" data-s style=\"width:100%\">Сохранить</button></div>';\n    ui.appendChild(panel);\n    panel.querySelector('[data-c]').onclick = closeAll;\n    panel.querySelector('[data-s]').onclick = function () {\n      var term = panel.querySelector('#ft').value.trim(); if (!term) return;\n      send([{ term: term, def: panel.querySelector('#fd').value.trim() }]);\n      try { document.getSelection().removeAllRanges(); } catch (e) {}\n      closeAll();\n    };\n  }\n\n  // ---- кнопка со списком всей лексики ----\n  function openList() {\n    closeAll();\n    panel = document.createElement('div'); panel.className = 'panel';\n    var left = V.filter(function (v) { return !added.has(norm(v.t)); });\n    panel.innerHTML = '<div class=\"head\"><h3>Лексика урока</h3><button class=\"btn ghost\" data-c>Закрыть</button></div>' +\n      '<div class=\"sub\">' + (supported ? 'В тексте она подсвечена жёлтым. ' : '') + 'Выдели любое другое слово, чтобы добавить и его.</div>' +\n      (left.length > 1 ? '<button class=\"btn\" data-all style=\"width:100%;margin-bottom:6px\">Добавить все (' + left.length + ')</button>' : '') +\n      V.map(function (v, i) {\n        var has = added.has(norm(v.t));\n        return '<div class=\"it\"><div class=\"g\"><div class=\"t\">' + escH(v.t) + '</div>' + (defOf(v) ? '<div class=\"x\">' + escH(defOf(v)) + '</div>' : '') + '</div><button class=\"add' + (has ? ' done' : '') + '\" data-i=\"' + i + '\" aria-label=\"Добавить\">' + (has ? '✓' : '+') + '</button></div>';\n      }).join('');\n    ui.appendChild(panel);\n    panel.querySelector('[data-c]').onclick = closeAll;\n    var all = panel.querySelector('[data-all]');\n    if (all) all.onclick = function () { send(left.map(function (v) { return { term: v.t, def: defOf(v) }; })); all.textContent = 'Добавлено'; all.disabled = true; };\n    panel.querySelectorAll('[data-i]').forEach(function (b) {\n      b.onclick = function () {\n        var v = V[+b.dataset.i]; if (added.has(norm(v.t))) return;\n        send([{ term: v.t, def: defOf(v) }]); b.textContent = '✓'; b.className = 'add done';\n      };\n    });\n  }\n  function drawPill() {\n    if (!V.length) return;\n    if (!pill) { pill = document.createElement('button'); pill.className = 'pill'; pill.onclick = openList; ui.appendChild(pill); }\n    var left = V.filter(function (v) { return !added.has(norm(v.t)); }).length;\n    pill.innerHTML = '<i></i>Лексика: ' + (left ? left : 'всё добавлено');\n  }\n\n  window.addEventListener('message', function (e) {\n    if (e.origin !== location.origin || !e.data || e.data.lx !== 'terms') return;\n    added = new Set(e.data.terms || []);\n    drawPill(); build();\n  });\n  drawPill();\n  if (document.readyState === 'complete') build(); else window.addEventListener('load', build);\n  setTimeout(build, 1200);\n  if (inApp) window.parent.postMessage({ lx: 'hello' }, location.origin);\n})();\n";
const INJECT_BOOK_JS = "(function () {\n  var BK = window.__BK || {};\n  var inApp = window.parent && window.parent !== window;\n  var GROUPS = [\n    ['Уровень', ['a1', 'a2', 'b1', 'b2', 'c1', 'c2']],\n    ['Навык', ['speaking', 'listening', 'reading', 'writing', 'grammar', 'vocabulary', 'pronunciation']],\n    ['Тип', ['warm-up', 'game', 'filler', 'revision', 'project', 'homework']],\n    ['Для кого', ['kids', 'teens', 'adults', '1-to-1', 'group']],\n    ['Формат', ['online', 'offline']]\n  ];\n  var PRESET = {}; GROUPS.forEach(function (g) { g[1].forEach(function (t) { PRESET[t] = 1; }); });\n  function normTag(s) { return String(s || '').trim().replace(/^#+/, '').toLowerCase().replace(/[\\s_]+/g, '-').replace(/[,;\"'<>#]+/g, '').replace(/^-+|-+$/g, '').slice(0, 40); }\n  function showTag(t) { return /^[abc][12]\\+?$/.test(t) ? t.toUpperCase() : t; }\n  function escH(s) { return String(s == null ? '' : s).replace(/[&<>\"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[c]; }); }\n  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }\n  var state = { saved: {}, tags: [] };\n  var FONT = '-apple-system,\"Segoe UI\",Roboto,sans-serif';\n\n  // ---- оформление идей в самой книге ----\n  var css = document.createElement('style');\n  css.textContent =\n    '.lx-idea{scroll-margin-top:20px;box-shadow:inset 3px 0 0 rgba(239,178,31,.9);transition:background-color .4s}' +\n    '.lx-idea.lx-saved{box-shadow:inset 3px 0 0 rgba(84,133,65,.9)}' +\n    '.lx-idea.lx-flash{background-color:rgba(247,196,58,.28)!important}' +\n    '.lx-bar{all:initial;display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:12px 0 4px;cursor:pointer}' +\n    '.lx-bar .lx-b{all:initial;cursor:pointer;font:700 14px/1 ' + FONT + ';padding:10px 15px;border-radius:999px;background:#2c2817;color:#fffaf0}' +\n    '.lx-bar.lx-on .lx-b{background:rgba(84,133,65,.16);color:#3d6b2c}' +\n    '.lx-bar .lx-t{all:initial;font:600 12px/1 ' + FONT + ';padding:6px 8px;border-radius:7px;background:rgba(84,133,65,.12);color:#3d6b2c}' +\n    '.lx-bar .lx-n{all:initial;font:400 13px/1.3 ' + FONT + ';color:#6f684f;flex-basis:100%;margin-top:2px}';\n  document.head.appendChild(css);\n\n  var els = Array.prototype.slice.call(document.querySelectorAll('.idea, [data-idea]'));\n  els = els.filter(function (el) { return !els.some(function (o) { return o !== el && o.contains(el); }); });\n  var items = els.map(function (el, i) {\n    var ref = el.getAttribute('data-id') || ('i' + (i + 1));\n    el.classList.add('lx-idea');\n    var bar = document.createElement('div');\n    bar.className = 'lx-bar';\n    el.appendChild(bar);\n    var it = { ref: ref, el: el, bar: bar };\n    bar.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); openPanel(extract(it)); });\n    return it;\n  });\n\n  function pageOf(node) {\n    var el = node && (node.nodeType === 1 ? node : node.parentElement);\n    var p = el && el.closest('[data-page]');\n    return p ? p.getAttribute('data-page') : '';\n  }\n  function extract(it) {\n    var el = it.el;\n    it.bar.style.display = 'none';\n    var h = el.querySelector('h1,h2,h3,h4,h5,h6,.idea-title');\n    var title = (el.getAttribute('data-title') || (h ? (h.innerText || h.textContent) : '') || '').replace(/\\s+/g, ' ').trim();\n    var text = (el.innerText || '').trim() || (el.textContent || '').trim();\n    it.bar.style.display = '';\n    if (h) {\n      var ht = (h.innerText || h.textContent || '').trim();\n      if (ht && text.indexOf(ht) === 0) text = text.slice(ht.length).trim();\n    }\n    text = text.replace(/[ \\t]+\\n/g, '\\n').replace(/\\n{3,}/g, '\\n\\n');\n    if (!title) title = text.split('\\n')[0].slice(0, 80);\n    var sug = (el.getAttribute('data-tags') || '').split(/[,;]/).map(normTag).filter(Boolean);\n    return { ref: it.ref, title: title.slice(0, 200), text: text, page: pageOf(el) || '', sug: sug };\n  }\n\n  function drawBars() {\n    items.forEach(function (it) {\n      var s = state.saved[it.ref];\n      it.el.classList.toggle('lx-saved', !!s);\n      it.bar.className = 'lx-bar' + (s ? ' lx-on' : '');\n      it.bar.innerHTML = s\n        ? '<span class=\"lx-b\">✓ В банке</span>' + s.tags.map(function (t) { return '<span class=\"lx-t\">' + escH(showTag(t)) + '</span>'; }).join('') +\n          (s.note ? '<span class=\"lx-n\">📝 ' + escH(s.note) + '</span>' : '')\n        : '<span class=\"lx-b\">＋ В банк идей</span>';\n    });\n    drawPill();\n  }\n\n  // ---- интерфейс в shadow DOM ----\n  var host = document.createElement('div');\n  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483000';\n  document.body.appendChild(host);\n  var root = host.attachShadow({ mode: 'open' });\n  var dark = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;\n  root.innerHTML = '<style>' +\n    ':host{all:initial}*{box-sizing:border-box;font-family:\"Onest\",' + FONT + '}' +\n    '.ui{--bg:#fffaf0;--ink:#2c2817;--soft:#6f684f;--line:rgba(44,40,23,.12);--chip:rgba(44,40,23,.06);--yolk:#efb21f;--ok:#548541}' +\n    '.ui.dark{--bg:#2a261b;--ink:#f4ecd6;--soft:#b9ae8d;--line:rgba(244,236,214,.14);--chip:rgba(244,236,214,.08);--ok:#8fc178}' +\n    'button{font:inherit;cursor:pointer;border:0;color:inherit}' +\n    '.scrim{position:fixed;inset:0;background:rgba(30,26,12,.35);pointer-events:auto}' +\n    '.panel{position:fixed;left:0;right:0;bottom:0;max-height:86vh;overflow:auto;pointer-events:auto;background:var(--bg);color:var(--ink);border-radius:22px 22px 0 0;padding:16px 16px calc(18px + env(safe-area-inset-bottom,0px));box-shadow:0 -8px 30px rgba(0,0,0,.2);max-width:600px;margin:0 auto;font-size:15px;line-height:1.4}' +\n    '.head{display:flex;gap:10px;align-items:flex-start;justify-content:space-between}.head h3{margin:0;font-size:18px;line-height:1.25}' +\n    '.sub{color:var(--soft);font-size:13px;margin-top:3px}' +\n    '.sect{font-size:13px;color:var(--soft);margin:14px 2px 6px}' +\n    '.chips{display:flex;flex-wrap:wrap;gap:6px}' +\n    '.chip{padding:7px 11px;border-radius:999px;background:var(--chip);font-size:14px;font-weight:500;border:1.5px solid transparent}' +\n    '.chip small{color:var(--soft);font-weight:500;margin-left:2px}' +\n    '.chip.on{border-color:var(--ink);font-weight:700;background:transparent}' +\n    '.row{display:flex;gap:8px}' +\n    'input,textarea{width:100%;font:inherit;font-size:15px;padding:10px 12px;border-radius:12px;border:1.5px solid var(--line);background:transparent;color:var(--ink);outline:none}' +\n    'input:focus,textarea:focus{border-color:var(--yolk)}' +\n    '.btn{background:var(--ink);color:var(--bg);font-weight:700;padding:12px 16px;border-radius:12px;white-space:nowrap}' +\n    '.btn.y{background:var(--yolk);color:#3b2a00;width:100%;margin-top:14px;padding:14px}' +\n    '.ghost{background:transparent;color:var(--soft);font-weight:600;padding:6px 4px}' +\n    '.red{color:#cf4526;font-weight:700;padding:14px 4px 2px}' +\n    '.pill{position:fixed;right:14px;bottom:calc(16px + env(safe-area-inset-bottom,0px));pointer-events:auto;background:var(--ink);color:var(--bg);font-weight:700;font-size:15px;padding:12px 18px;border-radius:999px;box-shadow:0 6px 20px rgba(0,0,0,.22);display:flex;gap:8px;align-items:center}' +\n    '.pill i{width:10px;height:10px;border-radius:50%;background:var(--yolk);display:inline-block}' +\n    '.sel{position:fixed;pointer-events:auto;background:var(--ink);color:var(--bg);font-weight:700;font-size:14px;padding:9px 14px;border-radius:12px;box-shadow:0 6px 18px rgba(0,0,0,.25)}' +\n    '.li{display:flex;gap:10px;align-items:center;width:100%;text-align:left;padding:11px 2px;border-bottom:1px solid var(--line);background:none}' +\n    '.li:last-child{border-bottom:0}.li .d{width:10px;height:10px;border-radius:50%;background:var(--yolk);flex:none}.li .d.on{background:var(--ok)}' +\n    '.li .g{flex:1;min-width:0}.li .p{color:var(--soft);font-size:13px}' +\n    '.toast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:10px 16px;border-radius:12px;font-weight:600;font-size:14px;pointer-events:none}' +\n    '</style><div class=\"ui' + (dark ? ' dark' : '') + '\" id=\"ui\"></div>';\n  var ui = root.getElementById('ui');\n  var layer = null, selBtn = null, pill = null;\n  function close(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }\n  function closeLayer() { close(layer); layer = null; }\n  function toast(msg) { var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; ui.appendChild(t); setTimeout(function () { close(t); }, 1800); }\n  function sheet(html) {\n    closeLayer(); close(selBtn); selBtn = null;\n    layer = document.createElement('div');\n    layer.innerHTML = '<div class=\"scrim\"></div><div class=\"panel\">' + html + '</div>';\n    ui.appendChild(layer);\n    layer.querySelector('.scrim').onclick = closeLayer;\n    return layer.querySelector('.panel');\n  }\n  function counts() { var m = {}; state.tags.forEach(function (x) { m[x.t] = x.n; }); return m; }\n\n  function openPanel(idea) {\n    if (!inApp) { alert('Открой книгу через «Методику» в планере, чтобы сохранять идеи.'); return; }\n    var saved = state.saved[idea.ref];\n    var sel = {}; (saved ? saved.tags : idea.sug).forEach(function (t) { sel[t] = 1; });\n    var cnt = counts();\n    var p = sheet(\n      '<div class=\"head\"><div><h3>' + escH(idea.title || 'Идея') + '</h3><div class=\"sub\">' + escH(BK.title || '') + (idea.page ? ', с. ' + escH(idea.page) : '') + '</div></div><button class=\"ghost\" data-c>Закрыть</button></div>' +\n      '<div id=\"tags\"></div>' +\n      '<div class=\"sect\">Новый тег</div><div class=\"row\"><input id=\"nt\" placeholder=\"например, halloween\" autocomplete=\"off\" autocapitalize=\"off\" enterkeyhint=\"done\"><button class=\"btn\" data-nt>Добавить</button></div>' +\n      '<div class=\"chips\" id=\"sug\" style=\"margin-top:6px\"></div>' +\n      '<div class=\"sect\">Заметка</div><textarea id=\"note\" rows=\"3\" placeholder=\"Как прошло, что поменять, сколько минут\">' + escH(saved ? saved.note : '') + '</textarea>' +\n      '<button class=\"btn y\" data-s>' + (saved ? 'Сохранить изменения' : 'Сохранить в банк') + '</button>' +\n      (saved ? '<button class=\"red\" data-d>Убрать из банка</button>' : ''));\n    var box = p.querySelector('#tags'), nt = p.querySelector('#nt'), sug = p.querySelector('#sug');\n    function chip(t) { return '<button class=\"chip' + (sel[t] ? ' on' : '') + '\" data-t=\"' + escH(t) + '\">' + escH(showTag(t)) + (cnt[t] ? ' <small>' + cnt[t] + '</small>' : '') + '</button>'; }\n    function draw() {\n      var custom = Object.keys(cnt).concat(Object.keys(sel)).filter(function (t, i, a) { return !PRESET[t] && a.indexOf(t) === i; });\n      custom.sort(function (a, b) { return (cnt[b] || 0) - (cnt[a] || 0) || a.localeCompare(b); });\n      box.innerHTML = GROUPS.map(function (g) { return '<div class=\"sect\">' + g[0] + '</div><div class=\"chips\">' + g[1].map(chip).join('') + '</div>'; }).join('') +\n        (custom.length ? '<div class=\"sect\">Мои теги</div><div class=\"chips\">' + custom.map(chip).join('') + '</div>' : '');\n      box.querySelectorAll('[data-t]').forEach(function (b) {\n        b.onclick = function () { var t = b.getAttribute('data-t'); if (sel[t]) delete sel[t]; else sel[t] = 1; b.classList.toggle('on', !!sel[t]); };\n      });\n    }\n    function add(t) { t = normTag(t); if (!t) return; sel[t] = 1; nt.value = ''; sug.innerHTML = ''; draw(); }\n    nt.oninput = function () {\n      var v = normTag(nt.value);\n      if (!v) { sug.innerHTML = ''; return; }\n      var known = Object.keys(cnt).concat(Object.keys(PRESET)).filter(function (t, i, a) { return a.indexOf(t) === i && !sel[t] && t.indexOf(v) >= 0; }).slice(0, 6);\n      sug.innerHTML = known.map(function (t) { return '<button class=\"chip\" data-g=\"' + escH(t) + '\">' + escH(showTag(t)) + (cnt[t] ? ' <small>' + cnt[t] + '</small>' : '') + '</button>'; }).join('');\n      sug.querySelectorAll('[data-g]').forEach(function (b) { b.onclick = function () { add(b.getAttribute('data-g')); }; });\n    };\n    nt.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); add(nt.value); } };\n    p.querySelector('[data-nt]').onclick = function () { add(nt.value); };\n    p.querySelector('[data-c]').onclick = closeLayer;\n    p.querySelector('[data-s]').onclick = function () {\n      if (nt.value.trim()) add(nt.value);\n      window.parent.postMessage({ lx: 'msave', item: { ref: idea.ref, title: idea.title, text: idea.text, page: idea.page, tags: Object.keys(sel), note: p.querySelector('#note').value.trim() } }, location.origin);\n      closeLayer(); toast('Сохранено в банк идей');\n    };\n    var d = p.querySelector('[data-d]');\n    if (d) d.onclick = function () { window.parent.postMessage({ lx: 'mdel', ref: idea.ref }, location.origin); closeLayer(); toast('Убрано из банка'); };\n    draw();\n  }\n\n  // ---- список идей книги ----\n  function drawPill() {\n    if (!items.length) return;\n    if (!pill) { pill = document.createElement('button'); pill.className = 'pill'; pill.onclick = openList; ui.appendChild(pill); }\n    var n = items.filter(function (it) { return state.saved[it.ref]; }).length;\n    pill.innerHTML = '<i></i>Идеи: ' + items.length + (n ? ' · в банке ' + n : '');\n  }\n  function openList() {\n    var p = sheet('<div class=\"head\"><h3>Идеи в книге</h3><button class=\"ghost\" data-c>Закрыть</button></div><div class=\"sub\">Нажми, чтобы перейти к идее. Зелёные уже в банке.</div><div id=\"l\" style=\"margin-top:8px\"></div>');\n    p.querySelector('[data-c]').onclick = closeLayer;\n    var l = p.querySelector('#l');\n    l.innerHTML = items.map(function (it, i) {\n      var h = it.el.querySelector('h1,h2,h3,h4,h5,h6,.idea-title');\n      var t = (it.el.getAttribute('data-title') || (h ? h.textContent : '') || ('Идея ' + (i + 1))).replace(/\\s+/g, ' ').trim();\n      var pg = pageOf(it.el);\n      return '<button class=\"li\" data-i=\"' + i + '\"><span class=\"d' + (state.saved[it.ref] ? ' on' : '') + '\"></span><span class=\"g\">' + escH(t) + (pg ? ' <span class=\"p\">с. ' + escH(pg) + '</span>' : '') + '</span></button>';\n    }).join('');\n    l.querySelectorAll('[data-i]').forEach(function (b) { b.onclick = function () { closeLayer(); jump(items[+b.getAttribute('data-i')]); }; });\n  }\n  function jump(it) {\n    if (!it) return;\n    it.el.scrollIntoView({ behavior: 'smooth', block: 'start' });\n    it.el.classList.add('lx-flash'); setTimeout(function () { it.el.classList.remove('lx-flash'); }, 1600);\n  }\n\n  // ---- выделение любого фрагмента -> идея ----\n  var st;\n  document.addEventListener('selectionchange', function () {\n    clearTimeout(st);\n    st = setTimeout(function () {\n      var s = document.getSelection();\n      var txt = s && s.toString().trim();\n      if (layer || !txt || txt.length < 3 || txt.length > 6000 || s.rangeCount === 0) { close(selBtn); selBtn = null; return; }\n      var rect = s.getRangeAt(0).getBoundingClientRect();\n      var node = s.anchorNode;\n      close(selBtn);\n      selBtn = document.createElement('button'); selBtn.className = 'sel'; selBtn.textContent = '＋ Сохранить как идею';\n      ui.appendChild(selBtn);\n      var w = selBtn.offsetWidth, y = rect.bottom + 12;\n      if (y + 50 > innerHeight - 70) y = Math.max(8, rect.top - 52);\n      selBtn.style.left = Math.max(12, Math.min(rect.left + rect.width / 2 - w / 2, innerWidth - w - 12)) + 'px';\n      selBtn.style.top = y + 'px';\n      selBtn.onmousedown = function (e) { e.preventDefault(); };\n      selBtn.onclick = function () {\n        var clean = txt.replace(/[ \\t]+\\n/g, '\\n').replace(/\\n{3,}/g, '\\n\\n');\n        var host = node && (node.nodeType === 1 ? node : node.parentElement);\n        var idea = host && host.closest('.lx-idea');\n        openPanel({ ref: 'f' + hash(clean), title: clean.split('\\n')[0].slice(0, 80), text: clean, page: pageOf(node), sug: idea ? (idea.getAttribute('data-tags') || '').split(/[,;]/).map(normTag).filter(Boolean) : [] });\n        try { document.getSelection().removeAllRanges(); } catch (e) {}\n      };\n    }, 300);\n  });\n\n  window.addEventListener('message', function (e) {\n    if (e.origin !== location.origin || !e.data || e.data.lx !== 'mstate') return;\n    state = { saved: e.data.saved || {}, tags: e.data.tags || [] };\n    drawBars();\n  });\n  drawBars();\n  if (location.hash) {\n    var ref = decodeURIComponent(location.hash.slice(1));\n    setTimeout(function () { jump(items.filter(function (it) { return it.ref === ref; })[0]); }, 400);\n  }\n  if (inApp) window.parent.postMessage({ lx: 'mhello' }, location.origin);\n})();\n";
const INJECT_READ_JS = "(function () {\n  var RB = window.__RB || {};\n  var inApp = window.parent && window.parent !== window;\n  var FONT = '-apple-system,\"Segoe UI\",Roboto,sans-serif';\n  var qs = new URLSearchParams(location.search);\n  if (qs.get('theme') === 'dark') document.documentElement.setAttribute('data-theme', 'dark');\n  function normTag(s) { return String(s || '').trim().replace(/^#+/, '').toLowerCase().replace(/[\\s_]+/g, '-').replace(/[,;\"'<>#]+/g, '').replace(/^-+|-+$/g, '').slice(0, 40); }\n  function showTag(t) { return /^[abc][12]\\+?$/.test(t) ? t.toUpperCase() : t; }\n  function escH(s) { return String(s == null ? '' : s).replace(/[&<>\"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[c]; }); }\n  function post(m) { if (inApp) window.parent.postMessage(m, location.origin); }\n  var state = { notes: [], tags: [], pos: 0 };\n\n  // ---- размер шрифта ----\n  var fsz = 100;\n  try { fsz = +localStorage.getItem('rd-font') || 100; } catch (e) {}\n  var fstyle = document.createElement('style');\n  document.head.appendChild(fstyle);\n  function applyFont() { fstyle.textContent = 'html{font-size:' + fsz + '% !important}'; }\n  applyFont();\n  var hstyle = document.createElement('style');\n  hstyle.textContent = '::highlight(rn){background-color:rgba(247,196,58,.42);color:inherit}::highlight(rn-note){background-color:rgba(247,196,58,.42);text-decoration:underline;text-decoration-color:#c9890c;text-decoration-thickness:2px;text-underline-offset:3px;color:inherit}' +\n    '.rd-flash{background-color:rgba(247,196,58,.25)!important;transition:background-color .6s}';\n  document.head.appendChild(hstyle);\n\n  // ---- блоки текста ----\n  var SEL = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,figcaption,td,th,dd,dt';\n  var host = document.createElement('div');\n  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483000';\n  var cand = Array.prototype.slice.call(document.body.querySelectorAll(SEL));\n  var blocks = cand.filter(function (el) { return !el.querySelector(SEL); });\n  var idx = new Map(); blocks.forEach(function (b, i) { idx.set(b, i); });\n  var pageAt = [], chapAt = [], pg = '', ch = '';\n  blocks.forEach(function (b, i) {\n    var p = b.getAttribute('data-page') || (b.closest('[data-page]') && b.closest('[data-page]').getAttribute('data-page'));\n    if (p) pg = p;\n    if (/^H[1-3]$/.test(b.tagName) && !b.classList.contains('bt')) ch = (b.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 120);\n    pageAt[i] = pg; chapAt[i] = ch;\n  });\n  var heads = blocks.filter(function (b) { return /^H[1-3]$/.test(b.tagName) && !b.classList.contains('bt') && (b.textContent || '').trim(); });\n  function blockOf(node) {\n    var el = node && (node.nodeType === 1 ? node : node.parentElement);\n    while (el && el !== document.body) { if (idx.has(el)) return el; el = el.parentElement; }\n    return null;\n  }\n  function offsetIn(block, node, off) { var r = document.createRange(); r.setStart(block, 0); r.setEnd(node, off); return r.toString().length; }\n  function point(block, off) {\n    var w = document.createTreeWalker(block, NodeFilter.SHOW_TEXT), n, acc = 0, last = null;\n    while ((n = w.nextNode())) { var L = n.data.length; if (acc + L >= off) return [n, off - acc]; acc += L; last = n; }\n    return last ? [last, last.data.length] : [block, 0];\n  }\n  function rangeOf(a) {\n    if (!a || blocks[a.s] == null || blocks[a.e] == null) return null;\n    try { var r = document.createRange(), p1 = point(blocks[a.s], a.so), p2 = point(blocks[a.e], a.eo); r.setStart(p1[0], p1[1]); r.setEnd(p2[0], p2[1]); return r; } catch (e) { return null; }\n  }\n\n  // ---- подсветки ----\n  var supported = !!(window.CSS && CSS.highlights && window.Highlight);\n  var spans = [];\n  function drawHighlights() {\n    spans = [];\n    var h1 = supported ? new Highlight() : null, h2 = supported ? new Highlight() : null;\n    state.notes.forEach(function (n) { var r = rangeOf(n.anchor); if (!r) return; spans.push({ r: r, n: n }); if (supported) (n.note ? h2 : h1).add(r); });\n    if (supported) { CSS.highlights.set('rn', h1); CSS.highlights.set('rn-note', h2); }\n    drawBar();\n  }\n\n  // ---- интерфейс ----\n  document.body.appendChild(host);\n  var root = host.attachShadow({ mode: 'open' });\n  var dark = document.documentElement.getAttribute('data-theme') === 'dark';\n  root.innerHTML = '<style>' +\n    ':host{all:initial}*{box-sizing:border-box;font-family:\"Onest\",' + FONT + '}' +\n    '.ui{--bg:#fffaf0;--ink:#2c2817;--soft:#6f684f;--line:rgba(44,40,23,.12);--chip:rgba(44,40,23,.06);--yolk:#efb21f}' +\n    '.ui.dark{--bg:#2a261b;--ink:#f4ecd6;--soft:#b9ae8d;--line:rgba(244,236,214,.14);--chip:rgba(244,236,214,.08)}' +\n    'button{font:inherit;cursor:pointer;border:0;color:inherit;background:none}' +\n    '.bar{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(14px + env(safe-area-inset-bottom,0px));pointer-events:auto;display:flex;align-items:center;gap:2px;background:var(--ink);color:var(--bg);border-radius:999px;padding:4px;box-shadow:0 6px 20px rgba(0,0,0,.22);transition:transform .25s,opacity .25s}' +\n    '.bar.hide{transform:translate(-50%,90px);opacity:0}' +\n    '.bar button{padding:9px 13px;border-radius:999px;font-weight:600;font-size:14px;white-space:nowrap}.bar .pc{font-size:13px;opacity:.7;padding:0 10px 0 6px}' +\n    '.scrim{position:fixed;inset:0;background:rgba(30,26,12,.35);pointer-events:auto}' +\n    '.panel{position:fixed;left:0;right:0;bottom:0;max-height:86vh;overflow:auto;pointer-events:auto;background:var(--bg);color:var(--ink);border-radius:22px 22px 0 0;padding:16px 16px calc(18px + env(safe-area-inset-bottom,0px));box-shadow:0 -8px 30px rgba(0,0,0,.2);max-width:620px;margin:0 auto;font-size:15px;line-height:1.4}' +\n    '.head{display:flex;gap:10px;align-items:center;justify-content:space-between}.head h3{margin:0;font-size:18px}' +\n    '.q{margin:12px 0 4px;padding:8px 12px;border-left:3px solid var(--yolk);background:var(--chip);border-radius:0 10px 10px 0;font-family:Literata,Georgia,serif;font-size:15px;max-height:9.5em;overflow:auto;white-space:pre-line}' +\n    '.sub{color:var(--soft);font-size:13px}.sect{font-size:13px;color:var(--soft);margin:14px 2px 6px}' +\n    '.chips{display:flex;flex-wrap:wrap;gap:6px}' +\n    '.chip{padding:7px 11px;border-radius:999px;background:var(--chip);font-size:14px;font-weight:500;border:1.5px solid transparent}.chip small{color:var(--soft);margin-left:2px}.chip.on{border-color:var(--ink);font-weight:700;background:transparent}' +\n    '.row{display:flex;gap:8px}' +\n    'input,textarea{width:100%;font:inherit;font-size:15px;padding:10px 12px;border-radius:12px;border:1.5px solid var(--line);background:transparent;color:var(--ink);outline:none}input:focus,textarea:focus{border-color:var(--yolk)}' +\n    '.btn{background:var(--ink);color:var(--bg);font-weight:700;padding:12px 16px;border-radius:12px;white-space:nowrap}.btn.y{background:var(--yolk);color:#3b2a00;width:100%;margin-top:14px;padding:14px}' +\n    '.ghost{color:var(--soft);font-weight:600;padding:6px 4px}.red{color:#cf4526;font-weight:700;padding:14px 4px 2px}' +\n    '.sel{position:fixed;pointer-events:auto;display:flex;background:var(--ink);color:var(--bg);border-radius:12px;box-shadow:0 6px 18px rgba(0,0,0,.25);overflow:hidden}.sel button{padding:10px 13px;font-weight:700;font-size:14px}.sel button+button{border-left:1px solid rgba(255,255,255,.18)}' +\n    '.li{display:block;width:100%;text-align:left;padding:11px 2px;border-bottom:1px solid var(--line)}.li:last-child{border-bottom:0}' +\n    '.li .t{font-family:Literata,Georgia,serif;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.li .n{font-size:14px;color:var(--soft);margin-top:4px}.li .m{font-size:12px;color:var(--soft);margin-top:4px}' +\n    '.toc{display:block;width:100%;text-align:left;padding:10px 2px;border-bottom:1px solid var(--line)}.toc.h2{padding-left:16px;font-size:14px}.toc.h3{padding-left:30px;font-size:14px;color:var(--soft)}.toc.cur{font-weight:700}' +\n    '.fs{display:flex;align-items:center;justify-content:center;gap:16px;margin-top:14px}.fs button{width:52px;height:52px;border-radius:50%;background:var(--chip);font-weight:700;font-size:18px}.fs b{min-width:60px;text-align:center}' +\n    '.toast{position:fixed;left:50%;bottom:86px;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:10px 16px;border-radius:12px;font-weight:600;font-size:14px;pointer-events:none}' +\n    '</style><div class=\"ui' + (dark ? ' dark' : '') + '\" id=\"ui\"></div>';\n  var ui = root.getElementById('ui');\n  var layer = null, selBox = null, bar = null;\n  function close(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }\n  function closeLayer() { close(layer); layer = null; }\n  function toast(m) { var t = document.createElement('div'); t.className = 'toast'; t.textContent = m; ui.appendChild(t); setTimeout(function () { close(t); }, 1700); }\n  function sheet(html) {\n    closeLayer(); close(selBox); selBox = null;\n    layer = document.createElement('div');\n    layer.innerHTML = '<div class=\"scrim\"></div><div class=\"panel\">' + html + '</div>';\n    ui.appendChild(layer);\n    layer.querySelector('.scrim').onclick = closeLayer;\n    var c = layer.querySelector('[data-c]'); if (c) c.onclick = closeLayer;\n    return layer.querySelector('.panel');\n  }\n\n  // ---- нижняя панель ----\n  function curIndex() {\n    var lo = 0, hi = blocks.length - 1, ans = 0;\n    while (lo <= hi) { var mid = (lo + hi) >> 1; if (blocks[mid].getBoundingClientRect().bottom < 40) lo = mid + 1; else { ans = mid; hi = mid - 1; } }\n    return ans;\n  }\n  function pct() { var h = document.documentElement.scrollHeight - innerHeight; return h > 0 ? Math.min(1, Math.max(0, scrollY / h)) : 1; }\n  function drawBar() {\n    if (!bar) { bar = document.createElement('div'); bar.className = 'bar'; ui.appendChild(bar); }\n    bar.innerHTML = '<button data-a=\"toc\">☰ Главы</button><button data-a=\"notes\">🖍 ' + state.notes.length + '</button><button data-a=\"font\">Aa</button><span class=\"pc\">' + Math.round(pct() * 100) + '%</span>';\n    bar.querySelector('[data-a=\"toc\"]').onclick = openToc;\n    bar.querySelector('[data-a=\"notes\"]').onclick = openNotes;\n    bar.querySelector('[data-a=\"font\"]').onclick = openFont;\n  }\n  var lastY = scrollY, saveT = null, pcT = null, auto = false;\n  window.addEventListener('scroll', function () {\n    if (bar && !auto) bar.classList.toggle('hide', scrollY > lastY + 4 && scrollY > 200 && scrollY < document.documentElement.scrollHeight - innerHeight - 40);\n    if (bar && scrollY < lastY - 4) bar.classList.remove('hide');\n    lastY = scrollY;\n    clearTimeout(pcT); pcT = setTimeout(function () { var pc = bar && bar.querySelector('.pc'); if (pc) pc.textContent = Math.round(pct() * 100) + '%'; }, 120);\n    clearTimeout(saveT); saveT = setTimeout(savePos, 1500);\n  }, { passive: true });\n  function savePos() { if (blocks.length) post({ lx: 'rpos', book: RB.id, pos: curIndex(), pct: pct() }); }\n  document.addEventListener('visibilitychange', function () { if (document.hidden) savePos(); });\n  window.addEventListener('pagehide', savePos);\n\n  function jumpTo(i, flash) {\n    var b = blocks[i]; if (!b) return;\n    var y = b.getBoundingClientRect().top + scrollY - 24;\n    auto = true; window.scrollTo(0, Math.max(0, y)); lastY = scrollY;\n    setTimeout(function () { auto = false; }, 300);\n    if (bar) bar.classList.remove('hide');\n    if (flash) { b.classList.add('rd-flash'); setTimeout(function () { b.classList.remove('rd-flash'); }, 1500); }\n  }\n\n  function openToc() {\n    var cur = curIndex(), curHead = null;\n    heads.forEach(function (h) { if (idx.get(h) <= cur) curHead = h; });\n    var p = sheet('<div class=\"head\"><h3>Оглавление</h3><button class=\"ghost\" data-c>Закрыть</button></div><div id=\"l\" style=\"margin-top:8px\"></div>');\n    var l = p.querySelector('#l');\n    l.innerHTML = heads.length ? heads.map(function (h, i) { return '<button class=\"toc ' + h.tagName.toLowerCase() + (h === curHead ? ' cur' : '') + '\" data-i=\"' + idx.get(h) + '\">' + escH((h.textContent || '').replace(/\\s+/g, ' ').trim()) + '</button>'; }).join('') : '<p class=\"sub\">В этой книге не нашлось заголовков глав.</p>';\n    l.querySelectorAll('[data-i]').forEach(function (b) { b.onclick = function () { closeLayer(); jumpTo(+b.getAttribute('data-i')); }; });\n    var c = l.querySelector('.cur'); if (c) c.scrollIntoView({ block: 'center' });\n  }\n  function openFont() {\n    var p = sheet('<div class=\"head\"><h3>Размер текста</h3><button class=\"ghost\" data-c>Готово</button></div><div class=\"fs\"><button data-d=\"-10\">A−</button><b id=\"v\">' + fsz + '%</b><button data-d=\"10\">A+</button></div>');\n    p.querySelectorAll('[data-d]').forEach(function (b) {\n      b.onclick = function () {\n        var i = curIndex();\n        fsz = Math.min(170, Math.max(70, fsz + +b.getAttribute('data-d'))); applyFont();\n        try { localStorage.setItem('rd-font', fsz); } catch (e) {}\n        p.querySelector('#v').textContent = fsz + '%'; jumpTo(i); drawHighlights();\n      };\n    });\n  }\n  function openNotes() {\n    var list = state.notes.slice().sort(function (a, b) { return ((a.anchor && a.anchor.s) || 0) - ((b.anchor && b.anchor.s) || 0); });\n    var p = sheet('<div class=\"head\"><h3>Заметки в книге: ' + list.length + '</h3><button class=\"ghost\" data-c>Закрыть</button></div>' +\n      (list.length ? '' : '<p class=\"sub\">Выдели текст пальцем и нажми «Подсветить» или «Заметка».</p>') + '<div id=\"l\"></div>');\n    var l = p.querySelector('#l');\n    l.innerHTML = list.map(function (n, i) {\n      var a = n.anchor || {};\n      return '<button class=\"li\" data-i=\"' + i + '\"><div class=\"t\">' + escH(n.quote) + '</div>' + (n.note ? '<div class=\"n\">📝 ' + escH(n.note) + '</div>' : '') +\n        '<div class=\"m\">' + escH([chapAt[a.s], pageAt[a.s] ? 'с. ' + pageAt[a.s] : ''].filter(Boolean).join(' · ')) + (n.tags.length ? ' ' + n.tags.map(function (t) { return '#' + escH(showTag(t)); }).join(' ') : '') + '</div></button>';\n    }).join('');\n    l.querySelectorAll('[data-i]').forEach(function (b) { b.onclick = function () { var n = list[+b.getAttribute('data-i')]; closeLayer(); if (n.anchor) jumpTo(n.anchor.s, true); }; });\n  }\n\n  // ---- заметка: создание и правка ----\n  function noteSheet(n) {\n    // n: {id?, quote, anchor, note, tags}\n    if (!inApp) { alert('Открой книгу через «Методику» в планере, чтобы сохранять заметки.'); return; }\n    var cnt = {}; state.tags.forEach(function (x) { cnt[x.t] = x.n; });\n    var sel = {}; (n.tags || []).forEach(function (t) { sel[t] = 1; });\n    var p = sheet('<div class=\"head\"><h3>' + (n.id ? 'Заметка' : 'Новая заметка') + '</h3><button class=\"ghost\" data-c>Закрыть</button></div>' +\n      '<div class=\"q\">' + escH(n.quote) + '</div>' +\n      '<div class=\"sect\">Заметка</div><textarea id=\"note\" rows=\"4\" placeholder=\"Мысль, вопрос, как применить на уроке\">' + escH(n.note || '') + '</textarea>' +\n      '<div class=\"sect\">Теги</div><div class=\"chips\" id=\"tags\"></div>' +\n      '<div class=\"row\" style=\"margin-top:8px\"><input id=\"nt\" placeholder=\"новый тег\" autocomplete=\"off\" autocapitalize=\"off\" enterkeyhint=\"done\"><button class=\"btn\" data-nt>Добавить</button></div>' +\n      '<div class=\"chips\" id=\"sug\" style=\"margin-top:6px\"></div>' +\n      '<button class=\"btn y\" data-s>Сохранить</button>' + (n.id ? '<button class=\"red\" data-d>Удалить подсветку</button>' : ''));\n    var box = p.querySelector('#tags'), nt = p.querySelector('#nt'), sug = p.querySelector('#sug');\n    function draw() {\n      var list = Object.keys(cnt).concat(Object.keys(sel)).filter(function (t, i, a) { return a.indexOf(t) === i; });\n      list.sort(function (a, b) { return (sel[b] ? 1 : 0) - (sel[a] ? 1 : 0) || (cnt[b] || 0) - (cnt[a] || 0) || a.localeCompare(b); });\n      box.innerHTML = list.length ? list.map(function (t) { return '<button class=\"chip' + (sel[t] ? ' on' : '') + '\" data-t=\"' + escH(t) + '\">' + escH(showTag(t)) + (cnt[t] ? ' <small>' + cnt[t] + '</small>' : '') + '</button>'; }).join('') : '<span class=\"sub\">Тегов пока нет, добавь свой ниже.</span>';\n      box.querySelectorAll('[data-t]').forEach(function (b) { b.onclick = function () { var t = b.getAttribute('data-t'); if (sel[t]) delete sel[t]; else sel[t] = 1; b.classList.toggle('on', !!sel[t]); }; });\n    }\n    function add(v) { var t = normTag(v); if (!t) return; sel[t] = 1; nt.value = ''; sug.innerHTML = ''; draw(); }\n    nt.oninput = function () {\n      var v = normTag(nt.value);\n      var known = v ? Object.keys(cnt).filter(function (t) { return !sel[t] && t.indexOf(v) >= 0; }).slice(0, 6) : [];\n      sug.innerHTML = known.map(function (t) { return '<button class=\"chip\" data-g=\"' + escH(t) + '\">' + escH(showTag(t)) + ' <small>' + cnt[t] + '</small></button>'; }).join('');\n      sug.querySelectorAll('[data-g]').forEach(function (b) { b.onclick = function () { add(b.getAttribute('data-g')); }; });\n    };\n    nt.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); add(nt.value); } };\n    p.querySelector('[data-nt]').onclick = function () { add(nt.value); };\n    p.querySelector('[data-s]').onclick = function () {\n      if (nt.value.trim()) add(nt.value);\n      var a = n.anchor || {};\n      post({ lx: 'rsave', item: { id: n.id, quote: n.quote, anchor: n.anchor, page: pageAt[a.s] || '', chapter: chapAt[a.s] || '', note: p.querySelector('#note').value.trim(), tags: Object.keys(sel) } });\n      closeLayer(); toast('Сохранено');\n    };\n    var d = p.querySelector('[data-d]');\n    if (d) d.onclick = function () { post({ lx: 'rdel', id: n.id }); closeLayer(); toast('Удалено'); };\n    draw();\n    if (!n.id) setTimeout(function () { p.querySelector('#note').focus(); }, 250);\n  }\n\n  // ---- выделение текста ----\n  function selection() {\n    var s = document.getSelection();\n    if (!s || s.rangeCount === 0 || s.isCollapsed) return null;\n    var r = s.getRangeAt(0), txt = r.toString().replace(/[ \\t]+\\n/g, '\\n').trim();\n    if (txt.length < 2) return null;\n    var b1 = blockOf(r.startContainer), b2 = blockOf(r.endContainer);\n    if (!b1 || !b2) return null;\n    var a = { s: idx.get(b1), so: offsetIn(b1, r.startContainer, r.startOffset), e: idx.get(b2), eo: offsetIn(b2, r.endContainer, r.endOffset) };\n    return { quote: txt.slice(0, 6000), anchor: a, rect: r.getBoundingClientRect() };\n  }\n  var st;\n  document.addEventListener('selectionchange', function () {\n    clearTimeout(st);\n    st = setTimeout(function () {\n      var cur = layer ? null : selection();\n      if (!cur) { close(selBox); selBox = null; return; }\n      close(selBox);\n      selBox = document.createElement('div'); selBox.className = 'sel';\n      selBox.innerHTML = '<button data-h>🖍 Подсветить</button><button data-n>📝 Заметка</button>';\n      ui.appendChild(selBox);\n      var w = selBox.offsetWidth, rect = cur.rect, y = rect.bottom + 14;\n      if (y + 52 > innerHeight - 70) y = Math.max(8, rect.top - 56);\n      selBox.style.left = Math.max(10, Math.min(rect.left + rect.width / 2 - w / 2, innerWidth - w - 10)) + 'px';\n      selBox.style.top = y + 'px';\n      selBox.onmousedown = function (e) { e.preventDefault(); };\n      selBox.querySelector('[data-h]').onclick = function () {\n        var c = selection() || cur;\n        if (!inApp) { alert('Открой книгу через «Методику» в планере, чтобы сохранять подсветки.'); return; }\n        var a = c.anchor;\n        post({ lx: 'rsave', item: { quote: c.quote, anchor: a, page: pageAt[a.s] || '', chapter: chapAt[a.s] || '', note: '', tags: [] } });\n        try { document.getSelection().removeAllRanges(); } catch (e) {}\n        close(selBox); selBox = null; toast('Подсвечено');\n      };\n      selBox.querySelector('[data-n]').onclick = function () {\n        var c = selection() || cur;\n        try { document.getSelection().removeAllRanges(); } catch (e) {}\n        noteSheet({ quote: c.quote, anchor: c.anchor, note: '', tags: [] });\n      };\n    }, 250);\n  });\n\n  // ---- нажатие на подсветку ----\n  function caretAt(x, y) {\n    if (document.caretPositionFromPoint) { var c = document.caretPositionFromPoint(x, y); return c && { node: c.offsetNode, off: c.offset }; }\n    if (document.caretRangeFromPoint) { var r = document.caretRangeFromPoint(x, y); return r && { node: r.startContainer, off: r.startOffset }; }\n    return null;\n  }\n  document.addEventListener('click', function (e) {\n    if (e.composedPath().indexOf(host) >= 0 || !spans.length) return;\n    var s = document.getSelection(); if (s && !s.isCollapsed) return;\n    var c = caretAt(e.clientX, e.clientY); if (!c) return;\n    for (var i = 0; i < spans.length; i++) {\n      try { if (spans[i].r.isPointInRange(c.node, c.off)) { e.preventDefault(); noteSheet(spans[i].n); return; } } catch (err) {}\n    }\n  }, true);\n\n  // ---- связь с приложением ----\n  var first = true;\n  window.addEventListener('message', function (e) {\n    if (e.origin !== location.origin || !e.data || e.data.lx !== 'rstate') return;\n    state = { notes: e.data.notes || [], tags: e.data.tags || [], pos: e.data.pos || 0 };\n    drawHighlights();\n    if (first) {\n      first = false;\n      var h = location.hash.match(/^#n(\\d+)$/), target = null;\n      if (h) state.notes.forEach(function (n) { if (String(n.id) === h[1] && n.anchor) target = n.anchor.s; });\n      if (target != null) setTimeout(function () { jumpTo(target, true); }, 60);\n      else if (state.pos > 0) setTimeout(function () { jumpTo(state.pos); }, 60);\n    }\n  });\n  drawBar();\n  post({ lx: 'rhello' });\n})();\n";

const MSK_MS = 3 * 3600e3;
const QUADS = { nap: '😴 Сон ребёнка', wb: '📦 ВБ', urgent: '🔥 Важно и срочно', important: '🌱 Важно, не срочно' };
const EXP = { work: '💼 Работа', home: '🏠 Быт', self: '💅 На себя', other: '🧩 Другое' };
const INC = { work: '💼 Работа', other: '🧩 Другое' };
const SOC = { tg: 'Посты в Telegram', car: 'Карусели в Instagram', reels: 'Рилс в Instagram' };
const WD = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const MON_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MON_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const INTERVALS = [1, 3, 7, 14, 30, 60];

// ---------- даты (всё по Москве, UTC+3) ----------
const mskNow = () => new Date(Date.now() + MSK_MS);
const ymd = d => d.toISOString().slice(0, 10);
const pd = s => new Date(s + 'T00:00:00Z');
const today = () => ymd(mskNow());
const nowHM = () => mskNow().toISOString().slice(11, 16);
function addDays(s, n) { const d = pd(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); }
const weekday = s => (pd(s).getUTCDay() + 6) % 7 + 1; // 1 = пн … 7 = вс
const monday = s => addDays(s, 1 - weekday(s));
const evMs = (date, time) => Date.parse(date + 'T' + time + ':00Z') - MSK_MS;
function fmtDay(s) { const d = pd(s); return `${WD[weekday(s) - 1]}, ${d.getUTCDate()} ${MON_GEN[d.getUTCMonth()]}`; }
function fmtRange(a, b) {
  const x = pd(a), y = pd(b);
  return `${x.getUTCDate()} ${MON_SHORT[x.getUTCMonth()]} – ${y.getUTCDate()} ${MON_SHORT[y.getUTCMonth()]}`;
}
function dayRel(s) {
  const t = today();
  if (s === t) return 'на сегодня';
  if (s === addDays(t, 1)) return 'на завтра';
  return 'на ' + fmtDay(s);
}
const num = n => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const rub = n => num(n) + ' ₽';
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pct = (a, b) => (b > 0 ? ` (${Math.round(a / b * 100)}%)` : '');

// ---------- база ----------
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)`,
  `CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, quad TEXT, day TEXT, done INTEGER DEFAULT 0, done_at TEXT, created TEXT)`,
  `CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, date TEXT NOT NULL, time TEXT)`,
  `CREATE TABLE IF NOT EXISTS recurring (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, weekday INTEGER NOT NULL, time TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS money (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, amount REAL NOT NULL, cat TEXT, note TEXT, day TEXT NOT NULL, created TEXT)`,
  `CREATE TABLE IF NOT EXISTS goals (period TEXT PRIMARY KEY, income REAL DEFAULT 0, work REAL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS social (week TEXT NOT NULL, key TEXT NOT NULL, goal INTEGER DEFAULT 0, done INTEGER DEFAULT 0, PRIMARY KEY (week, key))`,
  `CREATE TABLE IF NOT EXISTS ideas (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, created TEXT)`,
  `CREATE TABLE IF NOT EXISTS lessons (id TEXT PRIMARY KEY, title TEXT, created TEXT, vocab TEXT)`,
  `CREATE TABLE IF NOT EXISTS cards (id INTEGER PRIMARY KEY AUTOINCREMENT, term TEXT NOT NULL, term_l TEXT UNIQUE, def TEXT, lesson TEXT, stage INTEGER DEFAULT 0, due TEXT, last TEXT, created TEXT)`,
  `CREATE TABLE IF NOT EXISTS sent (k TEXT PRIMARY KEY, at TEXT)`,
  `CREATE TABLE IF NOT EXISTS books (id TEXT PRIMARY KEY, title TEXT, author TEXT, part TEXT, total INTEGER DEFAULT 0, created TEXT)`,
  `CREATE TABLE IF NOT EXISTS mideas (id INTEGER PRIMARY KEY AUTOINCREMENT, book TEXT DEFAULT '', book_title TEXT DEFAULT '', ref TEXT, title TEXT, text TEXT, page TEXT, tags TEXT DEFAULT '[]', note TEXT DEFAULT '', created TEXT)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS mideas_ref ON mideas (book, ref)`,
  `CREATE TABLE IF NOT EXISTS rbooks (id TEXT PRIMARY KEY, title TEXT, author TEXT, created TEXT, pos INTEGER DEFAULT 0, pct REAL DEFAULT 0, opened TEXT)`,
  `CREATE TABLE IF NOT EXISTS rnotes (id INTEGER PRIMARY KEY AUTOINCREMENT, book TEXT, book_title TEXT, quote TEXT, anchor TEXT, pos INTEGER DEFAULT 0, page TEXT, chapter TEXT, note TEXT DEFAULT '', tags TEXT DEFAULT '[]', created TEXT)`,
];
let ready = false;
async function init(env) {
  if (ready) return;
  await env.DB.batch(SCHEMA.map(s => env.DB.prepare(s)));
  if (!(await kvGet(env, 'seeded'))) {
    const ins = 'INSERT INTO recurring (title, weekday, time) VALUES (?,?,?)';
    await env.DB.batch([
      env.DB.prepare(ins).bind('Урок', 2, '11:00'),
      env.DB.prepare(ins).bind('Урок', 5, '11:00'),
      env.DB.prepare(ins).bind('Урок', 5, '13:00'),
    ]);
    await kvSet(env, 'husband', JSON.stringify({ start: '2026-10-03', end: '2026-11-09', on: 2, off: 2 }));
    await kvSet(env, 'seeded', '1');
  }
  ready = true;
}
const q = (env, sql, ...a) => env.DB.prepare(sql).bind(...a);
const all = async (env, sql, ...a) => (await q(env, sql, ...a).all()).results;
const one = (env, sql, ...a) => q(env, sql, ...a).first();
const run = (env, sql, ...a) => q(env, sql, ...a).run();
async function getOwner(env) { return (env.OWNER_ID && String(env.OWNER_ID).trim()) || kvGet(env, 'owner'); }
async function kvGet(env, k) { const r = await one(env, 'SELECT v FROM kv WHERE k=?', k); return r ? r.v : null; }
const kvSet = (env, k, v) => run(env, 'INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', k, String(v));
const stamp = () => new Date().toISOString();

// ---------- Telegram ----------
async function tg(env, method, body) {
  const base = env.TG_API || 'https://api.telegram.org';
  try {
    const r = await fetch(`${base}/bot${env.BOT_TOKEN}/${method}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    return await r.json();
  } catch (e) { return { ok: false, error: String(e) }; }
}
const send = (env, chat, text, markup) =>
  tg(env, 'sendMessage', { chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true, ...(markup ? { reply_markup: markup } : {}) });
const edit = (env, chat, mid, text, markup) =>
  tg(env, 'editMessageText', { chat_id: chat, message_id: mid, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: markup || { inline_keyboard: [] } });
const appBtn = (env, text, query = '') => (/^https:\/\//.test(env.__base || '')
  ? { text, web_app: { url: env.__base + '/' + query } }
  : { text: text + ' (нет домена)', callback_data: 'nodomain' });
const MAIN_KB = {
  keyboard: [[{ text: '😴 Малыш уснул' }, { text: '📋 Дела на сегодня' }], [{ text: '➕ Доход' }, { text: '📅 Ближайшее' }]],
  resize_keyboard: true, is_persistent: true,
};

// ---------- смены мужа ----------
async function husband(env) { return JSON.parse((await kvGet(env, 'husband')) || '{}'); }
function shiftOn(date, h) {
  if (!h || !h.start || date < h.start || (h.end && date > h.end)) return false;
  const diff = Math.round((pd(date) - pd(h.start)) / 864e5);
  const cyc = (+h.on || 2) + (+h.off || 2);
  return ((diff % cyc) + cyc) % cyc < (+h.on || 2);
}

// ---------- события ----------
async function eventsInRange(env, from, to) {
  const one_off = await all(env, 'SELECT id, title, date, time FROM events WHERE date BETWEEN ? AND ?', from, to);
  const rec = await all(env, 'SELECT id, title, weekday, time FROM recurring');
  const out = one_off.map(e => ({ key: 'e' + e.id, id: e.id, title: e.title, date: e.date, time: e.time, kind: 'event' }));
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const wd = weekday(d);
    for (const r of rec) if (r.weekday === wd) out.push({ key: `r${r.id}:${d}`, rid: r.id, title: r.title, date: d, time: r.time, kind: 'lesson' });
  }
  out.sort((a, b) => (a.date + (a.time || '00:00')).localeCompare(b.date + (b.time || '00:00')));
  return out;
}
const evLine = e => `${e.time ? '<b>' + e.time + '</b> ' : ''}${esc(e.title)}`;

// ---------- разбор текста: дата / время ----------
const B = '(?<![\\p{L}\\d])', E = '(?![\\p{L}\\d])';
const MONTHS = [['январ', 0], ['феврал', 1], ['март', 2], ['апрел', 3], ['июн', 5], ['июл', 6], ['август', 7], ['сентябр', 8], ['октябр', 9], ['ноябр', 10], ['декабр', 11], ['ма', 4]];
const WDAYS = [['понедельник', 1], ['вторник', 2], ['сред', 3], ['четверг', 4], ['пятниц', 5], ['суббот', 6], ['воскресень', 7], ['пн', 1], ['вт', 2], ['ср', 3], ['чт', 4], ['пт', 5], ['сб', 6], ['вс', 7]];
function validDate(y, m, d) { const x = new Date(Date.UTC(y, m - 1, d)); return x.getUTCMonth() === m - 1 && x.getUTCDate() === d ? ymd(x) : null; }
function guessYear(m, d, t) {
  const y = +t.slice(0, 4);
  const s = validDate(y, m, d);
  if (s && s < addDays(t, -30)) return validDate(y + 1, m, d);
  return s;
}
function parseWhen(text, t, hmNow) {
  let s = ' ' + text + ' ', date = null, time = null, explicit = false;
  const take = (re, fn) => {
    const m = s.match(re); if (!m) return false;
    if (fn(m) === false) return false;
    s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length); return true;
  };
  take(new RegExp(B + '(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?' + E, 'u'), m => {
    let y = m[3] ? +m[3] : null; if (y && y < 100) y += 2000;
    const r = y ? validDate(y, +m[2], +m[1]) : guessYear(+m[2], +m[1], t);
    if (!r) return false; date = r; explicit = true;
  });
  take(new RegExp(B + '(?:(?:в|к|до)\\s+)?([01]?\\d|2[0-3]):([0-5]\\d)' + E, 'iu'), m => { time = m[1].padStart(2, '0') + ':' + m[2]; });
  if (!date) take(new RegExp(B + '(\\d{1,2})\\s+(январ[а-я]*|феврал[а-я]*|март[а-я]*|апрел[а-я]*|ма[йя]|июн[а-я]*|июл[а-я]*|август[а-я]*|сентябр[а-я]*|октябр[а-я]*|ноябр[а-я]*|декабр[а-я]*)' + E, 'iu'), m => {
    const w = m[2].toLowerCase(); const mi = MONTHS.find(([st]) => w.startsWith(st));
    const r = mi && guessYear(mi[1] + 1, +m[1], t); if (!r) return false; date = r; explicit = true;
  });
  if (!date) take(new RegExp(B + '(сегодня|послезавтра|завтра)' + E, 'iu'), m => {
    const w = m[1].toLowerCase(); date = addDays(t, w === 'сегодня' ? 0 : w === 'завтра' ? 1 : 2);
  });
  if (!date) take(new RegExp(B + '(?:(?:в|во)\\s+)?(понедельник|вторник|сред[ауы]|четверг|пятниц[ауы]|суббот[ауы]|воскресень[ея]|пн|вт|ср|чт|пт|сб|вс)' + E, 'iu'), m => {
    const w = m[1].toLowerCase(); const target = WDAYS.find(([st]) => w.startsWith(st))[1];
    let diff = (target - weekday(t) + 7) % 7;
    if (diff === 0 && time && time <= hmNow) diff = 7;
    date = addDays(t, diff);
  });
  if (date && !time) take(new RegExp(B + 'в\\s+([01]?\\d|2[0-3])(?:\\s*(?:ч|час[ао]?в?))?' + E, 'iu'), m => { time = m[1].padStart(2, '0') + ':00'; });
  let rest = s.replace(/\s+/g, ' ').trim()
    .replace(/^(?:(?:в|во|на|к|до)\s+)+/iu, '').replace(/(?:\s+(?:в|во|на|к|до))+$/iu, '')
    .replace(/^[\s,.:;—–-]+|[\s,.:;—–-]+$/g, '');
  if (rest) rest = rest[0].toUpperCase() + rest.slice(1);
  return { date, time, explicit, rest };
}
function parseMoney(line) {
  const m = line.match(/^(\d{1,3}(?:[ \u00a0]\d{3})+|\d+)(?:[.,](\d{1,2}))?\s*(?:₽|р\.?|руб\.?|рублей|rub)?(?:\s+(.+))?$/iu);
  if (!m) return null;
  const amount = parseFloat(m[1].replace(/[ \u00a0]/g, '') + (m[2] ? '.' + m[2] : ''));
  if (!(amount > 0)) return null;
  return { amount, note: (m[3] || '').trim() };
}

// ---------- сообщения бота ----------
const quadKb = id => ({
  inline_keyboard: [
    [{ text: QUADS.nap, callback_data: `tq:${id}:nap` }, { text: QUADS.wb, callback_data: `tq:${id}:wb` }],
    [{ text: QUADS.urgent, callback_data: `tq:${id}:urgent` }, { text: QUADS.important, callback_data: `tq:${id}:important` }],
    [{ text: '💡 В банк идей', callback_data: `ti:${id}` }, { text: '✖️ Удалить', callback_data: `tx:${id}` }],
  ],
});
function taskDoneKb(id, day) {
  const t = today();
  const sw = day === t ? { text: '➡️ На завтра', callback_data: `td:${id}:${addDays(t, 1)}` } : { text: '⬅️ На сегодня', callback_data: `td:${id}:${t}` };
  return { inline_keyboard: [[sw, { text: '✖️ Удалить', callback_data: `tx:${id}` }]] };
}
const expKb = id => ({
  inline_keyboard: [
    [{ text: EXP.work, callback_data: `mc:${id}:work` }, { text: EXP.home, callback_data: `mc:${id}:home` }],
    [{ text: EXP.self, callback_data: `mc:${id}:self` }, { text: EXP.other, callback_data: `mc:${id}:other` }],
    [{ text: '📝 Это дело, не трата', callback_data: `mt:${id}` }, { text: '✖️ Отмена', callback_data: `mx:${id}` }],
  ],
});
const incKb = id => ({
  inline_keyboard: [
    [{ text: INC.work, callback_data: `mi:${id}:work` }, { text: INC.other, callback_data: `mi:${id}:other` }],
    [{ text: '✖️ Отмена', callback_data: `mx:${id}` }],
  ],
});

async function sums(env, from, to) {
  const rows = await all(env, 'SELECT kind, cat, SUM(amount) s FROM money WHERE day BETWEEN ? AND ? AND cat IS NOT NULL GROUP BY kind, cat', from, to);
  const r = { exp: 0, inc: 0, work: 0, byCat: { work: 0, home: 0, self: 0, other: 0 } };
  for (const x of rows) {
    if (x.kind === 'exp') { r.exp += x.s; r.byCat[x.cat] = (r.byCat[x.cat] || 0) + x.s; }
    else { r.inc += x.s; if (x.cat === 'work') r.work += x.s; }
  }
  return r;
}
async function goal(env, period) { return (await one(env, 'SELECT income, work FROM goals WHERE period=?', period)) || { income: 0, work: 0 }; }
const vs = (a, g) => (g > 0 ? `${rub(a)} из ${rub(g)}${pct(a, g)}` : rub(a));

async function newTaskPrompt(env, chat, text, day) {
  const r = await run(env, 'INSERT INTO tasks (text, day, created) VALUES (?, ?, ?)', text, day, stamp());
  const id = r.meta.last_row_id;
  await send(env, chat, `📝 <b>${esc(text)}</b>\nКуда это дело? <i>(${dayRel(day)})</i>`, quadKb(id));
}

async function routeLine(env, chat, line) {
  const t = today(), hm = nowHM();
  // доход: "+5000" или "+5000 урок"
  const inc = line.match(/^\+\s*(.+)$/);
  if (inc) {
    const p = parseMoney(inc[1]);
    if (p) {
      const r = await run(env, "INSERT INTO money (kind, amount, note, day, created) VALUES ('inc', ?, ?, ?, ?)", p.amount, p.note, t, stamp());
      return send(env, chat, `💰 <b>+${rub(p.amount)}</b>${p.note ? ' — ' + esc(p.note) : ''}\nОткуда доход?`, incKb(r.meta.last_row_id));
    }
  }
  // идея: "💡 текст" или "идея: текст"
  const idea = line.match(/^(?:💡|идея[:\s-]+)\s*(.+)$/iu);
  if (idea) {
    await run(env, 'INSERT INTO ideas (text, created) VALUES (?, ?)', idea[1].trim(), stamp());
    return send(env, chat, `💡 В банке идей: <b>${esc(idea[1].trim())}</b>`);
  }
  const w = parseWhen(line, t, hm);
  if (w.time || w.explicit) {
    let date = w.date || t;
    if (!w.date && w.time && evMs(t, w.time) < Date.now() - 3600e3) date = addDays(t, 1);
    const title = w.rest || 'Событие';
    const r = await run(env, 'INSERT INTO events (title, date, time) VALUES (?, ?, ?)', title, date, w.time);
    const when = `${fmtDay(date)}${w.time ? ', ' + w.time : ''}`;
    return send(env, chat, `📅 Записала в календарь: <b>${when}</b> — ${esc(title)}\n${w.time ? 'Напомню за день и за час.' : 'Напомню накануне.'}`,
      { inline_keyboard: [[{ text: '↩️ Отменить', callback_data: `ex:${r.meta.last_row_id}` }, { text: '📝 Это дело', callback_data: `et:${r.meta.last_row_id}` }]] });
  }
  if (!w.date) {
    const p = parseMoney(line);
    if (p) {
      const r = await run(env, "INSERT INTO money (kind, amount, note, day, created) VALUES ('exp', ?, ?, ?, ?)", p.amount, p.note, t, stamp());
      return send(env, chat, `💸 <b>${rub(p.amount)}</b>${p.note ? ' — ' + esc(p.note) : ''}\nНа что потратила?`, expKb(r.meta.last_row_id));
    }
  }
  const day = w.date || (+hm.slice(0, 2) >= 18 ? addDays(t, 1) : t);
  return newTaskPrompt(env, chat, w.date ? (w.rest || line) : line, day);
}

async function tasksForBot(env, quad) {
  const t = today();
  return all(env, `SELECT id, text, quad, day FROM tasks WHERE done=0 AND quad IS NOT NULL AND day <= ? ${quad ? 'AND quad=?' : ''} ORDER BY day, id LIMIT 30`, ...(quad ? [t, quad] : [t]));
}
async function listMessage(env, mode) {
  const rows = await tasksForBot(env, mode === 'nap' ? 'nap' : null);
  const t = today();
  let text;
  if (mode === 'nap') {
    text = rows.length ? '😴 <b>Пока малыш спит</b>\nНажми на дело, когда сделаешь:' : '😴 В «Сон ребёнка» на сегодня пусто. Можно просто отдохнуть 🤍';
  } else {
    text = rows.length ? `📋 <b>Дела на ${fmtDay(t)}</b>` : '📋 На сегодня дел нет.';
    for (const k of Object.keys(QUADS)) {
      const g = rows.filter(r => r.quad === k); if (!g.length) continue;
      text += `\n\n${QUADS[k]}\n` + g.map(r => `• ${esc(r.text)}${r.day < t ? ' <i>(с ' + fmtDay(r.day) + ')</i>' : ''}`).join('\n');
    }
    if (rows.length) text += '\n\nНажми на дело, когда сделаешь:';
  }
  const kb = rows.map(r => [{ text: '✅ ' + (r.text.length > 40 ? r.text.slice(0, 38) + '…' : r.text), callback_data: `tdone:${r.id}:${mode}` }]);
  kb.push([appBtn(env, '📱 Открыть дела', '?tab=tasks')]);
  return { text, kb: { inline_keyboard: kb } };
}

async function upcoming(env) {
  const t = today(), to = addDays(t, 6), h = await husband(env);
  const evs = (await eventsInRange(env, t, to)).filter(e => !(e.date === t && e.time && e.time < nowHM()));
  let text = '📅 <b>Ближайшие 7 дней</b>';
  for (let d = t; d <= to; d = addDays(d, 1)) {
    const de = evs.filter(e => e.date === d);
    const sh = shiftOn(d, h);
    if (!de.length && !sh) continue;
    text += `\n\n<b>${d === t ? 'Сегодня' : d === addDays(t, 1) ? 'Завтра' : fmtDay(d)}</b>${sh ? ' — 👷 муж на смене' : ''}`;
    for (const e of de) text += '\n' + evLine(e);
  }
  if (text.indexOf('\n') < 0) text += '\n\nНичего не запланировано.';
  return text;
}

const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 14);
const metaOf = (html, n) => {
  const m = html.match(new RegExp(`<meta[^>]+name=["']${n}["'][^>]*content=["']([^"']*)["']`, 'i')) || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*name=["']${n}["']`, 'i'));
  return m ? m[1].trim() : '';
};
const BOOK_EXT = /\.(pdf|epub|fb2|fb2\.zip|zip)$/i;

// Сохраняет присланный файл: урок, книгу с идеями или книгу для чтения. Возвращает текст ответа.
async function ingestFile(env, name, buf, caption) {
  const id = newId();
  if (BOOK_EXT.test(name) || (!/\.html?$/i.test(name) && new TextDecoder().decode(buf.slice(0, 5)) === '%PDF-')) {
    if (!env.CONVERT) return { text: 'PDF, EPUB и FB2 я умею открывать только в версии для Railway.' };
    let r;
    try { r = await env.CONVERT(buf, name); }
    catch (e) { console.log('convert error', e && e.stack || e); return { text: '😕 ' + esc(e && e.name === 'BookError' ? e.message : 'Не получилось разобрать книгу. Попробуй другой формат (EPUB обычно открывается лучше всего).') }; }
    await env.LESSONS.put(id, r.html);
    await run(env, 'INSERT INTO rbooks (id, title, author, created) VALUES (?, ?, ?, ?)', id, r.title, r.author || '', today());
    return { kind: 'read', id, text: `📖 Книга «<b>${esc(r.title)}</b>»${r.author ? ', ' + esc(r.author) : ''} готова для чтения.\nВыделяй текст, чтобы подсветить его или написать заметку.`, kb: { inline_keyboard: [[appBtn(env, '📖 Читать', '?read=' + id)]] } };
  }
  if (!/\.html?$/i.test(name)) return { text: 'Подходят файлы HTML (уроки и методички), а для чтения: PDF, EPUB и FB2.' };
  const html = new TextDecoder().decode(buf);
  const tm = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = (tm && tm[1].trim()) || name.replace(/\.html?$/i, '').replace(/[_]+/g, ' ');
  if (metaOf(html, 'book-mode') === 'read' || /чтени|читать/i.test(caption || '')) {
    await env.LESSONS.put(id, html);
    const t2 = metaOf(html, 'book-title') || title;
    await run(env, 'INSERT INTO rbooks (id, title, author, created) VALUES (?, ?, ?, ?)', id, t2, metaOf(html, 'book-author'), today());
    return { kind: 'read', id, text: `📖 Книга «<b>${esc(t2)}</b>» готова для чтения.`, kb: { inline_keyboard: [[appBtn(env, '📖 Читать', '?read=' + id)]] } };
  }
  const ideaRe = /<[a-z][a-z0-9]*\b[^>]*?(?:\bclass\s*=\s*["'](?:[^"']*\s)?idea(?:\s[^"']*)?["']|\sdata-idea\b)/gi;
  const nIdeas = (html.match(ideaRe) || []).length;
  if (nIdeas > 0 || /книг|методич|book/i.test(caption || '')) {
    const btitle = metaOf(html, 'book-title') || title, part = metaOf(html, 'book-part');
    await env.LESSONS.put(id, html);
    await run(env, 'INSERT INTO books (id, title, author, part, total, created) VALUES (?, ?, ?, ?, ?, ?)', id, btitle, metaOf(html, 'book-author'), part, nIdeas, today());
    const info = nIdeas
      ? `Нашла ${nIdeas} ${plural(nIdeas, 'идею', 'идеи', 'идей')}. Открой книгу и нажимай «＋ В банк идей» под нужными.`
      : 'Размеченных идей не нашла, но можно выделить любой фрагмент и сохранить его как идею.';
    return { kind: 'ideas', id, text: `📗 Книга «<b>${esc(btitle)}</b>»${part ? ' (' + esc(part) + ')' : ''} сохранена в «Методике».\n${info}`, kb: { inline_keyboard: [[appBtn(env, '📖 Открыть книгу', '?book=' + id)]] } };
  }
  const vocab = extractVocab(html);
  await env.LESSONS.put(id, html);
  await run(env, 'INSERT INTO lessons (id, title, created, vocab) VALUES (?, ?, ?, ?)', id, title, today(), JSON.stringify(vocab));
  const found = vocab.length
    ? `Нашла ${vocab.length} ${plural(vocab.length, 'выражение', 'выражения', 'выражений')}, они подсвечены в уроке. Нажми на подсветку, чтобы добавить слово в «Повторить».`
    : 'Отдельный список лексики в файле не нашла. Выдели любое слово в уроке, и появится кнопка «Повторить позже».';
  return { kind: 'lesson', id, text: `📚 Урок «<b>${esc(title)}</b>» сохранён.\n${found}`, kb: { inline_keyboard: [[appBtn(env, '📖 Открыть урок', '?lesson=' + id)]] } };
}

async function onDocument(env, chat, doc, caption) {
  const name = doc.file_name || (doc.mime_type === 'text/html' ? 'file.html' : doc.mime_type === 'application/pdf' ? 'file.pdf' : 'file');
  if (doc.file_size > 20 * 1024 * 1024)
    return send(env, chat, 'Файл больше 20 МБ, а Telegram не отдаёт ботам такие файлы. Загрузи его через приложение: «Методика» → «Чтение» → «Загрузить книгу».', { inline_keyboard: [[appBtn(env, '📚 Открыть «Чтение»', '?tab=method&mode=read')]] });
  const f = await tg(env, 'getFile', { file_id: doc.file_id });
  if (!f.ok) return send(env, chat, 'Не получилось скачать файл. Telegram отдаёт ботам файлы до 20 МБ.');
  const base = env.TG_API || 'https://api.telegram.org';
  if (BOOK_EXT.test(name)) await send(env, chat, '⏳ Готовлю книгу для чтения, это может занять до минуты…');
  const buf = new Uint8Array(await (await fetch(`${base}/file/bot${env.BOT_TOKEN}/${f.result.file_path}`)).arrayBuffer());
  const r = await ingestFile(env, name, buf, caption);
  return send(env, chat, r.text, r.kb);
}
// ---------- методика: теги ----------
const normTag = s => String(s || '').trim().replace(/^#+/, '').toLowerCase().replace(/[\s_]+/g, '-').replace(/[,;"'<>#]+/g, '').replace(/^-+|-+$/g, '').slice(0, 40);
const showTag = t => (/^[abc][12]\+?$/.test(t) ? t.toUpperCase() : t);
const parseTags = s => { try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
const cleanTags = arr => [...new Set((arr || []).map(normTag).filter(Boolean))].slice(0, 30);
async function tagCounts(env) {
  const m = new Map();
  for (const r of await all(env, 'SELECT tags FROM mideas')) for (const t of parseTags(r.tags)) m.set(t, (m.get(t) || 0) + 1);
  return [...m].map(([t, n]) => ({ t, n })).sort((a, b) => b.n - a.n || a.t.localeCompare(b.t));
}
async function bookState(env, book) {
  const saved = {};
  for (const r of await all(env, 'SELECT id, ref, tags, note FROM mideas WHERE book=?', book)) saved[r.ref] = { id: r.id, tags: parseTags(r.tags), note: r.note || '' };
  return { saved, tags: await tagCounts(env) };
}
const ideaSrc = r => (r.book_title ? r.book_title + (r.page ? ', с. ' + r.page : '') : 'своя идея');
async function rtagCounts(env) {
  const m = new Map();
  for (const r of await all(env, 'SELECT tags FROM rnotes')) for (const t of parseTags(r.tags)) m.set(t, (m.get(t) || 0) + 1);
  return [...m].map(([t, n]) => ({ t, n })).sort((a, b) => b.n - a.n || a.t.localeCompare(b.t));
}
async function readState(env, book) {
  const b = await one(env, 'SELECT pos, pct FROM rbooks WHERE id=?', book);
  const notes = (await all(env, 'SELECT id, quote, anchor, note, tags FROM rnotes WHERE book=? ORDER BY pos, id', book)).map(r => ({ ...r, tags: parseTags(r.tags), anchor: (() => { try { return JSON.parse(r.anchor || 'null'); } catch (e) { return null; } })() }));
  return { pos: b ? b.pos : 0, notes, tags: await rtagCounts(env) };
}
async function tagsMessage(env) {
  const tc = await tagCounts(env), rc = await rtagCounts(env);
  if (!tc.length && !rc.length) return '🏷 Тегов пока нет. Сохрани идею из книги или заметку при чтении, и они появятся здесь.';
  const list = (arr, w) => arr.map(x => `#${esc(showTag(x.t))} — ${x.n} ${w(x.n)}`).join('\n');
  let out = '🏷 <b>Теги</b>';
  if (tc.length) out += '\n\n<b>Идеи для уроков</b>\n' + list(tc, n => plural(n, 'идея', 'идеи', 'идей'));
  if (rc.length) out += '\n\n<b>Заметки из книг</b>\n' + list(rc, n => plural(n, 'заметка', 'заметки', 'заметок'));
  return out + '\n\nНапиши, например, <code>#B1 #revision</code>, и я пришлю подходящее.';
}
async function searchIdeas(env, chat, text) {
  const want = cleanTags(text.match(/#[^\s#,]+/g) || []);
  const match = r => want.every(t => r.tags.includes(t));
  const rows = (await all(env, 'SELECT * FROM mideas ORDER BY id DESC')).map(r => ({ ...r, tags: parseTags(r.tags) })).filter(match);
  const notes = (await all(env, 'SELECT * FROM rnotes ORDER BY id DESC')).map(r => ({ ...r, tags: parseTags(r.tags) })).filter(match);
  const head = want.map(t => '#' + esc(showTag(t))).join(' ');
  const q = encodeURIComponent(want.join(','));
  const btns = [];
  if (rows.length || !notes.length) btns.push(appBtn(env, '💡 Идеи', '?tab=method&tags=' + q));
  if (notes.length) btns.push(appBtn(env, '📖 Заметки', '?tab=method&mode=read&tags=' + q));
  const kb = { inline_keyboard: [btns] };
  if (!rows.length && !notes.length) return send(env, chat, `🔎 ${head}: ничего не нашла.\nСписок всех тегов: /tags`, kb);
  const cut = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  let out = `🔎 ${head}`;
  if (rows.length) {
    out += `\n\n💡 <b>Идеи: ${rows.length}</b>\n`;
    for (const r of rows.slice(0, 8)) {
      out += `\n<b>${esc(cut(r.title || r.text || 'Идея', 100))}</b>\n<i>${esc(cut(ideaSrc(r), 80))}</i>`;
      if (r.note) out += `\n📝 ${esc(cut(r.note, 200))}`;
      out += `\n${r.tags.map(t => '#' + esc(showTag(t))).join(' ')}\n`;
    }
    if (rows.length > 8) out += `\nЕщё ${rows.length - 8} в приложении.\n`;
  }
  if (notes.length) {
    out += `\n\n📖 <b>Заметки из книг: ${notes.length}</b>\n`;
    for (const r of notes.slice(0, 6)) {
      out += `\n«${esc(cut(r.quote, 220))}»\n<i>${esc(cut(r.book_title + (r.chapter ? ' · ' + r.chapter : ''), 90))}</i>`;
      if (r.note) out += `\n📝 ${esc(cut(r.note, 200))}`;
      out += '\n';
    }
    if (notes.length > 6) out += `\nЕщё ${notes.length - 6} в приложении.`;
  }
  return send(env, chat, out.slice(0, 4000), kb);
}
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };

async function onMessage(env, m) {
  const chat = m.chat.id, from = m.from && m.from.id;
  let owner = await getOwner(env);
  const text = (m.text || '').trim();
  if (!owner && text.startsWith('/start')) { await kvSet(env, 'owner', from); await kvSet(env, 'chat', chat); owner = String(from); }
  if (String(from) !== String(owner)) { console.log(`Сообщение от чужого id ${from}, владелец: ${owner}`); return send(env, chat, 'Это личный бот 🙂'); }
  if (env.OWNER_ID && !(await kvGet(env, 'owner'))) await kvSet(env, 'owner', from);
  if (m.chat.type !== 'private') return;
  await kvSet(env, 'chat', chat);
  if (m.document) return onDocument(env, chat, m.document, m.caption);
  if (!text) return;

  if (text.startsWith('/start') || text === '/help') {
    await send(env, chat,
      `Привет! Я твой планер 🌤\n\n` +
      `<b>Как со мной говорить</b>\n` +
      `• Просто дело: «купить памперсы». Я спрошу, в какую колонку.\n` +
      `• Несколько дел: каждое с новой строки.\n` +
      `• Событие: «15.10 14:00 врач», «завтра в 10 стоматолог», «пт 18:00 созвон».\n` +
      `• Трата: «350» или «350 кофе». Я спрошу категорию.\n` +
      `• Доход: «+15000» или «+15000 уроки».\n` +
      `• Идея: «💡 рилс про утро с малышом» или «идея: …».\n` +
      `• Урок: пришли HTML-файл.\n` +
      `• Методичка: пришли HTML книги с размеченными идеями.\n` +
      `• Книга для чтения: пришли PDF, EPUB или FB2.\n` +
      `• Поиск идей: «#B1 #revision», все теги: /tags\n\n` +
      `Вечером в 21:00 спрошу про дела на завтра, по воскресеньям в 20:00 пришлю итоги недели.`, MAIN_KB);
    return send(env, chat, 'Календарь, матрица, деньги, соцсети и уроки здесь:', { inline_keyboard: [[appBtn(env, '📱 Открыть планер')]] });
  }
  if (text === '/tags' || /^теги$/i.test(text)) return send(env, chat, await tagsMessage(env), { inline_keyboard: [[appBtn(env, '📚 Методика', '?tab=method')]] });
  if (/^(?:#[^\s#]+[\s,]*)+$/u.test(text)) return searchIdeas(env, chat, text);
  if (text === '/app') return send(env, chat, 'Открывай:', { inline_keyboard: [[appBtn(env, '📱 Открыть планер')]] });
  if (text === '😴 Малыш уснул') { const l = await listMessage(env, 'nap'); return send(env, chat, l.text, l.kb); }
  if (text === '📋 Дела на сегодня') { const l = await listMessage(env, 'all'); return send(env, chat, l.text, l.kb); }
  if (text === '📅 Ближайшее') return send(env, chat, await upcoming(env), { inline_keyboard: [[appBtn(env, '📅 Календарь', '?tab=cal')]] });
  if (text === '➕ Доход') { await kvSet(env, 'state', 'income'); return send(env, chat, 'Напиши сумму дохода, например «15000» или «15000 уроки».'); }

  const state = await kvGet(env, 'state');
  if (state) await kvSet(env, 'state', '');
  if (state === 'income' && /^\d/.test(text)) return routeLine(env, chat, '+' + text);

  const lines = text.split('\n').map(s => s.trim().replace(/^(?:[•\-–—*]\s*|\d{1,2}[.)]\s+)/, '').trim()).filter(Boolean);
  for (const line of lines.slice(0, 15)) await routeLine(env, chat, line);
}

async function onCallback(env, cq) {
  const owner = await getOwner(env);
  if (String(cq.from.id) !== String(owner)) return tg(env, 'answerCallbackQuery', { callback_query_id: cq.id });
  const chat = cq.message.chat.id, mid = cq.message.message_id;
  const [act, a, b] = cq.data.split(':');
  if (act === 'nodomain') return tg(env, 'answerCallbackQuery', { callback_query_id: cq.id, show_alert: true, text: 'Приложение пока не подключено: в Railway нужно создать домен (Settings → Networking → Generate Domain) и перезапустить деплой.' });
  const id = +a;
  let toast = '';
  const t = today();
  if (act === 'tq') {
    const task = await one(env, 'SELECT * FROM tasks WHERE id=?', id);
    if (task) {
      const day = task.day || t;
      await run(env, 'UPDATE tasks SET quad=?, day=? WHERE id=?', b, day, id);
      await edit(env, chat, mid, `✅ <b>${esc(task.text)}</b>\n${QUADS[b]}, ${dayRel(day)}`, taskDoneKb(id, day));
    }
  } else if (act === 'td') {
    const task = await one(env, 'SELECT * FROM tasks WHERE id=?', id);
    if (task) {
      await run(env, 'UPDATE tasks SET day=? WHERE id=?', b, id);
      await edit(env, chat, mid, `✅ <b>${esc(task.text)}</b>\n${task.quad ? QUADS[task.quad] + ', ' : ''}${dayRel(b)}`, task.quad ? taskDoneKb(id, b) : quadKb(id));
    }
  } else if (act === 'ti') {
    const task = await one(env, 'SELECT * FROM tasks WHERE id=?', id);
    if (task) {
      await run(env, 'INSERT INTO ideas (text, created) VALUES (?, ?)', task.text, stamp());
      await run(env, 'DELETE FROM tasks WHERE id=?', id);
      await edit(env, chat, mid, `💡 В банке идей: <b>${esc(task.text)}</b>`);
    }
  } else if (act === 'tx') {
    const task = await one(env, 'SELECT text FROM tasks WHERE id=?', id);
    await run(env, 'DELETE FROM tasks WHERE id=?', id);
    await edit(env, chat, mid, `<s>${esc(task ? task.text : 'Дело')}</s> удалено`);
  } else if (act === 'tdone') {
    await run(env, 'UPDATE tasks SET done=1, done_at=? WHERE id=?', t, id);
    const l = await listMessage(env, b);
    await edit(env, chat, mid, l.text, l.kb);
    toast = 'Готово! 🎉';
  } else if (act === 'mc' || act === 'mi') {
    const row = await one(env, 'SELECT * FROM money WHERE id=?', id);
    if (row) {
      await run(env, 'UPDATE money SET cat=? WHERE id=?', b, id);
      const mon = monday(t), mk = t.slice(0, 7);
      const w = await sums(env, mon, addDays(mon, 6));
      if (act === 'mc') {
        await edit(env, chat, mid, `💸 ${rub(row.amount)}${row.note ? ' — ' + esc(row.note) : ''}, ${EXP[b]}\nРасходы за неделю: ${rub(w.exp)}`);
      } else {
        const m = await sums(env, mk + '-01', mk + '-31');
        const gw = await goal(env, 'w:' + mon), gm = await goal(env, 'm:' + mk);
        await edit(env, chat, mid, `💰 +${rub(row.amount)}${row.note ? ' — ' + esc(row.note) : ''}, ${INC[b]}\n\nДоход за неделю: ${vs(w.inc, gw.income)}\nИз них работа: ${vs(w.work, gw.work)}\nДоход за месяц: ${vs(m.inc, gm.income)}`);
      }
    }
  } else if (act === 'mt') {
    const row = await one(env, 'SELECT * FROM money WHERE id=?', id);
    await run(env, 'DELETE FROM money WHERE id=?', id);
    if (row) { await edit(env, chat, mid, 'Хорошо, это дело.'); await newTaskPrompt(env, chat, `${num(row.amount)}${row.note ? ' ' + row.note : ''}`, +nowHM().slice(0, 2) >= 18 ? addDays(t, 1) : t); }
  } else if (act === 'mx') {
    await run(env, 'DELETE FROM money WHERE id=?', id);
    await edit(env, chat, mid, 'Отменено.');
  } else if (act === 'ex' || act === 'et') {
    const ev = await one(env, 'SELECT * FROM events WHERE id=?', id);
    await run(env, 'DELETE FROM events WHERE id=?', id);
    if (act === 'ex') await edit(env, chat, mid, 'Событие удалено.');
    else if (ev) { await edit(env, chat, mid, 'Хорошо, это дело.'); await newTaskPrompt(env, chat, `${ev.title}${ev.time ? ' (' + ev.time + ')' : ''}`, ev.date); }
  } else if (act === 'carry') {
    const r = await run(env, 'UPDATE tasks SET day=? WHERE done=0 AND quad IS NOT NULL AND day <= ?', addDays(a, 1), a);
    toast = `Перенесла: ${r.meta.changes}`;
    await tg(env, 'editMessageReplyMarkup', { chat_id: chat, message_id: mid, reply_markup: { inline_keyboard: [[appBtn(env, '📱 Открыть дела', '?tab=tasks')]] } });
  }
  return tg(env, 'answerCallbackQuery', { callback_query_id: cq.id, text: toast });
}

// ---------- напоминания (cron) ----------
async function sendOnce(env, key, fn) {
  const r = await run(env, 'INSERT OR IGNORE INTO sent (k, at) VALUES (?, ?)', key, stamp());
  if (r.meta.changes === 1) await fn();
}
async function tick(env) {
  const chat = await kvGet(env, 'chat');
  if (!chat) return;
  const now = Date.now(), t = today(), hm = nowHM();
  const evs = await eventsInRange(env, t, addDays(t, 2));
  for (const e of evs) {
    if (e.time) {
      const T = evMs(e.date, e.time);
      if (now >= T - 864e5 && now < T - 864e5 + 2 * 3600e3)
        await sendOnce(env, `d:${e.key}:${e.date}`, () => send(env, chat, `🔔 Завтра в <b>${e.time}</b> — ${esc(e.title)}`));
      if (now >= T - 3600e3 && now < T) {
        const mins = Math.max(1, Math.round((T - now) / 60e3));
        await sendOnce(env, `h:${e.key}:${e.date}`, () => send(env, chat, `⏰ ${mins >= 55 ? 'Через час' : 'Через ' + mins + ' мин'}: <b>${esc(e.title)}</b> в ${e.time}`));
      }
    } else if (e.date === addDays(t, 1) && hm >= '10:00') {
      await sendOnce(env, `d:${e.key}:${e.date}`, () => send(env, chat, `🔔 Завтра: <b>${esc(e.title)}</b>`));
    }
  }
  if (weekday(t) === 7 && hm >= '20:00') await sendOnce(env, 'rev:' + monday(t), () => weeklyReview(env, chat));
  if (hm >= '21:00') await sendOnce(env, 'eve:' + t, () => evening(env, chat));
  if (hm >= '04:00' && hm < '04:05') await sendOnce(env, 'clean:' + t, () => run(env, 'DELETE FROM sent WHERE at < ?', new Date(now - 30 * 864e5).toISOString()));
}

async function evening(env, chat) {
  const t = today(), tm = addDays(t, 1), h = await husband(env);
  const evs = await eventsInRange(env, tm, tm);
  const left = await one(env, 'SELECT COUNT(*) n FROM tasks WHERE done=0 AND quad IS NOT NULL AND day <= ?', t);
  const due = await one(env, 'SELECT COUNT(*) n FROM cards WHERE due <= ?', tm);
  let text = `🌙 <b>Завтра ${fmtDay(tm)}</b>\n${shiftOn(tm, h) ? '👷 Муж на смене' : '🏡 Муж дома'}`;
  text += evs.length ? '\n' + evs.map(evLine).join('\n') : '\nСобытий нет.';
  if (left.n) text += `\n\nНе сделано сегодня: ${left.n}. Перенести на завтра?`;
  if (due.n) text += `\n\n🔤 Завтра на повторение: ${due.n} ${plural(due.n, 'слово', 'слова', 'слов')}.`;
  text += '\n\n✍️ <b>Какие дела на завтра?</b> Пиши, можно списком: каждое дело с новой строки.';
  const kb = [];
  if (left.n) kb.push([{ text: `➡️ Перенести ${left.n} на завтра`, callback_data: `carry:${t}` }]);
  kb.push([appBtn(env, '📱 Открыть дела', '?tab=tasks')]);
  return send(env, chat, text, { inline_keyboard: kb });
}

async function weeklyReview(env, chat) {
  const t = today(), mon = monday(t), sun = addDays(mon, 6), mk = t.slice(0, 7);
  const tk = await one(env, 'SELECT COUNT(*) n, SUM(done) d FROM tasks WHERE quad IS NOT NULL AND day BETWEEN ? AND ?', mon, sun);
  const w = await sums(env, mon, sun), m = await sums(env, mk + '-01', mk + '-31');
  const gw = await goal(env, 'w:' + mon), gm = await goal(env, 'm:' + mk);
  const soc = await all(env, 'SELECT key, goal, done FROM social WHERE week=?', mon);
  const reviewed = +((await kvGet(env, 'rev:' + mon)) || 0);
  const incCount = await one(env, "SELECT COUNT(*) n FROM money WHERE kind='inc' AND day BETWEEN ? AND ?", mon, sun);
  let text = `☀️ <b>Итоги недели</b> (${fmtRange(mon, sun)})\n\n`;
  text += `<b>Дела:</b> сделано ${tk.d || 0} из ${tk.n || 0}\n\n`;
  text += `<b>Доход:</b> ${vs(w.inc, gw.income)}\nработа: ${vs(w.work, gw.work)}\nза месяц: ${vs(m.inc, gm.income)}\n\n`;
  text += `<b>Расходы:</b> ${rub(w.exp)}`;
  const parts = Object.keys(EXP).filter(k => w.byCat[k]).map(k => `${EXP[k]} ${rub(w.byCat[k])}`);
  if (parts.length) text += '\n' + parts.join('\n');
  text += '\n\n<b>Соцсети:</b>';
  for (const k of Object.keys(SOC)) {
    const s = soc.find(x => x.key === k) || { goal: 0, done: 0 };
    text += `\n${SOC[k]}: ${s.done}${s.goal ? ' из ' + s.goal : ''}${s.goal && s.done >= s.goal ? ' ✅' : ''}`;
  }
  text += `\n\n<b>Повторено слов:</b> ${reviewed}`;
  if (!incCount.n) text += '\n\n💰 Доход за эту неделю ещё не внесён: просто отправь «+сумма».';
  text += '\n\nПоставь цели на следующую неделю 👇';
  return send(env, chat, text, { inline_keyboard: [[appBtn(env, '🎯 Цели по деньгам', '?tab=money'), appBtn(env, '📱 Цели по соцсетям', '?tab=social')]] });
}

// ---------- лексика из HTML ----------
function parseLiteral(src, i) {
  // возвращает [значение, следующий индекс]; строки и массивы строк, остальное -> null
  const ws = () => { while (i < src.length && /[\s,]/.test(src[i])) i++; };
  ws();
  const c = src[i];
  if (c === '[') {
    i++; const arr = [];
    for (let guard = 0; guard < 5000; guard++) {
      ws(); if (src[i] === ']') return [arr, i + 1];
      if (i >= src.length) return [arr, i];
      const [v, j] = parseLiteral(src, i); arr.push(v); i = j;
    }
    return [arr, i];
  }
  if (c === '"' || c === "'" || c === '`') {
    let j = i + 1, out = '';
    while (j < src.length && src[j] !== c) {
      if (src[j] === '\\') { const n = src[j + 1]; out += n === 'n' ? '\n' : n; j += 2; } else out += src[j++];
    }
    return [out, j + 1];
  }
  // пропускаем прочее до , или ] на своём уровне
  let depth = 0, j = i;
  for (; j < src.length; j++) {
    const ch = src[j];
    if (ch === '"' || ch === "'" || ch === '`') { const [, k] = parseLiteral(src, j); j = k - 1; continue; }
    if (ch === '[' || ch === '{' || ch === '(') depth++;
    else if (ch === ']' || ch === '}' || ch === ')') { if (depth === 0) break; depth--; }
    else if (ch === ',' && depth === 0) break;
  }
  return [null, j === i ? i + 1 : j];
}
function jsArrays(html) {
  const out = {}; const re = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\[/g; let m, n = 0;
  while ((m = re.exec(html)) && n++ < 200) {
    try { const [v] = parseLiteral(html, m.index + m[0].length - 1); if (Array.isArray(v)) out[m[1]] = v; } catch (e) { }
  }
  return out;
}
const isStr = x => typeof x === 'string';
const hasCyr = s => /[а-яё]/i.test(s);
const isLat = s => /[a-z]/i.test(s) && !hasCyr(s);
const words = s => s.trim().split(/\s+/).filter(Boolean).length;
const norm = s => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'for', 'in', 'on', 'at', 'by', 'sth', 'sb', 'smb', 'someone', 'something', "one's", 'do', 'does', 'that', 'be', 'is', 'all', 'most', 'and', 'or', 'with']);
const contentWords = s => norm(s).split(/[^a-z']+/).filter(w => w && !STOP.has(w));
function coreOf(t) {
  return norm(t).replace(/\([^)]*\)/g, ' ').replace(/\b(sth|sb|smb|someone|something|one's|somebody)\b/g, ' ').replace(/\s+/g, ' ').trim();
}
function extractVocab(html) {
  const A = jsArrays(html), items = [];
  const byKey = new Map();
  const add = (t, d, extra = {}) => {
    t = (t || '').replace(/<[^>]+>/g, '').trim(); if (!t || t.length > 80) return null;
    const k = norm(t); if (byKey.has(k)) return byKey.get(k);
    const it = { t, d: d || '', ru: '', ipa: '', k: [] , ...extra };
    const c = coreOf(t); for (const v of c.split('/')) if (v.trim().length > 1) it.k.push(v.trim());
    items.push(it); byKey.set(k, it); return it;
  };
  const arrays = Object.values(A).filter(a => a.length);
  // 1) пары "термин + буква" и "буква + определение"
  const letterDefs = arrays.filter(a => a.every(r => Array.isArray(r) && r.length >= 2 && isStr(r[0]) && /^[a-z0-9]{1,2}$/i.test(r[0]) && isStr(r[1]) && words(r[1]) >= 3));
  const termRows = arrays.filter(a => a.every(r => Array.isArray(r) && r.length >= 2 && isStr(r[0]) && isLat(r[0]) && words(r[0]) <= 7 && isStr(r[r.length - 1]) && /^[a-z0-9]{1,2}$/i.test(r[r.length - 1])));
  for (const tr of termRows) {
    for (const ld of letterDefs) {
      const map = new Map(ld.map(r => [r[0].toLowerCase(), r[1]]));
      if (!tr.every(r => map.has(r[r.length - 1].toLowerCase()))) continue;
      for (const r of tr) add(r[0], map.get(r[r.length - 1].toLowerCase()), { ipa: r.length > 2 && isStr(r[1]) && r[1].includes('/') ? r[1] : '' });
    }
  }
  // 2) прямые пары [термин, определение/перевод]
  for (const a of arrays) {
    if (a.length < 3) continue;
    const pairs = a.filter(r => Array.isArray(r) && r.length >= 2 && r.length <= 3 && isStr(r[0]) && isStr(r[1]) && isLat(r[0]) && words(r[0]) <= 6 && words(r[1]) >= 1 && !/^[a-z0-9]{1,2}$/i.test(r[1]) && !/^[a-z0-9]{1,2}$/i.test(r[0]));
    if (pairs.length < Math.max(3, a.length * 0.8)) continue;
    for (const r of pairs) {
      if (hasCyr(r[1])) { const it = add(r[0], ''); if (it && !it.ru) it.ru = r[1]; }
      else if (words(r[1]) >= 3) add(r[0], r[1]);
    }
  }
  // 3) предложения с переводом: [начало, перевод, конец, [ответы]] -> ключи и перевод
  for (const a of arrays) for (const r of a) {
    if (!Array.isArray(r) || r.length < 4 || !Array.isArray(r[3]) || !isStr(r[1]) || !hasCyr(r[1])) continue;
    const answers = r[3].filter(isStr); if (!answers.length) continue;
    const it = matchItem(items, answers[0]) || add(answers[0], '');
    if (!it) continue;
    if (!it.ru) it.ru = r[1];
    for (const ans of answers) pushKey(it, ans);
  }
  // 4) плоский список ключевых выражений
  for (const a of arrays) {
    if (a.length < 3 || a.length > 60 || !a.every(x => isStr(x) && isLat(x) && words(x) <= 5)) continue;
    if (a.some(x => /[?!]/.test(x))) continue;
    const matched = a.filter(x => matchItem(items, x)).length;
    if (items.length && matched < a.length / 2) continue;
    for (const x of a) { const it = matchItem(items, x); if (it) pushKey(it, x); else if (!items.length) add(x, ''); }
  }
  return items.slice(0, 120).map(it => ({ t: it.t, d: it.d, ru: it.ru, ipa: it.ipa, k: [...new Set(it.k.map(norm))].filter(Boolean) }));
}
function pushKey(it, s) { const c = coreOf(s); if (c && c.length > 1) it.k.push(c); }
function matchItem(items, s) {
  const c = coreOf(s), cw = contentWords(s);
  let best = null, bestScore = 0;
  for (const it of items) {
    const tc = coreOf(it.t);
    if (tc === c || tc.includes(c) || c.includes(tc)) return it;
    const tw = contentWords(it.t); if (!tw.length || !cw.length) continue;
    const overlap = cw.filter(w => tw.some(x => x === w || (x.length > 3 && (w.startsWith(x) || x.startsWith(w))))).length;
    const score = overlap / Math.max(tw.length, cw.length);
    if (overlap && score > bestScore) { best = it; bestScore = score; }
  }
  return bestScore >= 0.5 ? best : null;
}

// ---------- проверка входа из мини-приложения ----------
async function checkInit(env, initData) {
  if (!initData) return null;
  const p = new URLSearchParams(initData); const hash = p.get('hash'); if (!hash) return null; p.delete('hash');
  const dcs = [...p.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n');
  const enc = new TextEncoder();
  const k1 = await crypto.subtle.importKey('raw', enc.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const secret = await crypto.subtle.sign('HMAC', k1, enc.encode(env.BOT_TOKEN));
  const k2 = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k2, enc.encode(dcs)));
  const hex = [...sig].map(b => b.toString(16).padStart(2, '0')).join('');
  if (hex !== hash) return null;
  try { return JSON.parse(p.get('user')); } catch (e) { return null; }
}

// ---------- API мини-приложения ----------
async function api(env, op, a) {
  const t = today();
  switch (op) {
    case 'today': {
      const h = await husband(env);
      const evs = await eventsInRange(env, t, t);
      const due = await one(env, 'SELECT COUNT(*) n FROM cards WHERE due <= ?', t);
      return { today: t, hm: nowHM(), events: evs, shift: shiftOn(t, h), due: due.n };
    }
    case 'tasks': {
      const day = a.day || t;
      const rows = day === t
        ? await all(env, 'SELECT * FROM tasks WHERE quad IS NOT NULL AND (day=? OR (day<? AND done=0)) ORDER BY done, day, id', day, day)
        : await all(env, 'SELECT * FROM tasks WHERE quad IS NOT NULL AND day=? ORDER BY done, id', day);
      return { day, today: t, tasks: rows };
    }
    case 'task.add': {
      if (!a.text || !QUADS[a.quad]) throw new Error('Нужен текст и колонка');
      await run(env, 'INSERT INTO tasks (text, quad, day, created) VALUES (?, ?, ?, ?)', a.text.trim(), a.quad, a.day || t, stamp());
      return { ok: true };
    }
    case 'task.upd': {
      const cur = await one(env, 'SELECT * FROM tasks WHERE id=?', a.id); if (!cur) throw new Error('Дело не найдено');
      const quad = a.quad && QUADS[a.quad] ? a.quad : cur.quad;
      const day = a.day || cur.day;
      const done = a.done === undefined ? cur.done : (a.done ? 1 : 0);
      const text = a.text ? a.text.trim() : cur.text;
      await run(env, 'UPDATE tasks SET quad=?, day=?, done=?, done_at=?, text=? WHERE id=?', quad, day, done, done ? (cur.done_at || t) : null, text, a.id);
      return { ok: true };
    }
    case 'task.del': await run(env, 'DELETE FROM tasks WHERE id=?', a.id); return { ok: true };

    case 'cal': {
      const [y, m] = a.month.split('-').map(Number);
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const from = `${a.month}-01`, to = `${a.month}-${String(last).padStart(2, '0')}`;
      const h = await husband(env);
      const shifts = [];
      for (let d = from; d <= to; d = addDays(d, 1)) if (shiftOn(d, h)) shifts.push(d);
      return { events: await eventsInRange(env, from, to), shifts, recurring: await all(env, 'SELECT * FROM recurring ORDER BY weekday, time'), husband: h, today: t };
    }
    case 'event.add':
      if (!a.title || !a.date) throw new Error('Нужны дата и название');
      await run(env, 'INSERT INTO events (title, date, time) VALUES (?, ?, ?)', a.title.trim(), a.date, a.time || null); return { ok: true };
    case 'event.del': await run(env, 'DELETE FROM events WHERE id=?', a.id); return { ok: true };
    case 'rec.add':
      if (!a.title || !a.time || !(a.weekday >= 1 && a.weekday <= 7)) throw new Error('Нужны день, время и название');
      await run(env, 'INSERT INTO recurring (title, weekday, time) VALUES (?, ?, ?)', a.title.trim(), +a.weekday, a.time); return { ok: true };
    case 'rec.del': await run(env, 'DELETE FROM recurring WHERE id=?', a.id); return { ok: true };
    case 'husband.set':
      await kvSet(env, 'husband', JSON.stringify({ start: a.start, end: a.end || '', on: +a.on || 2, off: +a.off || 2 })); return { ok: true };

    case 'money': {
      const month = a.month || t.slice(0, 7), mon = monday(t);
      return {
        today: t, month, week: mon, weekEnd: addDays(mon, 6),
        weekSums: await sums(env, mon, addDays(mon, 6)), monthSums: await sums(env, month + '-01', month + '-31'),
        weekGoal: await goal(env, 'w:' + mon), monthGoal: await goal(env, 'm:' + month),
        items: await all(env, 'SELECT * FROM money WHERE day BETWEEN ? AND ? AND cat IS NOT NULL ORDER BY day DESC, id DESC', month + '-01', month + '-31'),
      };
    }
    case 'money.add': {
      const amount = +a.amount;
      if (!(amount > 0)) throw new Error('Сумма должна быть больше нуля');
      if (!['exp', 'inc'].includes(a.kind)) throw new Error('Неизвестный тип');
      const cats = a.kind === 'exp' ? EXP : INC;
      await run(env, 'INSERT INTO money (kind, amount, cat, note, day, created) VALUES (?, ?, ?, ?, ?, ?)', a.kind, amount, cats[a.cat] ? a.cat : 'other', a.note || '', a.day || t, stamp());
      return { ok: true };
    }
    case 'money.del': await run(env, 'DELETE FROM money WHERE id=?', a.id); return { ok: true };
    case 'goals.set':
      await run(env, 'INSERT INTO goals (period, income, work) VALUES (?, ?, ?) ON CONFLICT(period) DO UPDATE SET income=excluded.income, work=excluded.work', a.period, +a.income || 0, +a.work || 0);
      return { ok: true };

    case 'social': {
      const week = a.week || monday(t);
      const rows = await all(env, 'SELECT key, goal, done FROM social WHERE week=?', week);
      const items = {}; for (const k of Object.keys(SOC)) items[k] = rows.find(r => r.key === k) || { key: k, goal: 0, done: 0 };
      return { week, weekEnd: addDays(week, 6), current: monday(t), items, ideas: await all(env, 'SELECT * FROM ideas ORDER BY id DESC') };
    }
    case 'social.set': {
      if (!SOC[a.key]) throw new Error('Неизвестная соцсеть');
      await run(env, 'INSERT OR IGNORE INTO social (week, key) VALUES (?, ?)', a.week, a.key);
      if (a.goal !== undefined) await run(env, 'UPDATE social SET goal=MAX(0, ?) WHERE week=? AND key=?', +a.goal, a.week, a.key);
      if (a.delta) await run(env, 'UPDATE social SET done=MAX(0, done + ?) WHERE week=? AND key=?', +a.delta, a.week, a.key);
      return { ok: true };
    }
    case 'idea.add': if (!a.text) throw new Error('Пустая идея'); await run(env, 'INSERT INTO ideas (text, created) VALUES (?, ?)', a.text.trim(), stamp()); return { ok: true };
    case 'idea.del': await run(env, 'DELETE FROM ideas WHERE id=?', a.id); return { ok: true };

    case 'lang': {
      const lessons = await all(env, 'SELECT id, title, created, vocab FROM lessons ORDER BY created DESC, rowid DESC');
      return {
        today: t,
        lessons: lessons.map(l => ({ id: l.id, title: l.title, created: l.created, count: JSON.parse(l.vocab || '[]').length })),
        cards: await all(env, 'SELECT * FROM cards ORDER BY due, id'),
      };
    }
    case 'method': {
      const books = await all(env, 'SELECT * FROM books ORDER BY created DESC, rowid DESC');
      const ideas = (await all(env, 'SELECT * FROM mideas ORDER BY id DESC')).map(r => ({ ...r, tags: parseTags(r.tags) }));
      return { books, ideas };
    }
    case 'book.get': return await one(env, 'SELECT id, title, part FROM books WHERE id=?', a.id);
    case 'book.del':
      await env.LESSONS.delete(a.id);
      await run(env, 'DELETE FROM books WHERE id=?', a.id);
      await run(env, "UPDATE mideas SET ref = book || ':' || ref, book = '' WHERE book=?", a.id);
      return { ok: true };
    case 'midea.state': return bookState(env, a.book || '');
    case 'midea.save': {
      const tags = JSON.stringify(cleanTags(a.tags)), note = String(a.note || '').trim().slice(0, 2000);
      if (a.id) {
        await run(env, 'UPDATE mideas SET tags=?, note=?, title=COALESCE(?, title), text=COALESCE(?, text), page=COALESCE(?, page), book_title=COALESCE(?, book_title) WHERE id=?',
          tags, note, a.title ?? null, a.text ?? null, a.page ?? null, a.book ? null : (a.book_title ?? null), a.id);
        return { ok: true };
      }
      if (!String(a.title || '').trim() && !String(a.text || '').trim()) throw new Error('Пустая идея');
      const book = a.book || '';
      let bt = String(a.book_title || '').trim();
      if (book) { const b = await one(env, 'SELECT title FROM books WHERE id=?', book); if (b) bt = b.title; }
      await run(env, `INSERT INTO mideas (book, book_title, ref, title, text, page, tags, note, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(book, ref) DO UPDATE SET tags=excluded.tags, note=excluded.note, title=excluded.title, text=excluded.text, page=excluded.page`,
        book, bt, a.ref || 'm' + Date.now(), String(a.title || '').trim().slice(0, 200), String(a.text || '').trim().slice(0, 20000), String(a.page || '').slice(0, 20), tags, note, stamp());
      return book ? bookState(env, book) : { ok: true };
    }
    case 'midea.del':
      if (a.id) await run(env, 'DELETE FROM mideas WHERE id=?', a.id);
      else await run(env, 'DELETE FROM mideas WHERE book=? AND ref=?', a.book || '', a.ref || '');
      return a.book ? bookState(env, a.book) : { ok: true };
    case 'mtag.rename': {
      const from = normTag(a.from), to = normTag(a.to || '');
      if (!from) throw new Error('Нет тега');
      for (const r of await all(env, 'SELECT id, tags FROM mideas')) {
        const t = parseTags(r.tags); if (!t.includes(from)) continue;
        await run(env, 'UPDATE mideas SET tags=? WHERE id=?', JSON.stringify(cleanTags(t.map(x => (x === from ? to : x)))), r.id);
      }
      return { ok: true };
    }
    case 'read': {
      const books = await all(env, `SELECT b.*, (SELECT COUNT(*) FROM rnotes n WHERE n.book = b.id) notes FROM rbooks b ORDER BY COALESCE(b.opened, b.created) DESC, b.rowid DESC`);
      const notes = (await all(env, 'SELECT * FROM rnotes ORDER BY id DESC')).map(r => ({ ...r, tags: parseTags(r.tags), anchor: undefined }));
      return { books, notes };
    }
    case 'rbook.get': return await one(env, 'SELECT id, title FROM rbooks WHERE id=?', a.id);
    case 'rbook.state': return readState(env, a.book);
    case 'rbook.pos':
      await run(env, 'UPDATE rbooks SET pos=?, pct=?, opened=? WHERE id=?', Math.max(0, a.pos | 0), Math.min(1, Math.max(0, +a.pct || 0)), stamp(), a.book);
      return { ok: true };
    case 'rbook.del':
      await env.LESSONS.delete(a.id);
      await run(env, 'DELETE FROM rbooks WHERE id=?', a.id);
      await run(env, "UPDATE rnotes SET book = '' WHERE book=?", a.id);
      return { ok: true };
    case 'rnote.save': {
      const tags = JSON.stringify(cleanTags(a.tags)), note = String(a.note || '').trim().slice(0, 4000);
      if (a.id) await run(env, 'UPDATE rnotes SET tags=?, note=? WHERE id=?', tags, note, a.id);
      else {
        if (!String(a.quote || '').trim()) throw new Error('Пустое выделение');
        const b = await one(env, 'SELECT title FROM rbooks WHERE id=?', a.book);
        await run(env, 'INSERT INTO rnotes (book, book_title, quote, anchor, pos, page, chapter, note, tags, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          a.book, b ? b.title : '', String(a.quote).trim().slice(0, 6000), JSON.stringify(a.anchor || null), (a.anchor && a.anchor.s) | 0, String(a.page || '').slice(0, 20), String(a.chapter || '').slice(0, 200), note, tags, stamp());
      }
      return a.book ? readState(env, a.book) : { ok: true };
    }
    case 'rnote.del':
      await run(env, 'DELETE FROM rnotes WHERE id=?', a.id);
      return a.book ? readState(env, a.book) : { ok: true };
    case 'rtag.rename': {
      const from = normTag(a.from), to = normTag(a.to || '');
      if (!from) throw new Error('Нет тега');
      for (const r of await all(env, 'SELECT id, tags FROM rnotes')) {
        const t = parseTags(r.tags); if (!t.includes(from)) continue;
        await run(env, 'UPDATE rnotes SET tags=? WHERE id=?', JSON.stringify(cleanTags(t.map(x => (x === from ? to : x)))), r.id);
      }
      return { ok: true };
    }
    case 'lesson.get': return await one(env, 'SELECT id, title FROM lessons WHERE id=?', a.id);
    case 'lesson.del': await env.LESSONS.delete(a.id); await run(env, 'DELETE FROM lessons WHERE id=?', a.id); return { ok: true };
    case 'card.add': {
      const list = Array.isArray(a.items) ? a.items : [a];
      for (const c of list) {
        if (!c.term) continue;
        await run(env, 'INSERT OR IGNORE INTO cards (term, term_l, def, lesson, stage, due, created) VALUES (?, ?, ?, ?, 0, ?, ?)',
          c.term.trim(), norm(c.term), (c.def || '').trim(), c.lesson || '', addDays(t, 1), stamp());
      }
      return { ok: true, terms: (await all(env, 'SELECT term_l FROM cards')).map(r => r.term_l) };
    }
    case 'card.terms': return { terms: (await all(env, 'SELECT term_l FROM cards')).map(r => r.term_l) };
    case 'card.review': {
      const c = await one(env, 'SELECT * FROM cards WHERE id=?', a.id); if (!c) throw new Error('Карточка не найдена');
      const stage = a.ok ? Math.min(c.stage + 1, INTERVALS.length - 1) : 0;
      const due = addDays(t, a.ok ? INTERVALS[stage] : 1);
      await run(env, 'UPDATE cards SET stage=?, due=?, last=? WHERE id=?', stage, due, t, a.id);
      const k = 'rev:' + monday(t); await kvSet(env, k, +((await kvGet(env, k)) || 0) + 1);
      return { ok: true, due };
    }
    case 'card.upd': await run(env, 'UPDATE cards SET def=? WHERE id=?', a.def || '', a.id); return { ok: true };
    case 'card.del': await run(env, 'DELETE FROM cards WHERE id=?', a.id); return { ok: true };
  }
  throw new Error('Неизвестная операция');
}

// ---------- точка входа ----------
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const safeJson = v => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    env.__base = (await kvGetSafe(env, 'base')) || url.origin;
    await init(env);
    const path = url.pathname;

    if (path === '/' && req.method === 'GET')
      return new Response(APP_HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });

    if (path === '/webhook' && req.method === 'POST') {
      if (req.headers.get('x-telegram-bot-api-secret-token') !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
      const u = await req.json();
      try {
        if (u.message) await onMessage(env, u.message);
        else if (u.callback_query) await onCallback(env, u.callback_query);
      } catch (e) { console.log('update error', e && e.stack || e); }
      return new Response('ok');
    }

    if (path === '/api' && req.method === 'POST') {
      const user = await checkInit(env, req.headers.get('x-init-data'));
      const owner = await getOwner(env);
      if (!user || String(user.id) !== String(owner)) return json({ error: 'Открой приложение через своего бота в Telegram.' }, 401);
      try { const { op, args } = await req.json(); return json(await api(env, op, args || {})); }
      catch (e) { return json({ error: e.message || 'Ошибка' }, 400); }
    }

    const rm = path.match(/^\/read\/([a-z0-9]{8,32})$/);
    if (rm) {
      const html = await env.LESSONS.get(rm[1]);
      if (!html) return new Response('Книга не найдена', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      const row = await one(env, 'SELECT title FROM rbooks WHERE id=?', rm[1]);
      const tag = `<script>window.__RB=${safeJson({ id: rm[1], title: row ? row.title : '' })};</script><script>${INJECT_READ_JS}</script>`;
      const i = html.toLowerCase().lastIndexOf('</body>');
      const out = i >= 0 ? html.slice(0, i) + tag + html.slice(i) : html + tag;
      return new Response(out, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    }

    if (path === '/upload' && req.method === 'POST') {
      const user = await checkInit(env, req.headers.get('x-init-data'));
      const owner = await getOwner(env);
      if (!user || String(user.id) !== String(owner)) return json({ error: 'Открой приложение через своего бота в Telegram.' }, 401);
      const name = decodeURIComponent(req.headers.get('x-file-name') || 'file');
      const buf = new Uint8Array(await req.arrayBuffer());
      if (!buf.length) return json({ error: 'Пустой файл' }, 400);
      if (buf.length > 80 * 1024 * 1024) return json({ error: 'Файл больше 80 МБ' }, 400);
      const r = await ingestFile(env, name, buf, req.headers.get('x-caption') || '');
      return json({ ok: !!r.kind, kind: r.kind, id: r.id, message: r.text.replace(/<[^>]+>/g, '') });
    }

    const bm = path.match(/^\/book\/([a-z0-9]{8,32})$/);
    if (bm) {
      const html = await env.LESSONS.get(bm[1]);
      if (!html) return new Response('Книга не найдена', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      const row = await one(env, 'SELECT title FROM books WHERE id=?', bm[1]);
      const tag = `<script>window.__BK=${safeJson({ id: bm[1], title: row ? row.title : '' })};</script><script>${INJECT_BOOK_JS}</script>`;
      const i = html.toLowerCase().lastIndexOf('</body>');
      const out = i >= 0 ? html.slice(0, i) + tag + html.slice(i) : html + tag;
      return new Response(out, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    }

    const lm = path.match(/^\/lesson\/([a-z0-9]{8,32})$/);
    if (lm) {
      const html = await env.LESSONS.get(lm[1]);
      if (!html) return new Response('Урок не найден', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      const row = await one(env, 'SELECT title, vocab FROM lessons WHERE id=?', lm[1]);
      const tag = `<script>window.__LX=${safeJson({ id: lm[1], title: row ? row.title : '', vocab: row ? JSON.parse(row.vocab || '[]') : [] })};</script><script>${INJECT_JS}</script>`;
      const i = html.toLowerCase().lastIndexOf('</body>');
      const out = i >= 0 ? html.slice(0, i) + tag + html.slice(i) : html + tag;
      return new Response(out, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    }

    if (path === '/setup') {
      if (!env.WEBHOOK_SECRET || url.searchParams.get('key') !== env.WEBHOOK_SECRET)
        return new Response('Добавь в конец адреса ?key= и твой WEBHOOK_SECRET', { status: 403, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      await kvSet(env, 'base', url.origin); env.__base = url.origin;
      const r1 = url.searchParams.get('poll')
        ? { ok: true }
        : await tg(env, 'setWebhook', { url: url.origin + '/webhook', secret_token: env.WEBHOOK_SECRET, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
      const r2 = await tg(env, 'setChatMenuButton', { menu_button: { type: 'web_app', text: 'Планер', web_app: { url: url.origin + '/' } } });
      const r3 = await tg(env, 'setMyCommands', { commands: [{ command: 'start', description: 'Подсказка и клавиатура' }, { command: 'app', description: 'Открыть планер' }, { command: 'tags', description: 'Теги методики' }] });
      const ok = r1.ok && r2.ok;
      return new Response(ok ? '✅ Готово! Теперь напиши своему боту /start в Telegram.' : '❌ Что-то пошло не так:\n' + JSON.stringify({ r1, r2, r3 }, null, 2),
        { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
    return new Response('Not found', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      await init(env);
      env.__base = (await kvGetSafe(env, 'base')) || '';
      await tick(env);
    })());
  },
};
async function kvGetSafe(env, k) { try { await init(env); return await kvGet(env, k); } catch (e) { return null; } }
