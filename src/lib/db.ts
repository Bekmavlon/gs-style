import Dexie, { type Table } from 'dexie';
import type { LocalImage, MetaItem, OutboxItem, TableMap } from './types';

// Telefon/brauzerdagi baza (IndexedDB). Hamma yozuv avval shu yerga tushadi.
export class LibosimDB extends Dexie {
  items!: Table<TableMap['items'], string>;
  outfits!: Table<TableMap['outfits'], string>;
  wear_logs!: Table<TableMap['wear_logs'], string>;
  user_settings!: Table<TableMap['user_settings'], string>;
  images!: Table<LocalImage, string>;
  outbox!: Table<OutboxItem, number>;
  meta!: Table<MetaItem, string>;

  constructor(name = 'libosim') {
    super(name);
    this.version(1).stores({
      items: 'id, category, updated_at',
      outfits: 'id, updated_at',
      wear_logs: 'id, date',
      user_settings: 'id',
      images: 'id, uploaded',
      outbox: '++seq, table, record_id',
      meta: 'key'
    });
  }
}

export let db = new LibosimDB();

export function __setDb(next: LibosimDB) {
  db = next;
}

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key);
  return (row?.value as T) ?? fallback;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}
