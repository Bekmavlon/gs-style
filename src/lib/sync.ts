import { create as createStore } from 'zustand';
import { db, getMeta, setMeta } from './db';
import { EPOCH, getOwnerId, onLocalChange, setOwnerId, settingsIdFor, wearLogIdFor } from './repo';
import { syncImages } from './imageSync';
import { getSupabase } from './supabase';
import { SYNC_TABLES, type BaseRecord, type OutboxItem, type TableName } from './types';
import { uuid } from './ids';

// ===== OFFLINE-FIRST SINXRONLASH =====
// 1) Har lokal yozuv outbox'ga tushadi.
// 2) PUSH: outbox'dagi yozuvlarning JORIY holati upsert qilinadi (server LWW trigger eski versiyani rad etadi).
// 3) PULL: server_updated_at kursoridan keyingi o'zgarishlar olinadi va lokalda LWW bilan qo'llanadi.
// 4) Xatoda eksponensial kechikish bilan qayta urinish.

export type SyncStatus = 'local' | 'idle' | 'syncing' | 'offline' | 'error';

interface SyncState {
  status: SyncStatus;
  pending: number;
  lastSyncAt: string | null;
  error: string | null;
  set: (p: Partial<SyncState>) => void;
}

export const useSync = createStore<SyncState>((set) => ({
  status: 'local',
  pending: 0,
  lastSyncAt: null,
  error: null,
  set: (p) => set(p)
}));

const TS_FIELDS = new Set(['created_at', 'updated_at', 'deleted_at']);

/** Server qatorini lokal formatga (ISO "Z" vaqtlar, server_updated_at olib tashlanadi) */
export function fromServerRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'server_updated_at') continue;
    if (TS_FIELDS.has(k) && typeof v === 'string') out[k] = new Date(v).toISOString();
    else if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) && NUMERIC_FIELDS.has(k)) out[k] = Number(v);
    else out[k] = v;
  }
  return out;
}

const NUMERIC_FIELDS = new Set(['price', 'height_cm', 'weight_kg', 'age', 'warmth', 'forgotten_days']);

export function toServerRow(rec: Record<string, unknown>, uid: string): Record<string, unknown> {
  return { ...rec, user_id: uid };
}

/** LWW: kelgan yozuv lokaldan yangiroq bo'lsa true */
export function remoteWins(local: BaseRecord | undefined, remote: BaseRecord): boolean {
  if (!local) return true;
  return new Date(remote.updated_at).getTime() > new Date(local.updated_at).getTime();
}

export async function pendingCount(): Promise<number> {
  return db.outbox.count();
}

let running: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let failures = 0;

export async function deviceId(): Promise<string> {
  let id = await getMeta<string | null>('device_id', null);
  if (!id) {
    id = uuid();
    await setMeta('device_id', id);
  }
  return id;
}

export function syncNow(): Promise<void> {
  if (running) return running;
  running = doSync().finally(() => {
    running = null;
  });
  return running;
}

async function doSync() {
  const st = useSync.getState();
  const sb = getSupabase();
  st.set({ pending: await pendingCount() });
  if (!sb) return st.set({ status: 'local', error: null });
  const { data } = await sb.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return st.set({ status: 'local', error: null });
  if (typeof navigator !== 'undefined' && !navigator.onLine) return st.set({ status: 'offline' });
  const owner = await getOwnerId();
  if (owner && owner !== uid) {
    // Boshqa hisob: oldingi hisob ma'lumotlari aralashmasligi uchun lokal baza tozalanadi
    await wipeLocal();
    await setOwnerId(uid);
  } else if (owner !== uid) {
    await adoptLocalData(uid);
  }

  st.set({ status: 'syncing', error: null });
  try {
    await push(uid);
    await pull(uid);
    await syncImages(uid);
    const now = new Date().toISOString();
    await setMeta('last_sync_at', now);
    failures = 0;
    st.set({ status: 'idle', lastSyncAt: now, pending: await pendingCount(), error: null });
  } catch (e) {
    failures++;
    const msg = e instanceof Error ? e.message : String(e);
    st.set({ status: navigator.onLine ? 'error' : 'offline', error: msg, pending: await pendingCount() });
    const delay = Math.min(300_000, 5_000 * 2 ** Math.min(failures - 1, 6));
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => void syncNow(), delay);
  }
}

async function push(uid: string) {
  const sb = getSupabase()!;
  const items: OutboxItem[] = await db.outbox.orderBy('seq').toArray();
  if (!items.length) return;
  const maxSeq = items[items.length - 1].seq!;
  const byTable = new Map<TableName, Set<string>>();
  for (const it of items) {
    if (!byTable.has(it.table)) byTable.set(it.table, new Set());
    byTable.get(it.table)!.add(it.record_id);
  }
  for (const table of SYNC_TABLES) {
    const ids = byTable.get(table);
    if (!ids?.size) continue;
    const recs = (await db.table(table).bulkGet([...ids])).filter(Boolean) as Record<string, unknown>[];
    for (let i = 0; i < recs.length; i += 200) {
      const chunk = recs.slice(i, i + 200).map((r) => toServerRow(r, uid));
      const { error } = await sb.from(table).upsert(chunk, { onConflict: 'id' });
      if (error) throw new Error(`${table}: ${error.message}`);
    }
  }
  // faqat yuborilganlarni o'chiramiz (yuborish vaqtida qo'shilganlari qoladi)
  await db.outbox.where('seq').belowOrEqual(maxSeq).delete();
}

