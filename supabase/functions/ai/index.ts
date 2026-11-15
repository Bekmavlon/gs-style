// G.S.Style — AI stilist (Supabase Edge Function "ai").
// Hech qanday tashqi kutubxonasiz: Supabase panelidagi muharrirga to'g'ridan-to'g'ri qo'yish mumkin.
//
// Kerakli maxfiy sozlamalar (Supabase → Edge Functions → Secrets):
//   GEMINI_API_KEY  — Google AI Studio kaliti (HECH QACHON ilova ichiga qo'yilmaydi)
// Ixtiyoriy:
//   GEMINI_MODEL    — model nomi (standart: gemini-flash-lite-latest)
//   AI_DAILY_LIMIT  — bir foydalanuvchiga kuniga so'rovlar (standart: 15)
// SUPABASE_URL va SUPABASE_ANON_KEY Supabase tomonidan avtomatik beriladi.

export type Mode = 'chat' | 'rate' | 'shop';

export interface WardrobeEntry {
  k: string; // qisqa kalit: k1, k2...
  n: string; // nomi
  c: string; // bo'lim
  t?: string; // turi
  col?: string[]; // ranglar
  s?: string[]; // mavsumlar
  o?: string[]; // tadbirlar
  w?: number; // issiqlik 1..3
  worn?: number; // necha marta kiyilgan
  last?: string | null; // oxirgi kiyilgan sana
  fav?: boolean;
}

export interface AiRequest {
  mode: Mode;
  messages?: { role: 'user' | 'model'; text: string }[];
  note?: string;
  image?: { mime: string; data: string }; // base64
  context: {
    date: string;
    season?: string;
    weather?: { city?: string; tMin?: number; tMax?: number; precip?: number; text?: string } | null;
    profile?: { gender?: string | null; age?: number | null; height_cm?: number | null; weight_kg?: number | null };
    wardrobe: WardrobeEntry[];
  };
}

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  AI_DAILY_LIMIT?: string;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });

const fail = (status: number, error: string, message: string) => json(status, { error, message });

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

// ---------- Kirishni tekshirish ----------

export function validate(body: unknown): AiRequest | string {
  if (!body || typeof body !== 'object') return 'So‘rov noto‘g‘ri';
  const b = body as Partial<AiRequest>;
  if (b.mode !== 'chat' && b.mode !== 'rate' && b.mode !== 'shop') return 'Noma’lum rejim';
  if (!b.context || !Array.isArray(b.context.wardrobe)) return 'Garderob ma’lumoti yo‘q';
  if (b.context.wardrobe.length > 400) return 'Garderob juda katta';
  if (b.mode === 'chat') {
    if (!Array.isArray(b.messages) || !b.messages.length) return 'Savol yo‘q';
    if (b.messages.length > 20) return 'Suhbat juda uzun';
    if (b.messages[b.messages.length - 1].role !== 'user') return 'Oxirgi xabar foydalanuvchidan bo‘lishi kerak';
  }
  if (b.mode === 'rate') {
    if (!b.image || typeof b.image.data !== 'string' || !/^image\/(jpeg|png|webp)$/.test(b.image.mime)) return 'Rasm yo‘q';
    if (b.image.data.length > 2_000_000) return 'Rasm juda katta';
  }
  return b as AiRequest;
}

// ---------- Prompt ----------

function wardrobeText(items: WardrobeEntry[]): string {
  if (!items.length) return '(garderob bo‘sh)';
  return items
    .map((i) =>
      [
        str(i.k, 8),
        str(i.n, 60),
        `bo‘lim:${str(i.c, 20)}`,
        i.t ? `turi:${str(i.t, 30)}` : '',
        i.col?.length ? `rang:${i.col.slice(0, 3).map((x) => str(x, 20)).join('/')}` : '',
        i.s?.length ? `mavsum:${i.s.slice(0, 4).map((x) => str(x, 10)).join('/')}` : '',
        i.o?.length ? `tadbir:${i.o.slice(0, 6).map((x) => str(x, 12)).join('/')}` : '',
        i.w ? `issiqlik:${i.w}` : '',
        `kiyilgan:${Number(i.worn) || 0}`,
        i.last ? `oxirgi:${str(i.last, 10)}` : '',
        i.fav ? 'sevimli' : ''
      ]
        .filter(Boolean)
        .join(' | ')
    )
    .join('\n');
}

