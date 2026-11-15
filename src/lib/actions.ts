import { z } from 'zod';
import { db } from './db';
import { create, getOwnerId, remove, update, wearLogIdFor, nowIso, notifyChange } from './repo';
import { queueImageDelete } from './imageSync';
import type { ClothingItem, Outfit } from './types';

// ---------- Tekshirish ----------
const season = z.enum(['bahor', 'yoz', 'kuz', 'qish']);
const occasion = z.enum(['kundalik', 'ish', 'sport', 'bayram', 'sayohat', 'uchrashuv']);

export const itemSchema = z.object({
  name: z.string().trim().min(1, 'Nomini kiriting').max(80, 'Nomi juda uzun'),
  category: z.enum(['ustki', 'pastki', 'libos', 'tashqi', 'oyoq', 'aksessuar', 'boshqa']),
  subtype: z.string().max(40),
  colors: z.array(z.string()).max(4, 'Ko‘pi bilan 4 ta rang'),
  seasons: z.array(season),
  occasions: z.array(occasion),
  warmth: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  brand: z.string().trim().max(60),
  size: z.string().trim().max(20),
  price: z.number().min(0, 'Narx manfiy bo‘lmasin').max(1e11).nullable(),
  purchased_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  notes: z.string().max(1000),
  favorite: z.boolean()
});
export type ItemInput = z.infer<typeof itemSchema>;

export const outfitSchema = z.object({
  name: z.string().trim().min(1, 'Obraz nomini kiriting').max(80),
  item_ids: z.array(z.string()).min(1, 'Kamida 1 ta kiyim tanlang').max(10, 'Ko‘pi bilan 10 ta kiyim'),
  occasion,
  seasons: z.array(season),
  notes: z.string().max(1000)
});
export type OutfitInput = z.infer<typeof outfitSchema>;

export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) {
    const k = i.path.join('.') || '_';
    if (!out[k]) out[k] = i.message;
  }
  return out;
}

// ---------- Kiyimlar ----------
export async function addItem(input: ItemInput, image: { id: string; ext: string; bgRemoved: boolean } | null): Promise<ClothingItem> {
  return create('items', {
    ...input,
    name: input.name.trim(),
    archived: false,
    image_id: image?.id ?? null,
    image_ext: image?.ext ?? null,
    bg_removed: image?.bgRemoved ?? false
  });
}

export async function editItem(id: string, input: Partial<ItemInput> & { archived?: boolean }) {
  return update('items', id, input);
}

export async function deleteItem(item: ClothingItem) {
  // obrazlardan ham olib tashlanadi
  const outfits = (await db.outfits.toArray()).filter((o) => !o.deleted_at && o.item_ids.includes(item.id));
  for (const o of outfits) {
    const rest = o.item_ids.filter((x) => x !== item.id);
    if (rest.length) await update('outfits', o.id, { item_ids: rest });
    else await remove('outfits', o.id);
  }
  await remove('items', item.id);
  if (item.image_id) await queueImageDelete(await getOwnerId(), item.image_id, item.image_ext ?? 'webp');
  notifyChange();
}

// ---------- Obrazlar ----------
export async function saveOutfit(input: OutfitInput, existing?: Outfit) {
  const data = { ...input, name: input.name.trim() };
  if (existing) return update('outfits', existing.id, data);
  return create('outfits', { ...data, favorite: false });
}

// ---------- "Bugun kiydim" ----------
export async function logWear(date: string, itemIds: string[], outfitId: string | null, note = '') {
  const owner = await getOwnerId();
  const id = wearLogIdFor(owner, date);
  const cur = await db.wear_logs.get(id);
  if (!itemIds.length) {
    if (cur && !cur.deleted_at) await remove('wear_logs', id);
    return null;
  }
  if (cur) return update('wear_logs', id, { item_ids: [...new Set(itemIds)], outfit_id: outfitId, note, deleted_at: null } as never);
  return create('wear_logs', { id, date, item_ids: [...new Set(itemIds)], outfit_id: outfitId, note });
}

export { nowIso };