async function pull(uid: string) {
  const sb = getSupabase()!;
  for (const table of SYNC_TABLES) {
    const key = `cursor:${uid}:${table}`;
    let cursor = await getMeta<string>(key, EPOCH);
    // 2 daqiqalik qoplama: parallel tranzaksiyalarda o'tkazib yubormaslik uchun (qayta qo'llash idempotent)
    const since = new Date(Math.max(0, new Date(cursor).getTime() - 120_000)).toISOString();
    for (let page = 0; page < 50; page++) {
      const { data, error } = await sb
        .from(table)
        .select('*')
        .gt('server_updated_at', since)
        .order('server_updated_at', { ascending: true })
        .range(page * 1000, page * 1000 + 999);
      if (error) throw new Error(`${table}: ${error.message}`);
      if (!data?.length) break;
      await db.transaction('rw', db.table(table), async () => {
        for (const row of data as Record<string, unknown>[]) {
          const remote = fromServerRow(row) as unknown as BaseRecord;
          const local = (await db.table(table).get(remote.id)) as BaseRecord | undefined;
          if (remoteWins(local, remote)) await db.table(table).put(remote);
        }
      });
      const last = new Date((data[data.length - 1] as { server_updated_at: string }).server_updated_at).toISOString();
      if (last > cursor) cursor = last;
      if (data.length < 1000) break;
    }
    await setMeta(key, cursor);
  }
}

/**
 * Lokal (tizimga kirmasdan yaratilgan) ma'lumotlarni hisobga biriktirish.
 * Deterministik id'li yozuvlar (sozlamalar, kunlik ko'rsatkichlar) yangi egaga qayta kalitlanadi.
 */
export async function adoptLocalData(uid: string) {
  const tables = [...SYNC_TABLES.map((t) => db.table(t)), db.outbox];
  await db.transaction('rw', tables, async () => {
    const rekey = async (table: TableName, idFor: (r: Record<string, unknown>) => string) => {
      const all = (await db.table(table).toArray()) as Record<string, unknown>[];
      for (const r of all) {
        const nid = idFor(r);
        if (nid !== r.id) {
          await db.table(table).delete(r.id as string);
          const existing = (await db.table(table).get(nid)) as BaseRecord | undefined;
          if (existing && !remoteWins(existing, r as unknown as BaseRecord)) continue;
          await db.table(table).put({ ...r, id: nid, user_id: uid });
        }
      }
    };
    await rekey('user_settings', () => settingsIdFor(uid));
    await rekey('wear_logs', (r) => wearLogIdFor(uid, r.date as string));
    await db.outbox.clear();
    for (const t of SYNC_TABLES) {
      const all = (await db.table(t).toArray()) as BaseRecord[];
      for (const r of all) {
        if (r.user_id !== uid) await db.table(t).put({ ...r, user_id: uid });
        if (r.updated_at !== EPOCH) await db.outbox.add({ table: t, record_id: r.id, queued_at: r.updated_at });
      }
    }
  });
  await setOwnerId(uid);
}

/** Avtomatik sinxronlash: lokal o'zgarish, tarmoq qaytishi, ilova ochilishi, har 60 s */
let started = false;
export function startAutoSync() {
  if (started) return;
  started = true;
  let debounce: ReturnType<typeof setTimeout> | null = null;
  onLocalChange(() => {
    void pendingCount().then((n) => useSync.getState().set({ pending: n }));
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => void syncNow(), 2000);
  });
  window.addEventListener('online', () => void syncNow());
  window.addEventListener('offline', () => useSync.getState().set({ status: getSupabase() ? 'offline' : 'local' }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
  });
  setInterval(() => void syncNow(), 60_000);
  const sb = getSupabase();
  sb?.auth.onAuthStateChange((ev) => {
    if (ev === 'SIGNED_IN' || ev === 'TOKEN_REFRESHED') void syncNow();
  });
  void syncNow();
}

/** Hisobdan chiqish: lokal ma'lumotlar o'chiriladi (boshqa hisob aralashmasligi uchun) */
export async function signOutAndWipe() {
  const sb = getSupabase();
  if (sb) await sb.auth.signOut();
  await wipeLocal();
}

export async function wipeLocal() {
  await db.transaction('rw', [...SYNC_TABLES.map((t) => db.table(t)), db.outbox, db.meta, db.images], async () => {
    for (const t of SYNC_TABLES) await db.table(t).clear();
    await db.images.clear();
    await db.outbox.clear();
    await db.meta.clear();
  });
  await setOwnerId(null);
}
