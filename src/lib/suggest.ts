// "Bugungi tavsiya" — AI'siz qoidaviy tanlov (sof funksiyalar, test qilinadi).
import { colorById } from './catalog';
import { addDays, diffDays } from './dates';
import type { Category, ClothingItem, Occasion, Season, WearLog } from './types';

export interface DayWeather {
  tMin: number;
  tMax: number;
  precipProb: number; // 0..100
  code: number; // WMO
}

export function seasonOf(date: string): Season {
  const m = Number(date.slice(5, 7));
  if (m === 12 || m <= 2) return 'qish';
  if (m <= 5) return 'bahor';
  if (m <= 8) return 'yoz';
  return 'kuz';
}

/** Kunduzgi "his qilinadigan" harorat */
export const feelTemp = (w: DayWeather) => Math.round(0.65 * w.tMax + 0.35 * w.tMin);

export interface Needs {
  outer: boolean; // tashqi kiyim kerakmi
  outerWarmth: 1 | 2 | 3;
  topWarmth: 1 | 2 | 3;
  rain: boolean;
  label: string;
}

export function needsFor(w: DayWeather | null, season: Season): Needs {
  if (!w) {
    const t = season === 'qish' ? 2 : season === 'yoz' ? 28 : 16;
    return needsFor({ tMin: t - 5, tMax: t + 3, precipProb: 0, code: 0 }, season);
  }
  const t = feelTemp(w);
  const rain = w.precipProb >= 50 || [51, 53, 55, 61, 63, 65, 80, 81, 82, 95].includes(w.code);
  if (t <= 3) return { outer: true, outerWarmth: 3, topWarmth: 3, rain, label: 'Juda sovuq' };
  if (t <= 10) return { outer: true, outerWarmth: 2, topWarmth: 3, rain, label: 'Sovuq' };
  if (t <= 17) return { outer: true, outerWarmth: 1, topWarmth: 2, rain, label: 'Salqin' };
  if (t <= 25) return { outer: false, outerWarmth: 1, topWarmth: 1, rain, label: 'Iliq' };
  return { outer: false, outerWarmth: 1, topWarmth: 1, rain, label: 'Issiq' };
}

export interface WearStats {
  lastWorn: Map<string, string>; // item_id -> YYYY-MM-DD
  count: Map<string, number>;
}

export function wearStats(logs: WearLog[]): WearStats {
  const lastWorn = new Map<string, string>();
  const count = new Map<string, number>();
  for (const l of logs) {
    if (l.deleted_at) continue;
    for (const id of l.item_ids) {
      count.set(id, (count.get(id) ?? 0) + 1);
      const prev = lastWorn.get(id);
      if (!prev || l.date > prev) lastWorn.set(id, l.date);
    }
  }
  return { lastWorn, count };
}

export interface SuggestInput {
  items: ClothingItem[];
  logs: WearLog[];
  date: string;
  weather: DayWeather | null;
  occasion: Occasion;
  variant: number;
}

export interface Suggestion {
  items: ClothingItem[];
  reasons: string[];
  missing: string[];
  needs: Needs;
  season: Season;
}

const SLOT_LABEL: Record<Category, string> = {
  ustki: 'ustki kiyim',
  pastki: 'pastki kiyim (shim/yubka)',
  libos: 'libos',
  tashqi: 'tashqi kiyim (kurtka/palto)',
  oyoq: 'oyoq kiyim',
  aksessuar: 'aksessuar',
  boshqa: 'boshqa'
};

function baseScore(it: ClothingItem, s: SuggestInput, needs: Needs, season: Season, stats: WearStats, wantWarmth: number): number {
  let sc = 0;
  sc -= Math.abs(it.warmth - wantWarmth) * 2.2;
  sc += it.seasons.length === 0 ? 0.8 : it.seasons.includes(season) ? 2 : -2.5;
  sc += it.occasions.length === 0 ? 0.4 : it.occasions.includes(s.occasion) ? 2 : -1.2;
  if (it.favorite) sc += 0.8;
  const last = stats.lastWorn.get(it.id);
  if (!last) sc += 1.6;
  else {
    const days = diffDays(last, s.date);
    if (days <= 1) sc -= 3;
    sc += Math.min(Math.max(days, 0), 14) / 7;
  }
  if (needs.rain && it.category === 'oyoq' && ['Sandal', 'Shippak'].includes(it.subtype)) sc -= 4;
  return sc;
}

