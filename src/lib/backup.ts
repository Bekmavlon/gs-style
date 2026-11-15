import { db } from './db';
import { getOwnerId, notifyChange, settingsIdFor, wearLogIdFor } from './repo';
import { remoteWins } from './sync';
import { SYNC_TABLES, type BaseRecord, type TableName } from './types';

// Zaxira: JSON (ixtiyoriy ravishda rasmlar bilan — data URL ko'rinishida)

export interface BackupFile {
  app: 'libosim';
  format: 1;
  exported_at: string;
  tables: Partial<Record<TableName, BaseRecord[]>>;
  images?: { id: string; mime: string; data: string }[];
}

async function toDataUrl(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${b.type || 'application/octet-stream'};base64,${btoa(bin)}`;
}

export async function exportAll(withImages = true): Promise<BackupFile> {
  const tables: Partial<Record<TableName, BaseRecord[]>> = {};
  for (const t of SYNC_TABLES) tables[t] = ((await db.table(t).toArray()) as BaseRecord[]).filter((r) => !r.deleted_at);
  const out: BackupFile = { app: 'libosim', format: 1, exported_at: new Date().toISOString(), tables };
  if (withImages) {
    const used = new Set((tables.items ?? []).map((i) => (i as unknown as { image_id: string | null }).image_id).filter(Boolean));
    const imgs = (await db.images.toArray()).filter((i) => used.has(i.id));
    out.images = await Promise.all(imgs.map(async (i) => ({ id: i.id, mime: i.mime, data: await toDataUrl(i.blob) })));
  }
  return out;
}

export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

export class BackupError extends Error {}

function validate(raw: unknown): BackupFile {
  const b = raw as BackupFile;
  if (!b || typeof b !== 'object' || b.app !== 'libosim') throw new BackupError('Bu Libosim zaxira fayli emas');
  if (b.format !== 1) throw new BackupError('Zaxira formati qo‘llab-quvvatlanmaydi');
  if (!b.tables || typeof b.tables !== 'object') throw new BackupError('Jadvallar topilmadi');
  for (const [t, rows] of Object.entries(b.tables)) {
    if (!SYNC_TABLES.includes(t as TableName)) throw new BackupError(`Noma’lum jadval: ${t}`);
    if (!Array.isArray(rows)) throw new BackupError(`${t}: ro‘yxat emas`);
    for (const r of rows) if (!r || typeof r.id !== 'string' || typeof r.updated_at !== 'string') throw new BackupError(`${t}: noto‘g‘ri yozuv`);
  }
  if (b.images && !Array.isArray(b.images)) throw new BackupError('Rasmlar noto‘g‘ri');
  return b;
}

export async function importBackup(raw: unknown, makeThumb?: (b: Blob, alpha: boolean) => Promise<Blob>) {
  const b = validate(raw);
  const owner = await getOwnerId();
  const res = { added: 0, updated: 0, skipped: 0, images: 0 };
  const now = new Date().toISOString();
  // rasmlar
  for (const img of b.images ?? []) {
    if (!img?.id || !String(img.data).startsWith('data:image/')) continue;
    if (await db.images.get(img.id)) continue;
    const blob = await (await fetch(img.data)).blob();
    const alpha = img.mime !== 'image/jpeg';
    await db.images.put({ id: img.id, blob, thumb: makeThumb ? await makeThumb(blob, alpha) : blob, mime: img.mime, width: 0, height: 0, uploaded: 0, owner, created_at: now });
    res.images++;
  }
  await db.transaction('rw', [...SYNC_TABLES.map((t) => db.table(t)), db.outbox], async () => {
    for (const t of SYNC_TABLES) {
      for (const r0 of b.tables[t] ?? []) {
        let id = r0.id;
        if (t === 'user_settings') id = settingsIdFor(owner);
        if (t === 'wear_logs') id = wearLogIdFor(owner, (r0 as unknown as { date: string }).date);
        const r = { ...r0, id, user_id: owner } as BaseRecord;
        const local = (await db.table(t).get(id)) as BaseRecord | undefined;
        if (!local) res.added++;
        else if (remoteWins(local, r)) res.updated++;
        else {
          res.skipped++;
          continue;
        }
        await db.table(t).put(r);
        await db.outbox.add({ table: t, record_id: id, queued_at: now });
      }
    }
  });
  notifyChange();
  return res;
}

export async function readFileAsJson(file: File): Promise<unknown> {
  if (file.size > 300 * 1024 * 1024) throw new BackupError('Fayl juda katta');
  try {
    return JSON.parse(await file.text());
  } catch {
    throw new BackupError('JSON o‘qib bo‘lmadi');
  }
}