const SCHEMAS: Record<Mode, string> = {
  chat: `{"reply": "javob matni", "outfits": [{"title": "obraz nomi", "items": ["k1","k3"], "why": "nega mos (1 jumla)"}]}
- outfits: 0–3 ta. Faqat garderobdagi kalitlar. Bitta obrazda bitta bo‘limdan odatda bitta kiyim (aksessuar bundan mustasno).
- Agar garderobda kerakli narsa bo‘lmasa, reply'da nima yetishmayotganini ayt.`,
  rate: `{"score": 1-10 butun son, "summary": "umumiy fikr (2-3 jumla)", "good": ["yaxshi tomonlari"], "improve": ["nimani yaxshilash mumkin"], "swap": [{"items": ["k2"], "why": "garderobdagi qaysi kiyim bilan almashtirish yaxshiroq"}]}
- Faqat kiyim, ranglar uyg‘unligi, uslub va ob-havoga mosligini bahola. Odamning tashqi ko‘rinishi, tana tuzilishi yoki yuzi haqida gapirma.
- Rasmda kiyim ko‘rinmasa, score 0 qo‘y va summary'da yaxshiroq rasm olishni so‘ra.`,
  shop: `{"summary": "garderob haqida umumiy xulosa (2-3 jumla)", "missing": [{"name": "nima sotib olish kerak", "category": "ustki|pastki|libos|tashqi|oyoq|aksessuar", "why": "nega kerak, qaysi kiyimlar bilan mos tushadi", "priority": 1-3}], "underused": [{"items": ["k4"], "tip": "bu kiyimni qanday ko‘proq kiyish mumkin"}]}
- missing: 3–6 ta, eng muhimi priority 1. Mavjud kiyimlar bilan uyg‘unlikni hisobga ol, brend yoki narx tavsiya qilma.
- underused: kam kiyilgan yoki umuman kiyilmagan kiyimlardan 0–3 ta.`
};

export function buildPrompt(r: AiRequest): string {
  const c = r.context;
  const w = c.weather;
  const p = c.profile ?? {};
  const prof = [
    p.gender === 'erkak' ? 'erkak' : p.gender === 'ayol' ? 'ayol' : '',
    p.age ? `${p.age} yosh` : '',
    p.height_cm ? `bo‘yi ${p.height_cm} sm` : '',
    p.weight_kg ? `vazni ${p.weight_kg} kg` : ''
  ]
    .filter(Boolean)
    .join(', ');
  return `Sen G.S.Style ilovasidagi shaxsiy stilistsan. Faqat o‘zbek tilida (lotin yozuvida), samimiy, aniq va qisqa yoz.
Foydalanuvchining garderobi quyida: har bir kiyim qisqa kalit bilan (k1, k2, ...). Obraz yoki kiyim tavsiya qilganda FAQAT shu kalitlardan foydalan, garderobda yo‘q kiyimni bor deb ko‘rsatma.
Ob-havo, mavsum, tadbir, ranglar uyg‘unligi va kiyimlar qancha kiyilganini hisobga ol. Uzoq vaqt kiyilmagan kiyimlarni ham eslat.
Moda va kiyinishdan boshqa mavzudagi savollarga qisqa javob berib, mavzuga qaytar.

Bugun: ${str(c.date, 10)}${c.season ? `, mavsum: ${str(c.season, 10)}` : ''}
${w ? `Ob-havo${w.city ? ` (${str(w.city, 30)})` : ''}: ${w.tMin ?? '?'}…${w.tMax ?? '?'}°C, yog‘ingarchilik ehtimoli ${w.precip ?? '?'}%${w.text ? `, ${str(w.text, 40)}` : ''}` : 'Ob-havo: noma’lum'}
${prof ? `Foydalanuvchi: ${prof}` : ''}

Garderob (${c.wardrobe.length} ta):
${wardrobeText(c.wardrobe)}

Javobni FAQAT quyidagi JSON ko‘rinishida qaytar, boshqa hech narsa yozma:
${SCHEMAS[r.mode]}`;
}

