// O'zbekcha sana va vaqt yordamchilari. Hafta dushanbadan boshlanadi.

export const MONTHS_UZ = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'
];
export const MONTHS_UZ_CAP = MONTHS_UZ.map((m) => m[0].toUpperCase() + m.slice(1));
export const WEEKDAYS_UZ = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'];
export const WEEKDAYS_SHORT_UZ = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];

const pad = (n: number) => String(n).padStart(2, '0');

/** Berilgan vaqt momenti (Date) uchun foydalanuvchi vaqt zonasidagi YYYY-MM-DD */
export function isoDateInTz(d: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
}

/** Vaqt zonasidagi soat:daqiqa */
export function hmInTz(d: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  } catch {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}

export function todayISO(timeZone: string): string {
  return isoDateInTz(new Date(), timeZone);
}

/** YYYY-MM-DD -> UTC yarim tun Date (faqat kalendar arifmetikasi uchun) */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatISODate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(iso: string, n: number): string {
  const d = parseISODate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return formatISODate(d);
}

export function addMonths(iso: string, n: number): string {
  const d = parseISODate(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return formatISODate(d);
}

/** 0 = Dushanba ... 6 = Yakshanba */
export function weekdayIndex(iso: string): number {
  return (parseISODate(iso).getUTCDay() + 6) % 7;
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86400000);
}

export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  if (start > end) return out;
  let cur = start;
  // xavfsizlik chegarasi
  for (let i = 0; i < 4000 && cur <= end; i++) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export function startOfWeek(iso: string): string {
  return addDays(iso, -weekdayIndex(iso));
}
export function endOfWeek(iso: string): string {
  return addDays(startOfWeek(iso), 6);
}
export function startOfMonth(iso: string): string {
  return iso.slice(0, 8) + '01';
}
export function endOfMonth(iso: string): string {
  const d = parseISODate(startOfMonth(iso));
  return formatISODate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

/** "11-noyabr" yoki "11-noyabr, 2026" */
export function formatUz(iso: string, withYear = false): string {
  if (!iso) return '';
  const d = parseISODate(iso);
  const s = `${d.getUTCDate()}-${MONTHS_UZ[d.getUTCMonth()]}`;
  return withYear ? `${s}, ${d.getUTCFullYear()}` : s;
}

export function formatUzLong(iso: string): string {
  return `${WEEKDAYS_UZ[weekdayIndex(iso)]}, ${formatUz(iso, true)}`;
}

export function monthLabel(iso: string): string {
  const d = parseISODate(iso);
  return `${MONTHS_UZ_CAP[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatDateTimeUz(isoTs: string, timeZone: string): string {
  const d = new Date(isoTs);
  return `${formatUz(isoDateInTz(d, timeZone), true)}, ${hmInTz(d, timeZone)}`;
}

/** daqiqani "2 soat 15 daq" ko'rinishiga */
export function fmtMinutes(min: number | null | undefined): string {
  if (min === null || min === undefined || Number.isNaN(min)) return '—';
  const m = Math.round(min);
  if (m < 60) return `${m} daq`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} soat ${r} daq` : `${h} soat`;
}

export function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function greeting(hour: number): string {
  if (hour >= 4 && hour < 11) return 'Xayrli tong';
  if (hour >= 11 && hour < 17) return 'Xayrli kun';
  if (hour >= 17 && hour < 22) return 'Xayrli kech';
  return 'Xayrli tun';
}

/** "HH:mm" -> daqiqa */
export function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Lokal sana+vaqt (vaqt zonasida) -> ISO timestamp. Toshkent kabi DST'siz zonalar uchun aniq. */
export function zonedToISO(dateISO: string, hm: string, timeZone: string): string {
  const [y, mo, d] = dateISO.split('-').map(Number);
  const [h, mi] = hm.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const offset = tzOffsetMinutes(new Date(guess), timeZone);
  return new Date(guess - offset * 60000).toISOString();
}

export function tzOffsetMinutes(d: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).formatToParts(d);
    const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUTC = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'));
    return Math.round((asUTC - Math.floor(d.getTime() / 60000) * 60000) / 60000);
  } catch {
    return -d.getTimezoneOffset();
  }
}
