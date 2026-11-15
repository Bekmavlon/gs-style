// Rasmlarni Supabase Storage bilan sinxronlash (private "wardrobe" bucket, <user_id>/<id>.<ext>)
import { db, getMeta, setMeta } from './db';
import { makeThumb, decode, remotePath } from './images';
import { getSupabase } from './supabase';
import { notifyChange } from './repo';

export const BUCKET = 'wardrobe';
const DEL_KEY = 'pending_image_deletes';

/** Yuklanmagan rasmlarni yuborish, o'chirilganlarini serverdan olib tashlash */
export async function syncImages(uid: string) {
  const sb = getSupabase();
  if (!sb) return;
  // 1) o'chirish navbati
  const pending = await getMeta<string[]>(DEL_KEY, []);
  if (pending.length) {
    const { error } = await sb.storage.from(BUCKET).remove(pending.filter((p) => p.startsWith(`${uid}/`)));
    if (!error) await setMeta(DEL_KEY, []);
  }
  // 2) yuklash
  const items = (await db.items.toArray()).filter((i) => !i.deleted_at && i.image_id);
  const extById = new Map(items.map((i) => [i.image_id as string, i.image_ext ?? 'webp']));
  const toUpload = await db.images.where('uploaded').equals(0).toArray();
  for (const img of toUpload) {
    const ext = extById.get(img.id);
    if (!ext) continue; // hali kiyimga biriktirilmagan
    const { error } = await sb.storage.from(BUCKET).upload(remotePath(uid, img.id, ext), img.blob, { upsert: true, contentType: img.mime });
    if (error) throw new Error(`Rasm yuklanmadi: ${error.message}`);
    await db.images.update(img.id, { uploaded: 1, owner: uid });
  }
}

/** Kiyim o'chirilganda serverdagi rasmni ham o'chirish uchun navbatga qo'yish */
export async function queueImageDelete(owner: string | null, imageId: string, ext: string) {
  await db.images.delete(imageId);
  if (!owner) return;
  const list = await getMeta<string[]>(DEL_KEY, []);
  list.push(remotePath(owner, imageId, ext));
  await setMeta(DEL_KEY, list.slice(-500));
}

const inflight = new Map<string, Promise<boolean>>();

/** Boshqa qurilmada qo'shilgan rasmni kerak bo'lganda yuklab olish */
export function ensureImage(owner: string | null, imageId: string, ext: string): Promise<boolean> {
  if (!owner) return Promise.resolve(false);
  const cur = inflight.get(imageId);
  if (cur) return cur;
  const p = (async () => {
    if (await db.images.get(imageId)) return true;
    const sb = getSupabase();
    if (!sb || !navigator.onLine) return false;
    const { data, error } = await sb.storage.from(BUCKET).download(remotePath(owner, imageId, ext));
    if (error || !data) return false;
    const alpha = ext !== 'jpg';
    const bmp = await decode(data);
    await db.images.put({
      id: imageId,
      blob: data,
      thumb: await makeThumb(data, alpha),
      mime: data.type || (ext === 'png' ? 'image/png' : ext === 'jpg' ? 'image/jpeg' : 'image/webp'),
      width: bmp.width,
      height: bmp.height,
      uploaded: 1,
      owner,
      created_at: new Date().toISOString()
    });
    bmp.close?.();
    notifyChange();
    return true;
  })().finally(() => inflight.delete(imageId));
  inflight.set(imageId, p);
  return p;
}

/** Hisobni o'chirishdan oldin: foydalanuvchining barcha rasmlarini serverdan o'chirish */
export async function deleteAllRemoteImages(uid: string) {
  const sb = getSupabase();
  if (!sb) return;
  for (let i = 0; i < 50; i++) {
    const { data, error } = await sb.storage.from(BUCKET).list(uid, { limit: 1000 });
    if (error) throw new Error(error.message);
    if (!data?.length) return;
    const { error: e2 } = await sb.storage.from(BUCKET).remove(data.map((f) => `${uid}/${f.name}`));
    if (e2) throw new Error(e2.message);
  }
}
