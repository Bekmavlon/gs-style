// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { buildGeminiRequest, handle, parseModelJson, sanitize, validate, type AiRequest } from '../supabase/functions/ai/index';

const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', GEMINI_API_KEY: 'gkey' };
const ctx: AiRequest['context'] = {
  date: '2026-11-16',
  season: 'kuz',
  weather: { city: 'Toshkent', tMin: 4, tMax: 12, precip: 60, text: 'Yomg‘ir' },
  profile: { gender: 'erkak', age: 28 },
  wardrobe: [
    { k: 'k1', n: 'Jigarrang sviter', c: 'ustki', t: 'Sviter', col: ['Jigarrang'], worn: 3 },
    { k: 'k2', n: 'To‘q ko‘k jinsi', c: 'pastki', worn: 0 },
    { k: 'k3', n: 'Qora botinka', c: 'oyoq', worn: 1, fav: true }
  ]
};
const chatReq: AiRequest = { mode: 'chat', messages: [{ role: 'user', text: 'Ertaga ishga nima kiyay?' }], context: ctx };

function mockFetch(gemini: () => Response, quota = { ok: true, used: 1, limit: 15 }) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: 'u1' }), { status: (init?.headers as Record<string, string>).Authorization === 'Bearer good' ? 200 : 401 });
    if (u.endsWith('/rpc/ai_take_quota')) return new Response(JSON.stringify(quota));
    if (u.endsWith('/rpc/ai_refund')) return new Response(null, { status: 204 });
    if (u.includes('generativelanguage.googleapis.com')) return gemini();
    return new Response('?', { status: 404 });
  });
  return { f: f as unknown as typeof fetch, calls };
}
const req = (body: unknown, token = 'good') =>
  new Request('https://x.supabase.co/functions/v1/ai', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const gem = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] }));

describe('AI server funksiyasi', () => {
  it('prompt garderob, ob-havo va JSON sxemasini o‘z ichiga oladi; kalit URL’da emas, sarlavhada', async () => {
    const g = buildGeminiRequest(chatReq);
    const sys = g.systemInstruction.parts[0].text;
    expect(sys).toContain('k1 | Jigarrang sviter | bo‘lim:ustki');
    expect(sys).toContain('4…12°C');
    expect(sys).toContain('"outfits"');
    expect(g.contents).toEqual([{ role: 'user', parts: [{ text: 'Ertaga ishga nima kiyay?' }] }]);
    const { f, calls } = mockFetch(() => gem('{"reply":"ok","outfits":[]}'));
    await handle(req(chatReq), ENV, f);
    const gc = calls.find((c) => c.url.includes('generativelanguage'))!;
    expect(gc.url).not.toContain('gkey');
    expect((gc.init!.headers as Record<string, string>)['x-goog-api-key']).toBe('gkey');
    expect(gc.url).toContain('gemini-flash-lite-latest');
  });

  it('kirmagan yoki noto‘g‘ri tokenli foydalanuvchi rad etiladi, Gemini chaqirilmaydi', async () => {
    const { f, calls } = mockFetch(() => gem('{}'));
    expect((await handle(new Request('https://x/ai', { method: 'POST', body: '{}' }), ENV, f)).status).toBe(401);
    expect((await handle(req(chatReq, 'bad'), ENV, f)).status).toBe(401);
    expect(calls.some((c) => c.url.includes('generativelanguage'))).toBe(false);
  });

  it('noto‘g‘ri so‘rovlar', () => {
    expect(validate({ mode: 'x', context: ctx })).toBe('Noma’lum rejim');
    expect(validate({ mode: 'chat', messages: [], context: ctx })).toBe('Savol yo‘q');
    expect(validate({ mode: 'rate', context: ctx })).toBe('Rasm yo‘q');
    expect(validate({ mode: 'rate', image: { mime: 'image/gif', data: 'x' }, context: ctx })).toBe('Rasm yo‘q');
    expect(typeof validate({ mode: 'shop', context: ctx })).toBe('object');
  });

  it('limit tugaganda 429, Gemini chaqirilmaydi', async () => {
    const { f, calls } = mockFetch(() => gem('{}'), { ok: false, used: 15, limit: 15 });
    const r = await handle(req(chatReq), ENV, f);
    expect(r.status).toBe(429);
    expect((await r.json()).message).toContain('limiti tugadi');
    expect(calls.some((c) => c.url.includes('generativelanguage'))).toBe(false);
  });

  it('Gemini 429 (bepul limit) — so‘rov qaytariladi va tushunarli xabar', async () => {
    const { f, calls } = mockFetch(() => new Response('quota', { status: 429 }));
    const r = await handle(req(chatReq), ENV, f);
    expect(r.status).toBe(503);
    expect((await r.json()).error).toBe('busy');
    expect(calls.some((c) => c.url.endsWith('/rpc/ai_refund'))).toBe(true);
  });

  it('muvaffaqiyatli suhbat: noma’lum kalitlar tashlanadi, ```json``` o‘rami tushuniladi', async () => {
    const { f } = mockFetch(() => gem('```json\n{"reply":"Mana obraz","outfits":[{"title":"Ish","items":["k1","k2","k99","k1"],"why":"iliq"},{"title":"Bo‘sh","items":["zz"]}]}\n```'));
    const r = await handle(req(chatReq), ENV, f);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.result).toEqual({ reply: 'Mana obraz', outfits: [{ title: 'Ish', items: ['k1', 'k2'], why: 'iliq' }] });
    expect(j.quota).toEqual({ used: 1, limit: 15 });
  });

  it('baho va xarid javoblari chegaralanadi', () => {
    const v = new Set(['k1', 'k2']);
    expect(sanitize('rate', { score: 14, summary: 's', good: ['a'], improve: [], swap: [{ items: ['k2', 'x'], why: 'w' }] }, v)).toEqual({ score: 10, summary: 's', good: ['a'], improve: [], swap: [{ items: ['k2'], why: 'w' }] });
    const s = sanitize('shop', { summary: 's', missing: [{ name: 'Oq ko‘ylak', category: 'ustki', why: 'w', priority: 3 }, { name: 'Kamar', category: 'zzz', priority: 1 }], underused: [{ items: ['k1'], tip: 't' }] }, v) as { missing: { name: string; category: string }[] };
    expect(s.missing.map((m) => [m.name, m.category])).toEqual([['Kamar', 'boshqa'], ['Oq ko‘ylak', 'ustki']]);
    expect(parseModelJson('Mana: {"a":1} tamom')).toEqual({ a: 1 });
    expect(parseModelJson('yo‘q')).toBeNull();
  });

  it('rasm baho so‘rovida rasm Gemini’ga inline yuboriladi', () => {
    const g = buildGeminiRequest({ mode: 'rate', image: { mime: 'image/jpeg', data: 'QUJD' }, context: ctx });
    expect(g.contents[0].parts[0]).toEqual({ inline_data: { mime_type: 'image/jpeg', data: 'QUJD' } });
    expect(g.systemInstruction.parts[0].text).toContain('tana tuzilishi');
  });
});
