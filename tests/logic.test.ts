import { describe, expect, it } from 'vitest';
import { dominantColorIds, kmeans, nearestColor, type RGB } from '@/lib/color';
import { feelTemp, forgottenItems, needsFor, seasonOf, suggestOutfit, wearStats, costPerWear } from '@/lib/suggest';
import { parseOpenMeteo } from '@/lib/weather';
import { defaultWarmth } from '@/lib/catalog';
import type { ClothingItem, WearLog } from '@/lib/types';

const base = { user_id: null, created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z', deleted_at: null };
let n = 0;
const item = (p: Partial<ClothingItem>): ClothingItem => ({
  ...base,
  id: p.id ?? `i${++n}`,
  name: 'x',
  category: 'ustki',
  subtype: 'Futbolka',
  colors: ['qora'],
  seasons: [],
  occasions: [],
  warmth: 2,
  brand: '',
  size: '',
  price: null,
  purchased_on: null,
  notes: '',
  favorite: false,
  archived: false,
  image_id: null,
  image_ext: null,
  bg_removed: false,
  ...p
});
const log = (date: string, ids: string[]): WearLog => ({ ...base, id: `l${date}${ids.join()}`, date, item_ids: ids, outfit_id: null, note: '' });

describe('rangni aniqlash', () => {
  it('eng yaqin nomli rang', () => {
    expect(nearestColor([20, 20, 22]).id).toBe('qora');
    expect(nearestColor([250, 250, 248]).id).toBe('oq');
    expect(nearestColor([200, 40, 40]).id).toBe('qizil');
    expect(nearestColor([30, 42, 70]).id).toBe('tokkok');
    expect(nearestColor([111, 78, 55]).id).toBe('jigarrang');
  });
  it('k-means asosiy guruhlarni topadi', () => {
    const px: RGB[] = [...Array(70).fill([110, 78, 56]), ...Array(30).fill([245, 245, 240])];
    const k = kmeans(px, 3);
    expect(k[0].share).toBeCloseTo(0.7, 1);
    expect(dominantColorIds(px)).toEqual(['jigarrang', 'oq']);
  });
  it('kichik dog‘lar hisobga olinmaydi', () => {
    const px: RGB[] = [...Array(95).fill([20, 20, 20]), ...Array(5).fill([220, 30, 30])];
    expect(dominantColorIds(px)).toEqual(['qora']);
  });
});

describe('ob-havo va ehtiyojlar', () => {
  it('mavsum', () => {
    expect(seasonOf('2026-01-10')).toBe('qish');
    expect(seasonOf('2026-04-10')).toBe('bahor');
    expect(seasonOf('2026-07-10')).toBe('yoz');
    expect(seasonOf('2026-11-15')).toBe('kuz');
  });
  it('harorat bandlari', () => {
    expect(feelTemp({ tMin: 0, tMax: 10, precipProb: 0, code: 0 })).toBe(7);
    expect(needsFor({ tMin: -5, tMax: 2, precipProb: 0, code: 0 }, 'qish')).toMatchObject({ outer: true, outerWarmth: 3, label: 'Juda sovuq' });
    expect(needsFor({ tMin: 20, tMax: 34, precipProb: 0, code: 0 }, 'yoz')).toMatchObject({ outer: false, topWarmth: 1, label: 'Issiq' });
    expect(needsFor({ tMin: 8, tMax: 14, precipProb: 70, code: 61 }, 'kuz').rain).toBe(true);
  });
  it('Open-Meteo javobini o‘qish', () => {
    const f = parseOpenMeteo(
      { current: { temperature_2m: 5.1, weather_code: 3 }, daily: { time: ['2026-11-15'], temperature_2m_max: [9], temperature_2m_min: [1], precipitation_probability_max: [20], weather_code: [3] } },
      'andijon'
    );
    expect(f.current).toEqual({ temp: 5.1, code: 3 });
    expect(f.days[0]).toMatchObject({ date: '2026-11-15', tMax: 9, tMin: 1, precipProb: 20 });
    expect(() => parseOpenMeteo({}, 'x')).toThrow();
  });
});

describe('bugungi tavsiya', () => {
  const cold = { tMin: 0, tMax: 8, precipProb: 10, code: 3 };
  const wardrobe = [
    item({ id: 'tee', category: 'ustki', subtype: 'Futbolka', warmth: 1, seasons: ['yoz'], colors: ['oq'] }),
    item({ id: 'sweater', category: 'ustki', subtype: 'Sviter', warmth: 3, seasons: ['kuz', 'qish'], colors: ['jigarrang'] }),
    item({ id: 'jeans', category: 'pastki', subtype: 'Jinsi', warmth: 2, colors: ['tokkok'] }),
    item({ id: 'coat', category: 'tashqi', subtype: 'Palto', warmth: 3, seasons: ['qish', 'kuz'], colors: ['qora'] }),
    item({ id: 'jacket', category: 'tashqi', subtype: 'Kurtka', warmth: 2, colors: ['zaytun'] }),
    item({ id: 'boots', category: 'oyoq', subtype: 'Botinka', warmth: 3, colors: ['qora'] }),
    item({ id: 'sandal', category: 'oyoq', subtype: 'Sandal', warmth: 1, seasons: ['yoz'], colors: ['bej'] })
  ];
  it('sovuq kunda issiq kiyimlar va tashqi kiyim', () => {
    const s = suggestOutfit({ items: wardrobe, logs: [], date: '2026-11-15', weather: cold, occasion: 'kundalik', variant: 0 });
    const ids = s.items.map((i) => i.id);
    expect(ids).toContain('sweater');
    expect(ids).toContain('jeans');
    expect(ids).toContain('boots');
    expect(ids.some((i) => i === 'coat' || i === 'jacket')).toBe(true);
    expect(s.missing).toEqual([]);
  });
  it('issiq kunda tashqi kiyim yo‘q, yengil kiyim', () => {
    const s = suggestOutfit({ items: wardrobe, logs: [], date: '2026-07-10', weather: { tMin: 24, tMax: 36, precipProb: 0, code: 0 }, occasion: 'kundalik', variant: 0 });
    const ids = s.items.map((i) => i.id);
    expect(ids).toContain('tee');
    expect(ids).toContain('sandal');
    expect(ids.some((i) => i === 'coat' || i === 'jacket')).toBe(false);
  });
  it('kecha kiyilgan kiyim kamroq tanlanadi va variant almashadi', () => {
    const items = [...wardrobe, item({ id: 'hoodie', category: 'ustki', subtype: 'Xudi', warmth: 3, colors: ['kulrang'] })];
    const s = suggestOutfit({ items, logs: [log('2026-11-14', ['sweater'])], date: '2026-11-15', weather: cold, occasion: 'kundalik', variant: 0 });
    expect(s.items[0].id).toBe('hoodie');
    const s2 = suggestOutfit({ items, logs: [log('2026-11-14', ['sweater'])], date: '2026-11-15', weather: cold, occasion: 'kundalik', variant: 1 });
    expect(s2.items[0].id).not.toBe(s.items[0].id);
  });
  it('yetishmagan bo‘limlar aytiladi; arxivdagilar tanlanmaydi', () => {
    const s = suggestOutfit({ items: [item({ id: 'a', archived: true })], logs: [], date: '2026-11-15', weather: null, occasion: 'kundalik', variant: 0 });
    expect(s.items).toEqual([]);
    expect(s.missing).toContain('ustki kiyim');
    expect(s.missing).toContain('oyoq kiyim');
  });
  it('yomg‘irda sandal tanlanmaydi', () => {
    const s = suggestOutfit({ items: wardrobe, logs: [], date: '2026-09-10', weather: { tMin: 18, tMax: 24, precipProb: 80, code: 63 }, occasion: 'kundalik', variant: 0 });
    expect(s.items.find((i) => i.category === 'oyoq')?.id).toBe('boots');
    expect(s.reasons.some((r) => r.includes('soyabon'))).toBe(true);
  });
});

describe('statistika', () => {
  it('kiyish soni, oxirgi sana, unutilganlar, bir kiyish narxi', () => {
    const a = item({ id: 'a', price: 300000 });
    const b = item({ id: 'b' });
    const logs = [log('2026-10-01', ['a']), log('2026-11-10', ['a'])];
    const st = wearStats(logs);
    expect(st.count.get('a')).toBe(2);
    expect(st.lastWorn.get('a')).toBe('2026-11-10');
    expect(costPerWear(a, st)).toBe(150000);
    expect(forgottenItems([a, b], logs, '2026-11-15', 30).map((x) => x.item.id)).toEqual(['b']);
    expect(defaultWarmth('Puxovik')).toBe(3);
  });
});

describe('fon rangini chiqarib tashlash', async () => {
  const { dropBackground, dominantColorIds } = await import('@/lib/color');
  it('oq fondagi to‘q ko‘k jinsi — faqat to‘q ko‘k', () => {
    const bg: [number, number, number] = [236, 234, 230];
    const jeans: [number, number, number] = [32, 43, 72];
    const center = [...Array(70).fill(bg), ...Array(30).fill(jeans)];
    const border = Array(50).fill(bg);
    expect(dominantColorIds(center)[0]).toBe('oq');
    expect(dominantColorIds(dropBackground(center, border))).toEqual(['tokkok']);
  });
  it('oq fondagi oq futbolka — oq qoladi', () => {
    const bg: [number, number, number] = [236, 234, 230];
    const center = Array(100).fill([245, 245, 242]);
    expect(dominantColorIds(dropBackground(center, Array(50).fill(bg)))).toEqual(['oq']);
  });
});

describe('AI konteksti', async () => {
  const { buildContext, mapResult } = await import('@/lib/ai');
  const { defaultSettings } = await import('@/lib/repo');
  const base = { created_at: '', updated_at: '', deleted_at: null, user_id: null, brand: '', size: '', price: null, purchased_on: null, notes: '', image_id: null, image_ext: null, bg_removed: false, subtype: '', occasions: [], seasons: [], warmth: 2 };
  const items = [
    { ...base, id: 'A', name: 'Oq futbolka', category: 'ustki', colors: ['oq'], favorite: true, archived: false },
    { ...base, id: 'B', name: 'Eski kurtka', category: 'tashqi', colors: [], favorite: false, archived: true },
    { ...base, id: 'C', name: 'Jinsi', category: 'pastki', colors: ['tokkok'], favorite: false, archived: false }
  ] as never[];
  const logs = [{ id: 'l1', date: '2026-11-10', item_ids: ['A'], outfit_id: null, note: '', created_at: '', updated_at: '', deleted_at: null, user_id: null }] as never[];
  const fc = { city: 'toshkent', fetchedAt: '', current: null, days: [{ date: '2026-11-16', tMin: 3.6, tMax: 11.2, precipProb: 40, code: 61 }] };
  it('arxivdagilar yuborilmaydi, qisqa kalitlar, ob-havo va statistika qo‘shiladi; ism/e-pochta yo‘q', () => {
    const s = { ...defaultSettings('x', null), display_name: 'Durbek', gender: 'erkak' as const, age: 25 };
    const c = buildContext({ items, logs, settings: s }, '2026-11-16', fc);
    expect(c.context.wardrobe.map((w) => [w.k, w.n, w.worn])).toEqual([['k1', 'Oq futbolka', 1], ['k2', 'Jinsi', 0]]);
    expect(c.context.wardrobe[0]).toMatchObject({ col: ['Oq'], fav: true, last: '2026-11-10' });
    expect(c.context.weather).toMatchObject({ city: 'Toshkent', tMin: 4, tMax: 11, precip: 40 });
    expect(c.context.profile).toEqual({ gender: 'erkak', age: 25, height_cm: null, weight_kg: null });
    expect(JSON.stringify(c.context)).not.toContain('Durbek');
    const r = mapResult('chat', { reply: 'ok', outfits: [{ title: 't', items: ['k2', 'k1', 'k9'], why: '' }, { title: 'x', items: ['k9'], why: '' }] }, c.keyToId) as { outfits: { items: string[] }[] };
    expect(r.outfits).toEqual([{ title: 't', items: ['C', 'A'], why: '' }]);
  });
});

describe('kirish xatolari o‘zbekcha', async () => {
  const { authErrorText } = await import('@/pages/Profile');
  it('asosiy Supabase xatolari tarjima qilinadi', () => {
    expect(authErrorText(new Error('Invalid login credentials'))).toBe('Email yoki parol noto‘g‘ri.');
    expect(authErrorText(new Error('Email not confirmed'))).toContain('tasdiqlanmagan');
    expect(authErrorText(new Error('Email address "a@b.com" cannot be used as it is not authorized'))).toContain('Confirm email');
    expect(authErrorText(new Error('email rate limit exceeded'))).toContain('Juda ko‘p');
    expect(authErrorText(new Error('Signups not allowed for this instance'))).toContain('yopilgan');
  });
});
