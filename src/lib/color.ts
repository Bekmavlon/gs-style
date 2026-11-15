// Asosiy rang(lar)ni aniqlash — AI'siz: piksellarni k-means bilan guruhlab, Lab fazosida eng yaqin nomli rangni topish.
import { COLORS, type ColorDef } from './catalog';

export type RGB = [number, number, number];
export type Lab = [number, number, number];

function srgbToLinear(c: number) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function rgbToLab([r, g, b]: RGB): Lab {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const dist = (a: Lab, b: Lab) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const PALETTE = COLORS.map((c) => ({ c, lab: rgbToLab(hexToRgb(c.hex)) }));

export function nearestColor(rgb: RGB): ColorDef {
  const lab = rgbToLab(rgb);
  // past to'yinganlik (chroma) — rangsiz (oq/kulrang/qora) oilasidan tanlash ehtimoli yuqori
  let best = PALETTE[0];
  let bd = Infinity;
  for (const p of PALETTE) {
    const d = dist(lab, p.lab);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best.c;
}

/** Deterministik k-means (k ta markaz, yorqinlik bo'yicha tartiblangan boshlang'ich nuqtalar) */
export function kmeans(pixels: RGB[], k: number, iters = 12): { center: RGB; share: number }[] {
  if (!pixels.length) return [];
  const sorted = [...pixels].sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  let centers: RGB[] = Array.from({ length: k }, (_, i) => sorted[Math.min(sorted.length - 1, Math.floor(((i + 0.5) / k) * sorted.length))]);
  let assign = new Array(pixels.length).fill(0);
  for (let it = 0; it < iters; it++) {
    assign = pixels.map((p) => {
      let bi = 0, bd = Infinity;
      centers.forEach((c, i) => {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < bd) { bd = d; bi = i; }
      });
      return bi;
    });
    centers = centers.map((c, i) => {
      let r = 0, g = 0, b = 0, n = 0;
      pixels.forEach((p, j) => {
        if (assign[j] === i) { r += p[0]; g += p[1]; b += p[2]; n++; }
      });
      return n ? ([r / n, g / n, b / n] as RGB) : c;
    });
  }
  const counts = new Array(k).fill(0);
  assign.forEach((a) => counts[a]++);
  return centers.map((center, i) => ({ center, share: counts[i] / pixels.length })).sort((a, b) => b.share - a.share);
}

/** Piksellardan 1–2 ta asosiy rang id'si (ulushi 18% dan katta guruhlar) */
export function dominantColorIds(pixels: RGB[], max = 2): string[] {
  const clusters = kmeans(pixels, 4).filter((c) => c.share >= 0.18);
  const out: string[] = [];
  for (const c of clusters) {
    const col = nearestColor(c.center).id;
    if (!out.includes(col)) out.push(col);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Fon olib tashlanmagan rasm uchun: chekka piksellardan fon rangini topib, markazdagi fonga
 * o'xshash piksellarni chiqarib tashlaydi. Kiyim fon bilan bir xil rangda bo'lsa (qolgan
 * piksellar juda kam) — asl namunani qaytaradi.
 */
export function dropBackground(center: RGB[], border: RGB[], threshold = 14): RGB[] {
  if (!border.length || !center.length) return center;
  const bg = kmeans(border, 2)[0];
  if (!bg || bg.share < 0.55) return center; // chekka bir xil emas — fon aniq emas
  const bgLab = rgbToLab(bg.center);
  const kept = center.filter((p) => dist(rgbToLab(p), bgLab) > threshold);
  return kept.length >= center.length * 0.12 ? kept : center;
}

/** Rasmdan piksellar namunasini olish (brauzerda). Shaffof fon bo'lsa — faqat kiyim piksellari, aks holda markaz, fon rangisiz. */
export async function samplePixels(blob: Blob, transparentBg: boolean): Promise<RGB[]> {
  const bmp = await createImageBitmap(blob);
  const size = 72;
  const scale = size / Math.max(bmp.width, bmp.height);
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const data = ctx.getImageData(0, 0, w, h).data;
  const px: RGB[] = [];
  const border: RGB[] = [];
  const edge = Math.max(1, Math.round(Math.min(w, h) * 0.06));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const rgb: RGB = [data[i], data[i + 1], data[i + 2]];
      if (transparentBg) {
        if (data[i + 3] >= 200) px.push(rgb);
        continue;
      }
      if (x < edge || y < edge || x >= w - edge || y >= h - edge) border.push(rgb);
      if (x >= w * 0.15 && x <= w * 0.85 && y >= h * 0.12 && y <= h * 0.88) px.push(rgb);
    }
  }
  return transparentBg ? px : dropBackground(px, border);
}
