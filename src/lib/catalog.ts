// Kategoriyalar, turlar, ranglar, mavsumlar — o'zbekcha lug'at
import type { Category, Occasion, Season, Warmth } from './types';

export const CATEGORIES: { id: Category; label: string; icon: string; types: string[] }[] = [
  { id: 'ustki', label: 'Ustki kiyim', icon: 'Shirt', types: ['Futbolka', 'Ko‘ylak', 'Polo', 'Sviter', 'Xudi', 'Bluzka', 'Mayka', 'Jaket', 'Kardigan'] },
  { id: 'pastki', label: 'Pastki kiyim', icon: 'RectangleVertical', types: ['Shim', 'Jinsi', 'Klassik shim', 'Sport shim', 'Shortik', 'Yubka'] },
  { id: 'libos', label: 'Libos', icon: 'Sparkles', types: ['Libos (ko‘ylak)', 'Kostyum', 'Kombinezon', 'Milliy libos'] },
  { id: 'tashqi', label: 'Tashqi kiyim', icon: 'CloudSnow', types: ['Kurtka', 'Palto', 'Pidjak', 'Plashch', 'Puxovik', 'Jilet'] },
  { id: 'oyoq', label: 'Oyoq kiyim', icon: 'Footprints', types: ['Krossovka', 'Tufli', 'Etik', 'Botinka', 'Sandal', 'Shippak', 'Kedalar'] },
  { id: 'aksessuar', label: 'Aksessuar', icon: 'Watch', types: ['Sumka', 'Soat', 'Kamar', 'Bosh kiyim', 'Sharf', 'Ko‘zoynak', 'Galstuk', 'Taqinchoq'] },
  { id: 'boshqa', label: 'Boshqa', icon: 'Package', types: ['Boshqa'] }
];

export const categoryLabel = (c: Category) => CATEGORIES.find((x) => x.id === c)?.label ?? c;

export const SEASONS: { id: Season; label: string }[] = [
  { id: 'bahor', label: 'Bahor' },
  { id: 'yoz', label: 'Yoz' },
  { id: 'kuz', label: 'Kuz' },
  { id: 'qish', label: 'Qish' }
];

export const OCCASIONS: { id: Occasion; label: string }[] = [
  { id: 'kundalik', label: 'Kundalik' },
  { id: 'ish', label: 'Ish / o‘qish' },
  { id: 'sport', label: 'Sport' },
  { id: 'bayram', label: 'To‘y / bayram' },
  { id: 'uchrashuv', label: 'Uchrashuv' },
  { id: 'sayohat', label: 'Sayohat' }
];
export const occasionLabel = (o: Occasion) => OCCASIONS.find((x) => x.id === o)?.label ?? o;

export const WARMTH: { id: Warmth; label: string; hint: string }[] = [
  { id: 1, label: 'Yengil', hint: 'issiq kunlar uchun' },
  { id: 2, label: 'O‘rtacha', hint: 'salqin kunlar' },
  { id: 3, label: 'Issiq', hint: 'sovuq kunlar' }
];

/** Tur bo'yicha taxminiy issiqlik (foydalanuvchi o'zgartira oladi) */
export function defaultWarmth(subtype: string): Warmth {
  const hot = ['Futbolka', 'Mayka', 'Shortik', 'Sandal', 'Shippak', 'Polo'];
  const warm = ['Sviter', 'Xudi', 'Palto', 'Puxovik', 'Etik', 'Kurtka', 'Sharf'];
  if (hot.includes(subtype)) return 1;
  if (warm.includes(subtype)) return 3;
  return 2;
}

export function defaultSeasons(w: Warmth): Season[] {
  return w === 1 ? ['bahor', 'yoz'] : w === 3 ? ['kuz', 'qish'] : ['bahor', 'kuz'];
}

export interface ColorDef {
  id: string;
  label: string;
  hex: string;
  neutral: boolean;
}

/** Rang lug'ati: avtomatik aniqlash eng yaqin rangni shu ro'yxatdan tanlaydi */
export const COLORS: ColorDef[] = [
  { id: 'qora', label: 'Qora', hex: '#1d1d1f', neutral: true },
  { id: 'oq', label: 'Oq', hex: '#f5f5f2', neutral: true },
  { id: 'kulrang', label: 'Kulrang', hex: '#8e8e8e', neutral: true },
  { id: 'tokkulrang', label: 'To‘q kulrang', hex: '#4a4a4c', neutral: true },
  { id: 'bej', label: 'Bej', hex: '#d8c3a5', neutral: true },
  { id: 'krem', label: 'Krem', hex: '#efe6d2', neutral: true },
  { id: 'jigarrang', label: 'Jigarrang', hex: '#6f4e37', neutral: true },
  { id: 'tokkok', label: 'To‘q ko‘k', hex: '#1f2a44', neutral: true },
  { id: 'kok', label: 'Ko‘k', hex: '#2f5fb3', neutral: false },
  { id: 'havorang', label: 'Havorang', hex: '#8ab6e0', neutral: false },
  { id: 'yashil', label: 'Yashil', hex: '#2e7d4f', neutral: false },
  { id: 'zaytun', label: 'Zaytun', hex: '#6b6b3a', neutral: false },
  { id: 'qizil', label: 'Qizil', hex: '#c62f2f', neutral: false },
  { id: 'bordo', label: 'Bordo', hex: '#6d1f2d', neutral: false },
  { id: 'pushti', label: 'Pushti', hex: '#e8a0b4', neutral: false },
  { id: 'toqsariq', label: 'To‘q sariq', hex: '#e07b28', neutral: false },
  { id: 'sariq', label: 'Sariq', hex: '#e6c229', neutral: false },
  { id: 'binafsha', label: 'Binafsha', hex: '#6c4a9e', neutral: false }
];
export const colorById = (id: string) => COLORS.find((c) => c.id === id);

export interface City {
  id: string;
  label: string;
  lat: number;
  lon: number;
}

export const CITIES: City[] = [
  { id: 'toshkent', label: 'Toshkent', lat: 41.3111, lon: 69.2797 },
  { id: 'andijon', label: 'Andijon', lat: 40.7821, lon: 72.3442 },
  { id: 'fargona', label: 'Farg‘ona', lat: 40.3864, lon: 71.7864 },
  { id: 'namangan', label: 'Namangan', lat: 40.9983, lon: 71.6726 },
  { id: 'samarqand', label: 'Samarqand', lat: 39.627, lon: 66.975 },
  { id: 'buxoro', label: 'Buxoro', lat: 39.7747, lon: 64.4286 },
  { id: 'navoiy', label: 'Navoiy', lat: 40.1039, lon: 65.3688 },
  { id: 'qarshi', label: 'Qarshi', lat: 38.8606, lon: 65.7891 },
  { id: 'termiz', label: 'Termiz', lat: 37.2242, lon: 67.2783 },
  { id: 'jizzax', label: 'Jizzax', lat: 40.1158, lon: 67.8422 },
  { id: 'guliston', label: 'Guliston', lat: 40.4897, lon: 68.7842 },
  { id: 'nukus', label: 'Nukus', lat: 42.4531, lon: 59.6103 },
  { id: 'urganch', label: 'Urganch', lat: 41.55, lon: 60.6333 },
  { id: 'nurafshon', label: 'Nurafshon', lat: 41.0444, lon: 69.3533 }
];
export const cityById = (id: string) => CITIES.find((c) => c.id === id) ?? CITIES[0];
