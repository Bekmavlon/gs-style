// Ob-havo: Open-Meteo (kalitsiz). Natija 1 soat keshlanadi; internet bo'lmasa oxirgi kesh ishlatiladi.
import { getMeta, setMeta } from './db';
import type { City } from './catalog';
import type { DayWeather } from './suggest';

export interface Forecast {
  city: string;
  fetchedAt: string;
  current: { temp: number; code: number } | null;
  days: (DayWeather & { date: string })[];
}

export const WEATHER_TEXT: Record<number, string> = {
  0: 'Ochiq osmon', 1: 'Asosan ochiq', 2: 'Qisman bulutli', 3: 'Bulutli', 45: 'Tuman', 48: 'Qirovli tuman',
  51: 'Yengil shivalama', 53: 'Shivalama', 55: 'Kuchli shivalama', 61: 'Yengil yomg‘ir', 63: 'Yomg‘ir', 65: 'Kuchli yomg‘ir',
  71: 'Yengil qor', 73: 'Qor', 75: 'Kuchli qor', 77: 'Qor donalari', 80: 'Jala', 81: 'Kuchli jala', 82: 'Juda kuchli jala',
  85: 'Qor yog‘ishi', 86: 'Kuchli qor yog‘ishi', 95: 'Momaqaldiroq', 96: 'Do‘l bilan momaqaldiroq', 99: 'Kuchli do‘l'
};

export function parseOpenMeteo(j: unknown, city: string): Forecast {
  const d = j as {
    current?: { temperature_2m: number; weather_code: number };
    daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max?: (number | null)[]; weather_code: number[] };
  };
  if (!d?.daily?.time) throw new Error('Ob-havo javobi noto‘g‘ri');
  return {
    city,
    fetchedAt: new Date().toISOString(),
    current: d.current ? { temp: d.current.temperature_2m, code: d.current.weather_code } : null,
    days: d.daily.time.map((date, i) => ({
      date,
      tMax: d.daily.temperature_2m_max[i],
      tMin: d.daily.temperature_2m_min[i],
      precipProb: d.daily.precipitation_probability_max?.[i] ?? 0,
      code: d.daily.weather_code[i]
    }))
  };
}

export async function getForecast(city: City, force = false): Promise<{ data: Forecast | null; stale: boolean; error?: string }> {
  const key = `weather:${city.id}`;
  const cached = await getMeta<Forecast | null>(key, null);
  const fresh = cached && Date.now() - new Date(cached.fetchedAt).getTime() < 3600_000;
  if (cached && fresh && !force) return { data: cached, stale: false };
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { data: cached, stale: !!cached, error: 'Internet yo‘q' };
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}` +
      `&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code` +
      `&timezone=Asia%2FTashkent&forecast_days=3`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = parseOpenMeteo(await r.json(), city.id);
    await setMeta(key, data);
    return { data, stale: false };
  } catch (e) {
    return { data: cached, stale: !!cached, error: e instanceof Error ? e.message : 'Xato' };
  }
}
