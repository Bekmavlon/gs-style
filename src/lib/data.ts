import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from './db';
import { defaultSettings, getOwnerId, getSettings } from './repo';
import { todayISO } from './dates';
import { ensureImage } from './imageSync';
import type { ClothingItem, Outfit, UserSettings, WearLog } from './types';

export interface Wardrobe {
  items: ClothingItem[];
  outfits: Outfit[];
  logs: WearLog[];
  settings: UserSettings;
  owner: string | null;
}

const alive = <T extends { deleted_at: string | null }>(a: T[]) => a.filter((r) => !r.deleted_at);

export async function loadWardrobe(): Promise<Wardrobe> {
  const [settings, items, outfits, logs, owner] = await Promise.all([
    getSettings(),
    db.items.toArray(),
    db.outfits.toArray(),
    db.wear_logs.toArray(),
    db.meta.get('owner_id').then((r) => (r?.value as string | null) ?? null)
  ]);
  return {
    settings,
    items: alive(items).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    outfits: alive(outfits).sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    logs: alive(logs),
    owner
  };
}

export function useWardrobe(): Wardrobe | undefined {
  return useLiveQuery(loadWardrobe, []);
}

const FALLBACK = defaultSettings('fallback', null);
export function useSettings(): UserSettings {
  return useLiveQuery(() => getSettings(), []) ?? FALLBACK;
}

export function useToday(tz = 'Asia/Tashkent'): string {
  const [d, setD] = useState(() => todayISO(tz));
  useEffect(() => {
    setD(todayISO(tz));
    const t = setInterval(() => setD(todayISO(tz)), 60_000);
    return () => clearInterval(t);
  }, [tz]);
  return d;
}

/** Kiyim rasmi uchun object URL (lokal blob; yo'q bo'lsa serverdan yuklab olinadi) */
export function useImageUrl(item: Pick<ClothingItem, 'image_id' | 'image_ext'> | null | undefined, kind: 'thumb' | 'full' = 'thumb'): string | null {
  const id = item?.image_id ?? null;
  const rec = useLiveQuery(() => (id ? db.images.get(id) : undefined), [id]);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!rec) {
      setUrl(null);
      if (id && rec === undefined) void getOwnerId().then((o) => ensureImage(o, id, item?.image_ext ?? 'webp'));
      return;
    }
    const u = URL.createObjectURL(kind === 'thumb' ? rec.thumb : rec.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [rec, kind, id, item?.image_ext]);
  return url;
}