export function buildGeminiRequest(r: AiRequest) {
  type Part = { text: string } | { inline_data: { mime_type: string; data: string } };
  const contents: { role: 'user' | 'model'; parts: Part[] }[] = [];
  if (r.mode === 'chat') {
    for (const m of (r.messages ?? []).slice(-12)) contents.push({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: str(m.text, 1500) }] });
  } else if (r.mode === 'rate') {
    contents.push({
      role: 'user',
      parts: [
        { inline_data: { mime_type: r.image!.mime, data: r.image!.data } },
        { text: `Bugungi obrazimni baholang.${r.note ? ` Izoh: ${str(r.note, 300)}` : ''}` }
      ]
    });
  } else {
    contents.push({ role: 'user', parts: [{ text: `Garderobimni tahlil qiling: nima yetishmaydi va nimani kam kiyaman?${r.note ? ` Izoh: ${str(r.note, 300)}` : ''}` }] });
  }
  return {
    systemInstruction: { parts: [{ text: buildPrompt(r) }] },
    contents,
    generationConfig: { responseMimeType: 'application/json', temperature: r.mode === 'chat' ? 0.8 : 0.4, maxOutputTokens: 2048 }
  };
}

// ---------- Javobni tozalash ----------

export function parseModelJson(text: string): Record<string, unknown> | null {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  for (const cand of [t, t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)]) {
    try {
      const v = JSON.parse(cand);
      if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
    } catch {
      /* keyingisi */
    }
  }
  return null;
}

const arr = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);
const keys = (v: unknown, valid: Set<string>) => [...new Set(arr(v, 10).filter((x): x is string => typeof x === 'string' && valid.has(x)))];

export function sanitize(mode: Mode, raw: Record<string, unknown>, validKeys: Set<string>) {
  if (mode === 'chat') {
    return {
      reply: str(raw.reply, 2000) || 'Kechirasiz, javob tayyorlay olmadim. Savolni boshqacha yozib ko‘ring.',
      outfits: arr(raw.outfits, 3)
        .map((o) => o as Record<string, unknown>)
        .map((o) => ({ title: str(o?.title, 80) || 'Obraz', items: keys(o?.items, validKeys), why: str(o?.why, 300) }))
        .filter((o) => o.items.length > 0)
    };
  }
  if (mode === 'rate') {
    const s = Math.round(Number(raw.score));
    return {
      score: Number.isFinite(s) ? Math.max(0, Math.min(10, s)) : 0,
      summary: str(raw.summary, 800),
      good: arr(raw.good, 5).map((x) => str(x, 200)).filter(Boolean),
      improve: arr(raw.improve, 5).map((x) => str(x, 200)).filter(Boolean),
      swap: arr(raw.swap, 3)
        .map((o) => o as Record<string, unknown>)
        .map((o) => ({ items: keys(o?.items, validKeys), why: str(o?.why, 300) }))
        .filter((o) => o.items.length > 0)
    };
  }
  const CATS = new Set(['ustki', 'pastki', 'libos', 'tashqi', 'oyoq', 'aksessuar']);
  return {
    summary: str(raw.summary, 800),
    missing: arr(raw.missing, 6)
      .map((o) => o as Record<string, unknown>)
      .map((o) => ({
        name: str(o?.name, 80),
        category: CATS.has(String(o?.category)) ? String(o?.category) : 'boshqa',
        why: str(o?.why, 300),
        priority: Math.max(1, Math.min(3, Math.round(Number(o?.priority)) || 2))
      }))
      .filter((o) => o.name)
      .sort((a, b) => a.priority - b.priority),
    underused: arr(raw.underused, 3)
      .map((o) => o as Record<string, unknown>)
      .map((o) => ({ items: keys(o?.items, validKeys), tip: str(o?.tip, 300) }))
      .filter((o) => o.items.length > 0)
  };
}

