// Brauzerda to'liq sinov: node tests/e2e/smoke.mjs (oldindan: npm run build && npx vite preview --port 4174)
import puppeteer from 'puppeteer-core';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
const BASE = process.env.BASE_URL ?? 'http://localhost:4174/';
const IMGS = process.env.IMGS ?? '/tmp/clothes';
const OUT = 'tests/e2e/shots';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [], errors = [];
const step = async (name, fn) => { try { await fn(); results.push(['OK', name]); } catch (e) { results.push(['XATO', `${name} — ${e.message}`]); } };
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const p = await b.newPage();
p.on('pageerror', (e) => errors.push(e.message));
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const go = async (h) => { await p.goto(BASE + '#' + h, { waitUntil: 'networkidle0' }); await sleep(600); };
const text = () => p.evaluate(() => document.body.innerText);
const click = async (t, scope = 'button') => {
  const ok = await p.evaluate((t, scope) => { const el = [...document.querySelectorAll(scope)].find((x) => x.innerText.trim() === t || x.getAttribute('aria-label') === t) ?? [...document.querySelectorAll(scope)].find((x) => x.innerText.trim().startsWith(t)); if (el && !el.disabled) { el.click(); return true; } return false; }, t, scope);
  if (!ok) throw new Error(`"${t}" topilmadi`);
  await sleep(350);
};
const onColors = () => p.evaluate(() => [...document.querySelectorAll('button.chip-on')].map((x) => x.innerText.trim()));
const shot = (n) => p.screenshot({ path: `${OUT}/${n}.png` });

await step('Bo‘sh garderob ochiladi', async () => {
  await go('/');
  if (!(await text()).includes('Garderobingiz hozircha bo‘sh')) throw new Error('bo‘sh holat yo‘q');
  await shot('01-bosh');
});

const expected = [
  ['Ustki kiyim', 'Sviter', 'Jigarrang'],
  ['Pastki kiyim', 'Jinsi', 'To‘q ko‘k'],
  ['Oyoq kiyim', 'Botinka', 'Qora'],
  ['Tashqi kiyim', 'Kurtka', 'Zaytun'],
  ['Ustki kiyim', 'Futbolka', 'Oq']
];
await step('Galereyadan 5 ta rasm, kesish, avtomatik rang, garderobga qo‘shish', async () => {
  await go('/qoshish');
  const input = await p.$('input[type=file][multiple]');
  await input.uploadFile(...readdirSync(IMGS).sort().map((f) => `${IMGS}/${f}`));
  await sleep(1200);
  if (!(await text()).includes('Kesish: 1 / 5')) throw new Error('kesish bosqichi yo‘q');
  await shot('02-kesish');
  await click('Keyingisi');
  await click('Qolganlarini kesmasdan davom etish');
  for (let i = 0; i < 60 && !(await text()).includes('1 / 5 ·'); i++) await sleep(300);
  await shot('03-forma');
  for (let i = 0; i < expected.length; i++) {
    const [cat, sub, col] = expected[i];
    const on = await onColors();
    if (!on.includes(col)) throw new Error(`${i + 1}-rasm: kutilgan rang ${col}, aniqlangan: ${on.join(', ')}`);
    await click(cat);
    await click(sub);
    await click(i < expected.length - 1 ? 'Qo‘shish va keyingisi' : 'Garderobga qo‘shish');
    await sleep(400);
  }
  if (!(await text()).includes('5 ta kiyim garderobga qo‘shildi')) throw new Error('yakun xabari yo‘q');
  await click('Garderobga');
});

await step('Garderob: 5 ta kiyim, nomlar avtomatik', async () => {
  const t = await text();
  for (const n of ['Jigarrang sviter', 'To‘q ko‘k jinsi', 'Qora botinka', 'Zaytun kurtka', 'Oq futbolka']) if (!t.includes(n)) throw new Error(`${n} yo‘q. Ekranda: ${t.replace(/\n+/g,' | ').slice(0,600)}`);
  await shot('04-garderob');
});

await step('Filtr: bo‘lim bo‘yicha', async () => {
  await click('Pastki kiyim · 1');
  const t = await text();
  if (t.includes('Jigarrang sviter') || !t.includes('To‘q ko‘k jinsi')) throw new Error('filtr ishlamadi');
  await click('Hammasi · 5');
});

