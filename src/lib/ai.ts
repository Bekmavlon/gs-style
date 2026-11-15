// AI stilist — ilova tomoni. Kalit ilovada yo'q: so'rov Supabase Edge Function "ai" orqali o'tadi,
// u foydalanuvchini tekshiradi, kunlik limitni hisoblaydi va Gemini'ni chaqiradi.
import { categoryLabel, cityById, colorById } from './catalog';
import { getMeta, setMeta } from './db';
import { seasonOf, wearStats } from './suggest';
import { getSupabase } from './supabase';
import { WEATHER_TEXT, type Forecast } from './weather';
import type { Wardrobe } from './data';
import type { ClothingItem } from './types';

export type AiMode = 'chat' | 'rate' | 'shop';

export interface AiOutfit {
  title: string;
  items: string[]; // kiyim id'lari
  why: string;
}
export interface ChatMsg {
  id: string;
  role: 'user' | 'model';
  text: string;
  outfits?: AiOutfit[];
  at: string;
}
export interface RateResult {
  score: number;
  summary: string;
  good: string[];
  improve: string[];
  swap: { items: string[]; why: string }[];
}
export interface ShopResult {
  summary: string;
  missing: { name: string; category: string; why: string; priority: number }[];
  underused: { items: string[]; tip: string }[];
  at?: string;
}
export interface Quota {
  used: number;
  limit: number;
  day: string;
}

export class AiError extends Error {
  constructor(
    public code: 'setup' | 'auth' | 'offline' | 'limit' | 'busy' | 'server',
    message: string
  ) {
    super(message);
  }
}

// ---------- Kontekst (sof funksiya, test qilinadi) ----------

export interface AiContext {
  context: {
    date: string;
    season: string;
    weather: { city: string; tMin: number; tMax: number; precip: number; text: string } | null;
    profile: { gender: string | null; age: number | null; height_cm: number | null; weight_kg: number | null };
    wardrobe: {
      k: string;
      n: string;
      c: string;
      t?: string;
      col?: string[];
      s?: string[];
      o?: string[];
      w?: number;
      worn: number;
      last: string | null;
      fav?: boolean;
    }[];
  };
  keyToId: Map<string, string>;
}

export function buildContext(w: Pick<Wardrobe, 'items' | 'logs' | 'settings'>, date: string, forecast: Forecast | null): AiContext {
  const stats = wearStats(w.logs);
  const active = w.items.filter((i) => !i.archived && !i.deleted_at);
  const keyToId = new Map<string, string>();
  const wardrobe = active.map((i, idx) => {
    const k = `k${idx + 1}`;
    keyToId.set(k, i.id);
    return {
      k,
      n: i.name,
      c: i.category,
      t: i.subtype || undefined,
      col: i.colors.length ? i.colors.map((c) => colorById(c)?.label ?? c) : undefined,
      s: i.seasons.length ? i.seasons : undefined,
      o: i.occasions.length ? i.occasions : undefined,
      w: i.warmth,
      worn: stats.count.get(i.id) ?? 0,
      last: stats.lastWorn.get(i.id) ?? null,
      fav: i.favorite || undefined
    };
  });
  const day = forecast?.days.find((d) => d.date === date) ?? null;
  const s = w.settings;
  return {
    keyToId,
    context: {
      date,
      season: seasonOf(date),
      weather: day ? { city: cityById(s.city_id).label, tMin: Math.round(day.tMin), tMax: Math.round(day.tMax), precip: day.precipProb, text: WEATHER_TEXT[day.code] ?? '' } : null,
      profile: { gender: s.gender ?? null, age: s.age ?? null, height_cm: s.height_cm ?? null, weight_kg: s.weight_kg ?? null },
      wardrobe
    }
  };
}

const mapKeys = (keys: string[], m: Map<string, string>) => keys.map((k) => m.get(k)).filter((x): x is string => !!x);

