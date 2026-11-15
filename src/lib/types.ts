// ===== G.S.Style — ma'lumot modeli =====

export interface BaseRecord {
  id: string;
  user_id: string | null;
  created_at: string;
  updated_at: string; // LWW
  deleted_at: string | null;
}

export type Category = 'ustki' | 'pastki' | 'libos' | 'tashqi' | 'oyoq' | 'aksessuar' | 'boshqa';
export type Season = 'bahor' | 'yoz' | 'kuz' | 'qish';
export type Occasion = 'kundalik' | 'ish' | 'sport' | 'bayram' | 'sayohat' | 'uchrashuv';
export type Warmth = 1 | 2 | 3; // yengil / o'rtacha / issiq

export interface ClothingItem extends BaseRecord {
  name: string;
  category: Category;
  subtype: string; // masalan "Futbolka"
  colors: string[]; // ColorDef.id
  seasons: Season[];
  occasions: Occasion[];
  warmth: Warmth;
  brand: string;
  size: string;
  price: number | null; // so'm
  purchased_on: string | null; // YYYY-MM-DD
  notes: string;
  favorite: boolean;
  archived: boolean;
  image_id: string | null; // lokal rasm kaliti; serverda: <user_id>/<image_id>.<ext>
  image_ext: string | null; // webp | png | jpg
  bg_removed: boolean;
}

export interface Outfit extends BaseRecord {
  name: string;
  item_ids: string[];
  occasion: Occasion;
  seasons: Season[];
  favorite: boolean;
  notes: string;
}

export interface WearLog extends BaseRecord {
  date: string; // YYYY-MM-DD
  item_ids: string[];
  outfit_id: string | null;
  note: string;
}

export type Gender = 'erkak' | 'ayol';

export interface UserSettings extends BaseRecord {
  display_name: string;
  gender: Gender | null;
  height_cm: number | null;
  weight_kg: number | null;
  age: number | null;
  city_id: string;
  theme: 'light' | 'dark' | 'system';
  timezone: string;
  forgotten_days: number; // "Eslang" — necha kun kiyilmasa
  morning_reminder: boolean;
  morning_time: string; // HH:mm
  remove_bg: boolean; // rasmni qo'shishda fonni avtomatik olib tashlash
}

export interface TableMap {
  items: ClothingItem;
  outfits: Outfit;
  wear_logs: WearLog;
  user_settings: UserSettings;
}
export type TableName = keyof TableMap;
export const SYNC_TABLES: TableName[] = ['user_settings', 'items', 'outfits', 'wear_logs'];

/** Faqat lokal: rasm fayllari (sinxron alohida — Storage orqali) */
export interface LocalImage {
  id: string;
  blob: Blob;
  thumb: Blob;
  mime: string;
  width: number;
  height: number;
  uploaded: 0 | 1; // Dexie indeksi uchun raqam
  owner: string | null;
  created_at: string;
}

export interface OutboxItem {
  seq?: number;
  table: TableName;
  record_id: string;
  queued_at: string;
}

export interface MetaItem {
  key: string;
  value: unknown;
}