function harmony(chosen: ClothingItem[], it: ClothingItem): number {
  const accents = new Set<string>();
  for (const c of chosen.flatMap((x) => x.colors)) if (!colorById(c)?.neutral) accents.add(c);
  let sc = 0;
  for (const c of it.colors) {
    const def = colorById(c);
    if (!def) continue;
    if (def.neutral) sc += 0.4;
    else if (accents.has(c)) sc += 0.3;
    else if (accents.size >= 1) sc -= 1.6; // ikkinchi yorqin rang
  }
  return sc;
}

export function suggestOutfit(s: SuggestInput): Suggestion {
  const season = seasonOf(s.date);
  const needs = needsFor(s.weather, season);
  const stats = wearStats(s.logs);
  const pool = s.items.filter((i) => !i.deleted_at && !i.archived);
  const by = (c: Category) => pool.filter((i) => i.category === c);
  const reasons: string[] = [];
  const missing: string[] = [];

  const useDress =
    by('libos').length > 0 && (by('ustki').length === 0 || by('pastki').length === 0 || (s.occasion === 'bayram' ? s.variant % 2 === 0 : s.variant % 4 === 3));
  const slots: { cat: Category; warmth: number; optional?: boolean }[] = useDress
    ? [{ cat: 'libos', warmth: needs.topWarmth }]
    : [
        { cat: 'ustki', warmth: needs.topWarmth },
        { cat: 'pastki', warmth: Math.min(needs.topWarmth, 2) }
      ];
  if (needs.outer) slots.push({ cat: 'tashqi', warmth: needs.outerWarmth });
  slots.push({ cat: 'oyoq', warmth: needs.topWarmth === 3 ? 3 : needs.topWarmth });
  slots.push({ cat: 'aksessuar', warmth: 2, optional: true });

  const chosen: ClothingItem[] = [];
  slots.forEach((slot, idx) => {
    const cands = by(slot.cat)
      .map((it) => ({ it, sc: baseScore(it, s, needs, season, stats, slot.warmth) + harmony(chosen, it) }))
      .sort((a, b) => b.sc - a.sc || a.it.id.localeCompare(b.it.id));
    if (!cands.length) {
      if (!slot.optional) missing.push(SLOT_LABEL[slot.cat]);
      return;
    }
    if (slot.optional && cands[0].sc < 0) return;
    // variant: birinchi slotda navbatdagi nomzod; qolganlarida eng yaxshi (uyg'unlik bilan)
    const pick = idx === 0 ? cands[s.variant % cands.length] : cands[0];
    chosen.push(pick.it);
  });

  if (s.weather) {
    reasons.push(`${needs.label}: kunduzi ${feelTemp(s.weather)}°C atrofida (${Math.round(s.weather.tMin)}…${Math.round(s.weather.tMax)}°C)`);
    if (needs.outer) reasons.push('Tashqi kiyim tavsiya etiladi');
    if (needs.rain) reasons.push(`Yomg‘ir ehtimoli ${s.weather.precipProb}% — soyabon oling, yopiq oyoq kiyim tanlandi`);
  } else {
    reasons.push(`Ob-havo ma’lumoti yo‘q — ${season} mavsumiga qarab tanlandi`);
  }
  const fresh = chosen.filter((c) => {
    const l = stats.lastWorn.get(c.id);
    return !l || diffDays(l, s.date) >= 7;
  }).length;
  if (fresh) reasons.push(`${fresh} ta kiyim kamida bir haftadan beri kiyilmagan`);
  return { items: chosen, reasons, missing, needs, season };
}

/** "Eslang": uzoq kiyilmagan kiyimlar */
export function forgottenItems(items: ClothingItem[], logs: WearLog[], today: string, days: number): { item: ClothingItem; since: number | null }[] {
  const stats = wearStats(logs);
  const limit = addDays(today, -days);
  return items
    .filter((i) => !i.deleted_at && !i.archived)
    .map((item) => {
      const last = stats.lastWorn.get(item.id);
      const added = item.created_at.slice(0, 10);
      return { item, last, since: last ? diffDays(last, today) : null, added };
    })
    .filter((x) => (x.last ? x.last <= limit : x.added <= limit))
    .sort((a, b) => (b.since ?? 9999) - (a.since ?? 9999))
    .map(({ item, since }) => ({ item, since }));
}

/** Bir martalik kiyish narxi (so'm) */
export function costPerWear(item: ClothingItem, stats: WearStats): number | null {
  if (!item.price) return null;
  const n = stats.count.get(item.id) ?? 0;
  return n ? Math.round(item.price / n) : null;
}