await step('Kiyim sahifasi: “Bugun kiydim”, sevimli', async () => {
  await p.evaluate(() => [...document.querySelectorAll('main button')].find((x) => x.innerText.includes('Jigarrang sviter')).click());
  await sleep(600);
  await click('Bugun kiydim');
  await click('Sevimli');
  const t = await text();
  if (!t.includes('Bugun kiyildi')) throw new Error('belgilanmadi');
  await shot('05-kiyim');
});

await step('Bugun: tavsiya (ob-havosiz rejim) va “Kiyaman”', async () => {
  await go('/bugun');
  await sleep(1500);
  const t = await text();
  if (!t.includes('Bugungi tavsiya')) throw new Error('tavsiya yo‘q');
  if (!/To‘q ko‘k jinsi/.test(t) || !/Qora botinka/.test(t)) throw new Error('tavsiyada jinsi/botinka yo‘q');
  await shot('06-bugun');
  await click('Boshqa');
  await click('Kiyaman');
  if (!(await text()).includes('Bugun kiyganlarim')) throw new Error('blok yo‘q');
});

await step('Obraz yig‘ish va saqlash', async () => {
  await go('/obrazlar');
  await click('Yangi obraz');
  await p.type('input[placeholder="Masalan: Ish uchun klassik"]', 'Kuzgi kundalik');
  for (const n of ['Jigarrang sviter', 'To‘q ko‘k jinsi', 'Qora botinka']) await p.evaluate((n) => [...document.querySelectorAll('.fixed button')].find((x) => x.innerText.includes(n)).click(), n);
  await click('Saqlash', '.fixed button');
  await sleep(500);
  const t = await text();
  if (!t.includes('Kuzgi kundalik') || !t.includes('3 ta kiyim')) throw new Error('obraz ko‘rinmadi');
  await shot('07-obrazlar');
});

await step('Statistika', async () => {
  await go('/statistika');
  const t = await text();
  if (!t.includes('Eng ko‘p kiyilganlar') || !t.includes('Jigarrang sviter')) throw new Error('statistika yo‘q');
  await shot('08-statistika');
});

await step('Profil: zaxira (rasmlar bilan) va qorong‘i tema', async () => {
  await go('/profil');
  const c = await p.createCDPSession();
  await c.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: '/tmp/lb-dl' });
  await click('Yuklab olish');
  await sleep(1500);
  const f = readdirSync('/tmp/lb-dl').find((x) => x.startsWith('libosim-zaxira'));
  const data = JSON.parse(readFileSync('/tmp/lb-dl/' + f, 'utf8'));
  if (data.tables.items.length !== 5 || data.images.length !== 5) throw new Error(`zaxira: ${data.tables.items.length} kiyim, ${data.images?.length} rasm`);
  await click('Qorong‘i');
  await go('/');
  await shot('09-qorongi');
  await go('/profil');
  await click('Yorug‘');
});

await step('Oflayn ochiladi (rasmlar bilan)', async () => {
  await go('/');
  await p.waitForFunction(() => navigator.serviceWorker?.controller != null, { timeout: 10000 }).catch(async () => { await p.reload({ waitUntil: 'networkidle0' }); });
  await p.setOfflineMode(true);
  await p.reload({ waitUntil: 'domcontentloaded' });
  await sleep(1500);
  const t = await text();
  const imgs = await p.evaluate(() => [...document.querySelectorAll('main img')].filter((i) => i.complete && i.naturalWidth > 0).length);
  await p.setOfflineMode(false);
  if (!t.includes('Jigarrang sviter')) throw new Error('oflayn ma’lumot yo‘q');
  if (imgs < 5) throw new Error(`rasmlar: ${imgs}`);
});

await b.close();
for (const [s, n] of results) console.log(`${s === 'OK' ? '✓' : '✗'} ${n}`);
console.log(`\n${results.filter((r) => r[0] === 'OK').length}/${results.length} o‘tdi`);
const errs = errors.filter((e) => !/Failed to fetch|open-meteo|NetworkError/i.test(e));
if (errs.length) console.log('Xatolar:\n' + errs.join('\n'));
process.exit(results.some((r) => r[0] !== 'OK') ? 1 : 0);
