import { db, getMeta, setMeta } from './db';
import { stableUuid, uuid } from './ids';
import type { BaseRecord, TableMap, TableName, UserSettings } from './types';

export const EPOCH = '1970-01-01T00:00:00.000Z';

// ===== Egasi =====
let ownerCache: string | null | undefined;

export async function getOwnerId(): Promise<string | null> {
  if (ownerCache !== undefined) return ownerCache;
  ownerCache = await getMeta<string | null>('owner_id', null);
  return ownerCache;
}
export function __resetOwnerCache() {
  ownerCache = undefined;
}
export async function setOwnerId(id: string | null) {
  ownerCache = id;
  await setMeta('owner_id', id);
}
export const settingsIdFor = (owner: string | null) => stableUuid(`settings:${owner ?? 'local'}`);

// ===== O'zgarish tinglovchilari =====
type Listener = () => void;
const listeners = new Set<Listener>();
export function onLocalChange(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function notifyChange() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* */
    }
  });
}

let lastTs = 0;
export function nowIso(): string {
  let t = Date.now();
  if (t <= lastTs) t = lastTs + 1;
  lastTs = t;
  return new Date(t).toISOString();
}

type NewRecord<T extends TableName> = Omit<TableMap[T], keyof BaseRecord> & { id?: string };
const tableOf = <T extends TableName>(n: T) => db.table(n) as unknown as import('dexie').Table<TableMap[T], string>;

export async function create<T extends TableName>(table: T, data: NewRecord<T>): Promise<TableMap[T]> {
  const owner = await getOwnerId();
  const ts = nowIso();
  const rec = { ...data, id: data.id ?? uuid(), user_id: owner, created_at: ts, updated_at: ts, deleted_at: null } as unknown as TableMap[T];
  await db.transaction('rw', [tableOf(table), db.outbox], async () => {
    await tableOf(table).put(rec);
    await db.outbox.add({ table, record_id: rec.id, queued_at: ts });
  });
  notifyChange();
  return rec;
}

export async function update<T extends TableName>(table: T, id: string, patch: Partial<Omit<TableMap[T], keyof BaseRecord>>): Promise<TableMap[T]> {
  const ts = nowIso();
  let out!: TableMap[T];
  await db.transaction('rw', [tableOf(table), db.outbox], async () => {
    const cur = await tableOf(table).get(id);
    if (!cur) throw new Error(`Yozuv topilmadi: ${table}/${id}`);
    out = { ...cur, ...patch, updated_at: ts } as TableMap[T];
    await tableOf(table).put(out);
    await db.outbox.add({ table, record_id: id, queued_at: ts });
  });
  notifyChange();
  return out;
}

export async function remove(table: TableName, id: string): Promise<void> {
  const ts = nowIso();
  await db.transaction('rw', [tableOf(table), db.outbox], async () => {
    const cur = await tableOf(table).get(id);
    if (!cur) return;
    await tableOf(table).put({ ...cur, deleted_at: ts, updated_at: ts });
    await db.outbox.add({ table, record_id: id, queued_at: ts });
  });
  notifyChange();
}

// ===== Sozlamalar =====
export function defaultSettings(id: string, owner: string | null): UserSettings {
  return {
    id,
    user_id: owner,
    created_at: EPOCH,
    updated_at: EPOCH,
    deleted_at: null,
    display_name: '',
    gender: null,
    height_cm: null,
    weight_kg: null,
    age: null,
    city_id: 'toshkent',
    theme: 'light',
    timezone: 'Asia/Tashkent',
    forgotten_days: 30,
    morning_reminder: false,
    morning_time: '07:30',
    remove_bg: true
  };
}

/** liveQuery ichida xavfsiz: DB so'rovidan oldin native promise kutilmaydi */
function withOwner<T>(fn: (owner: string | null) => Promise<T>): Promise<T> {
  if (ownerCache !== undefined) return fn(ownerCache);
  return db.meta.get('owner_id').then((row) => {
    ownerCache = (row?.value as string | null) ?? null;
    return fn(ownerCache);
  });
}

export function getSettings(): Promise<UserSettings> {
  return withOwner((owner) => {
    const id = settingsIdFor(owner);
    return db.user_settings.get(id).then((s) => (s ? { ...defaultSettings(id, owner), ...s } : defaultSettings(id, owner)));
  });
}

export async function saveSettings(patch: Partial<Omit<UserSettings, keyof BaseRecord>>): Promise<UserSettings> {
  const s = await getSettings();
  if (!(await db.user_settings.get(s.id))) await db.user_settings.put(s);
  return update('user_settings', s.id, patch);
}

/** Kuniga bitta "bugun kiydim" yozuvi — deterministik id (qurilmalar o'rtasida dublikatsiz) */
export const wearLogIdFor = (owner: string | null, date: string) => stableUuid(`wl:${owner ?? 'local'}:${date}`);
