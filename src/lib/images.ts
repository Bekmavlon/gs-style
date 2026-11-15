// Rasm jarayoni: o'qish (EXIF burilishi bilan), kesish, siqish, eskiz, fonni olib tashlash, saqlash.
import { db } from './db';
import { uuid } from './ids';
import { getOwnerId, notifyChange } from './repo';
import type { LocalImage } from './types';

export const MAX_SIDE = 1080;
export const THUMB_SIDE = 360;

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

let webpOk: boolean | null = null;
export function supportsWebp(): boolean {
  if (webpOk !== null) return webpOk;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    webpOk = c.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    webpOk = false;
  }
  return webpOk;
}

/** Shaffoflik kerak bo'lsa WebP (yoki PNG), aks holda WebP (yoki JPEG) */
export function outputMime(alpha: boolean): string {
  if (supportsWebp()) return 'image/webp';
  return alpha ? 'image/png' : 'image/jpeg';
}

export const extOf = (mime: string) => (mime === 'image/webp' ? 'webp' : mime === 'image/png' ? 'png' : 'jpg');

export async function decode(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    return await createImageBitmap(blob);
  }
}

function canvasToBlob(cv: HTMLCanvasElement, mime: string, q = 0.84): Promise<Blob> {
  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Rasmni saqlab bo‘lmadi'))), mime, q));
}

/** Kesish + kichraytirish. rect — manba piksellarida. */
export async function renderCrop(src: ImageBitmap, rect: CropRect | null, maxSide = MAX_SIDE, alpha = false): Promise<{ blob: Blob; width: number; height: number }> {
  const r = rect ?? { x: 0, y: 0, w: src.width, h: src.height };
  const scale = Math.min(1, maxSide / Math.max(r.w, r.h));
  const w = Math.max(1, Math.round(r.w * scale));
  const h = Math.max(1, Math.round(r.h * scale));
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, w, h);
  const mime = outputMime(alpha);
  return { blob: await canvasToBlob(cv, mime), width: w, height: h };
}

export async function makeThumb(blob: Blob, alpha: boolean): Promise<Blob> {
  const bmp = await decode(blob);
  const { blob: t } = await renderCrop(bmp, null, THUMB_SIDE, alpha);
  bmp.close?.();
  return t;
}

/** Shaffof chetlarni kesib, kiyimni markazga olib keladi (10% bo'sh joy bilan) */
export async function trimTransparent(blob: Blob): Promise<Blob> {
  const bmp = await decode(blob);
  const cv = document.createElement('canvas');
  cv.width = bmp.width;
  cv.height = bmp.height;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, cv.width, cv.height);
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y += 2)
    for (let x = 0; x < width; x += 2)
      if (data[(y * width + x) * 4 + 3] > 24) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  if (maxX < 0) return blob; // hech narsa topilmadi
  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.08);
  const x = Math.max(0, minX - pad), y = Math.max(0, minY - pad);
  const w = Math.min(width - x, maxX - minX + pad * 2), h = Math.min(height - y, maxY - minY + pad * 2);
  const out = await renderCrop(bmp, { x, y, w, h }, MAX_SIDE, true);
  bmp.close?.();
  return out.blob;
}

// ---------- Fonni olib tashlash (faqat Android ilovada, ML Kit — telefonda, bepul) ----------

export function isNative(): boolean {
  return !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
}

export function bgRemovalAvailable(): boolean {
  return isNative();
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] ?? '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

export type BgProgress = (stage: 'model' | 'process', pct?: number) => void;

/** Natija: shaffof fonli rasm yoki null (imkoni bo'lmasa — asl rasm qoladi) */
export async function removeBackground(blob: Blob, onProgress?: BgProgress): Promise<Blob | null> {
  if (!isNative()) return null;
  try {
    const [{ SubjectSegmentation }, { Filesystem, Directory }, { Capacitor }] = await Promise.all([
      import('@capacitor-mlkit/subject-segmentation'),
      import('@capacitor/filesystem'),
      import('@capacitor/core')
    ]);
    const { available } = await SubjectSegmentation.isGoogleSubjectSegmentationModuleAvailable();
    if (!available) {
      onProgress?.('model');
      const done = new Promise<void>((resolve, reject) => {
        void SubjectSegmentation.addListener('googleSubjectSegmentationModuleInstallProgress', (e) => {
          onProgress?.('model', e.progress);
          if (e.state === 4) resolve();
          if (e.state === 5 || e.state === 3) reject(new Error('Model yuklanmadi'));
        });
      });
      await SubjectSegmentation.installGoogleSubjectSegmentationModule();
      await Promise.race([done, new Promise((_, rej) => setTimeout(() => rej(new Error('Vaqt tugadi')), 120_000))]);
      await SubjectSegmentation.removeAllListeners();
    }
    onProgress?.('process');
    const name = `seg-${uuid()}.jpg`;
    const jpg = blob.type === 'image/jpeg' ? blob : (await renderCrop(await decode(blob), null, MAX_SIDE, false)).blob;
    const written = await Filesystem.writeFile({ path: name, data: await blobToBase64(jpg), directory: Directory.Cache });
    const res = await SubjectSegmentation.processImage({ path: written.uri, confidence: 0.6 });
    const out = await (await fetch(Capacitor.convertFileSrc(res.path))).blob();
    await Filesystem.deleteFile({ path: name, directory: Directory.Cache }).catch(() => undefined);
    return await trimTransparent(out);
  } catch (e) {
    console.warn('Fonni olib tashlab bo‘lmadi', e);
    return null;
  }
}

// ---------- Saqlash ----------

export async function storeImage(blob: Blob, alpha: boolean): Promise<LocalImage> {
  const bmp = await decode(blob);
  const rec: LocalImage = {
    id: uuid(),
    blob,
    thumb: await makeThumb(blob, alpha),
    mime: blob.type || outputMime(alpha),
    width: bmp.width,
    height: bmp.height,
    uploaded: 0,
    owner: await getOwnerId(),
    created_at: new Date().toISOString()
  };
  bmp.close?.();
  await db.images.put(rec);
  notifyChange();
  return rec;
}

export const remotePath = (owner: string, imageId: string, ext: string) => `${owner}/${imageId}.${ext}`;