/** Server javobidagi qisqa kalitlarni (k1...) haqiqiy kiyim id'lariga aylantiradi */
export function mapResult(mode: AiMode, r: Record<string, unknown>, m: Map<string, string>): unknown {
  if (mode === 'chat') {
    const o = (r.outfits as AiOutfit[] | undefined) ?? [];
    return { reply: String(r.reply ?? ''), outfits: o.map((x) => ({ ...x, items: mapKeys(x.items, m) })).filter((x) => x.items.length) };
  }
  if (mode === 'rate') {
    const x = r as unknown as RateResult;
    return { ...x, swap: (x.swap ?? []).map((s) => ({ ...s, items: mapKeys(s.items, m) })).filter((s) => s.items.length) };
  }
  const x = r as unknown as ShopResult;
  return { ...x, underused: (x.underused ?? []).map((s) => ({ ...s, items: mapKeys(s.items, m) })).filter((s) => s.items.length) };
}

// ---------- Chaqiruv ----------

type Mock = (mode: AiMode, body: unknown) => Promise<{ result: Record<string, unknown>; quota: { used: number; limit: number } }>;

export async function aiReady(): Promise<'ok' | 'setup' | 'auth'> {
  if ((window as unknown as { __GS_AI_MOCK__?: Mock }).__GS_AI_MOCK__) return 'ok';
  const sb = getSupabase();
  if (!sb) return 'setup';
  const { data } = await sb.auth.getSession();
  return data.session ? 'ok' : 'auth';
}

export async function callAi<T>(mode: AiMode, ctx: AiContext, extra: { messages?: { role: 'user' | 'model'; text: string }[]; note?: string; image?: { mime: string; data: string } }, today: string): Promise<T> {
  const body = { mode, context: ctx.context, ...extra };
  const mock = (window as unknown as { __GS_AI_MOCK__?: Mock }).__GS_AI_MOCK__;
  let out: { result: Record<string, unknown>; quota?: { used: number; limit: number } };
  if (mock) {
    out = await mock(mode, body);
  } else {
    if (!navigator.onLine) throw new AiError('offline', 'Internet yo‘q. AI stilist faqat internet bilan ishlaydi.');
    const sb = getSupabase();
    if (!sb) throw new AiError('setup', 'AI ishlashi uchun avval hisobni ulang (Profil → Hisob).');
    const { data: s } = await sb.auth.getSession();
    if (!s.session) throw new AiError('auth', 'AI stilistdan foydalanish uchun hisobga kiring.');
    const { data, error } = await sb.functions.invoke('ai', { body });
    if (error) {
      const resp = (error as { context?: Response }).context;
      let j: { error?: string; message?: string; quota?: { used: number; limit: number } } | null = null;
      try {
        j = resp && typeof resp.json === 'function' ? await resp.json() : null;
      } catch {
        j = null;
      }
      if (j?.quota) await setMeta('ai_quota', { ...j.quota, day: today } satisfies Quota);
      const code = j?.error === 'limit' ? 'limit' : j?.error === 'busy' ? 'busy' : j?.error === 'auth' ? 'auth' : 'server';
      throw new AiError(code, j?.message ?? (resp ? 'AI xizmatida xato. Birozdan keyin urinib ko‘ring.' : 'Serverga ulanib bo‘lmadi. Internetni tekshiring.'));
    }
    out = data as typeof out;
  }
  if (out.quota) await setMeta('ai_quota', { ...out.quota, day: today } satisfies Quota);
  return mapResult(mode, out.result, ctx.keyToId) as T;
}

// ---------- Mahalliy saqlash (faqat shu qurilmada) ----------

export const getChat = () => getMeta<ChatMsg[]>('ai_chat', []);
export const saveChat = (m: ChatMsg[]) => setMeta('ai_chat', m.slice(-40));
export const getConsent = () => getMeta<boolean>('ai_consent', false);
export const setConsent = (v: boolean) => setMeta('ai_consent', v);

/** Rasmni AI uchun kichraytirish: uzun tomoni 768px, JPEG */
export async function photoForAi(file: Blob): Promise<{ mime: string; data: string; preview: string }> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, 768 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * scale);
  cv.height = Math.round(bmp.height * scale);
  cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height);
  bmp.close?.();
  const preview = cv.toDataURL('image/jpeg', 0.8);
  return { mime: 'image/jpeg', data: preview.split(',')[1], preview };
}

export const itemsByIds = (all: ClothingItem[], ids: string[]) => ids.map((id) => all.find((i) => i.id === id)).filter((x): x is ClothingItem => !!x);
export { categoryLabel };