// ---------- Asosiy ishlovchi ----------

export async function handle(req: Request, env: Env, f: typeof fetch = fetch): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'method', 'Faqat POST');
  if (!env.GEMINI_API_KEY) return fail(500, 'config', 'Serverda GEMINI_API_KEY sozlanmagan');

  const auth = req.headers.get('Authorization') ?? '';
  const apikey = env.SUPABASE_ANON_KEY || req.headers.get('apikey') || '';
  if (!/^Bearer\s+\S+/.test(auth)) return fail(401, 'auth', 'Hisobga kiring');

  // 1) Foydalanuvchini tekshirish
  const u = await f(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey } });
  if (!u.ok) return fail(401, 'auth', 'Hisobga qayta kiring');

  // 2) So'rovni tekshirish
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'bad', 'So‘rov noto‘g‘ri');
  }
  const r = validate(body);
  if (typeof r === 'string') return fail(400, 'bad', r);

  // 3) Kunlik limit
  const rpc = (name: string, args: unknown) =>
    f(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: { Authorization: auth, apikey, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const limit = Number(env.AI_DAILY_LIMIT) || 15;
  const q = await rpc('ai_take_quota', { p_limit: limit });
  if (!q.ok) return fail(500, 'quota', 'Limitni tekshirib bo‘lmadi');
  const quota = (await q.json()) as { ok: boolean; used: number; limit: number };
  if (!quota.ok) return json(429, { error: 'limit', message: `Bugungi AI limiti tugadi (${quota.limit} ta). Ertaga yana urinib ko‘ring.`, quota });

  // 4) Gemini
  const model = env.GEMINI_MODEL || 'gemini-flash-lite-latest';
  let g: Response;
  try {
    g = await f(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify(buildGeminiRequest(r))
    });
  } catch {
    await rpc('ai_refund', {});
    return fail(502, 'upstream', 'AI xizmatiga ulanib bo‘lmadi');
  }
  if (!g.ok) {
    await rpc('ai_refund', {});
    const detail = (await g.text()).slice(0, 300);
    console.error('gemini', g.status, detail);
    if (g.status === 429) return fail(503, 'busy', 'AI hozir band (bepul limit to‘ldi). Birozdan keyin urinib ko‘ring.');
    return fail(502, 'upstream', 'AI xizmati xato qaytardi');
  }
  const gj = (await g.json()) as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } };
  const cand = gj.candidates?.[0];
  if (!cand || gj.promptFeedback?.blockReason || cand.finishReason === 'SAFETY') {
    return fail(422, 'blocked', 'Bu so‘rovga javob berib bo‘lmadi. Boshqacha yozib ko‘ring.');
  }
  const text = (cand.content?.parts ?? []).map((p) => p.text ?? '').join('');
  const raw = parseModelJson(text);
  if (!raw) return fail(502, 'parse', 'AI javobini tushunib bo‘lmadi. Qayta urinib ko‘ring.');
  const valid = new Set(r.context.wardrobe.map((i) => i.k));
  return json(200, { result: sanitize(r.mode, raw, valid), quota: { used: quota.used, limit: quota.limit } });
}

// Supabase (Deno) muhitida ishga tushirish
type DenoLike = { serve: (h: (req: Request) => Promise<Response>) => void; env: { get: (k: string) => string | undefined } };
const D = (globalThis as unknown as { Deno?: DenoLike }).Deno;
if (D) {
  D.serve((req) =>
    handle(req, {
      SUPABASE_URL: D.env.get('SUPABASE_URL') ?? '',
      SUPABASE_ANON_KEY: D.env.get('SUPABASE_ANON_KEY'),
      GEMINI_API_KEY: D.env.get('GEMINI_API_KEY'),
      GEMINI_MODEL: D.env.get('GEMINI_MODEL'),
      AI_DAILY_LIMIT: D.env.get('AI_DAILY_LIMIT')
    })
  );
}
