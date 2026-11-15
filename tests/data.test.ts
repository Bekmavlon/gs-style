// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeServer } from './fakeServer';

const state: { client: unknown } = { client: null };
vi.mock('@/lib/supabase', () => ({ getSupabase: () => state.client, readConfig: () => null, configSource: () => null, saveRuntimeConfig: () => undefined }));
// jsdom'da canvas yo'q — rasm dekodlash/eskizni soxtalashtiramiz
vi.mock('@/lib/images', async (orig) => {
  const m = await orig<typeof import('@/lib/images')>();
  return { ...m, decode: async () => ({ width: 10, height: 10, close() {} }), makeThumb: async (b: Blob) => b };
});

import { db } from '@/lib/db';
import { addItem, deleteItem, logWear, saveOutfit, type ItemInput } from '@/lib/actions';
import { getOwnerId } from '@/lib/repo';
import { syncNow, useSync } from '@/lib/sync';
import { ensureImage } from '@/lib/imageSync';
import { exportAll, importBackup, BackupError } from '@/lib/backup';
import { loadWardrobe } from '@/lib/data';
import { freshDb, useDevice } from './helpers';

const input = (p: Partial<ItemInput> = {}): ItemInput => ({
  name: 'Jigarrang sviter', category: 'ustki', subtype: 'Sviter', colors: ['jigarrang'], seasons: ['kuz', 'qish'], occasions: ['kundalik'],
  warmth: 3, brand: '', size: '', price: 350000, purchased_on: null, notes: '', favorite: false, ...p
});

async function putImage(id: string) {
  const blob = new Blob(['RASM-' + id], { type: 'image/webp' });
  await db.images.put({ id, blob, thumb: blob, mime: 'image/webp', width: 10, height: 10, uploaded: 0, owner: await getOwnerId(), created_at: new Date().toISOString() });
}

beforeEach(async () => {
  state.client = null;
  await freshDb();
});

describe('lokal garderob', () => {
  it('kiyim, obraz va o‘chirishda obrazdan olib tashlash', async () => {
    const a = await addItem(input(), null);
    const b = await addItem(input({ name: 'Jinsi', category: 'pastki', subtype: 'Jinsi', colors: ['tokkok'] }), null);
    const o = await saveOutfit({ name: 'Kundalik', item_ids: [a.id, b.id], occasion: 'kundalik', seasons: [], notes: '' });
    await deleteItem(a);
    let w = await loadWardrobe();
    expect(w.items.map((i) => i.name)).toEqual(['Jinsi']);
    expect(w.outfits.find((x) => x.id === o.id)!.item_ids).toEqual([b.id]);
    await deleteItem(b);
    w = await loadWardrobe();
    expect(w.outfits.length).toBe(0); // bo'sh qolgan obraz ham o'chadi
  });
  it('“bugun kiydim” — kuniga bitta yozuv, bo‘shatilsa o‘chadi', async () => {
    const a = await addItem(input(), null);
    await logWear('2026-11-15', [a.id, a.id], null);
    await logWear('2026-11-15', [a.id], null);
    let w = await loadWardrobe();
    expect(w.logs.length).toBe(1);
    expect(w.logs[0].item_ids).toEqual([a.id]);
    await logWear('2026-11-15', [], null);
    w = await loadWardrobe();
    expect(w.logs.length).toBe(0);
  });
});

describe('sinxronlash (rasmlar bilan, 2 qurilma)', () => {
  it('oflayn qo‘shilgan kiyim va rasmi boshqa qurilmaga yetib boradi; o‘chirish ham', async () => {
    const server = new FakeServer();
    const devA = await freshDb('A');
    await putImage('11111111-1111-4111-8111-111111111111');
    const it1 = await addItem(input(), { id: '11111111-1111-4111-8111-111111111111', ext: 'webp', bgRemoved: true });
    await logWear('2026-11-15', [it1.id], null);

    state.client = server.client('user-1');
    await syncNow();
    expect(useSync.getState().status).toBe('idle');
    expect(server.files.has('wardrobe/user-1/11111111-1111-4111-8111-111111111111.webp')).toBe(true);
    expect((await db.images.get('11111111-1111-4111-8111-111111111111'))!.uploaded).toBe(1);

    const devB = await freshDb('B');
    await syncNow();
    let w = await loadWardrobe();
    expect(w.items.map((i) => i.name)).toEqual(['Jigarrang sviter']);
    expect(w.logs.length).toBe(1);
    expect(await db.images.get('11111111-1111-4111-8111-111111111111')).toBeUndefined();
    expect(await ensureImage('user-1', '11111111-1111-4111-8111-111111111111', 'webp')).toBe(true);
    expect(await (await db.images.get('11111111-1111-4111-8111-111111111111'))!.blob.text()).toBe('RASM-11111111-1111-4111-8111-111111111111');

    // ikkala qurilmada bir kunni belgilash — dublikat yo'q
    await logWear('2026-11-16', [it1.id], null);
    useDevice(devA);
    await logWear('2026-11-16', [it1.id], null);
    await syncNow();
    useDevice(devB);
    await syncNow();
    expect([...server.tables.get('wear_logs')!.values()].filter((l) => l.date === '2026-11-16').length).toBe(1);

    // o'chirish: yozuv va rasm serverdan
    w = await loadWardrobe();
    await deleteItem(w.items[0]);
    await syncNow();
    expect(server.files.size).toBe(0);
    useDevice(devA);
    await syncNow();
    expect((await loadWardrobe()).items.length).toBe(0);
  });

  it('begona foydalanuvchi papkasiga yozib/o‘qib bo‘lmaydi; hisob almashsa lokal tozalanadi', async () => {
    const server = new FakeServer();
    state.client = server.client('alice');
    await freshDb('iso');
    await putImage('22222222-2222-4222-8222-222222222222');
    await addItem(input(), { id: '22222222-2222-4222-8222-222222222222', ext: 'webp', bgRemoved: false });
    await syncNow();
    const bob = server.client('bob') as unknown as { storage: { from: (b: string) => { download: (p: string) => Promise<{ data: unknown }>; upload: (p: string, b: Blob) => Promise<{ error: unknown }> } } };
    expect((await bob.storage.from('wardrobe').download('alice/22222222-2222-4222-8222-222222222222.webp')).data).toBeNull();
    expect((await bob.storage.from('wardrobe').upload('alice/x.webp', new Blob(['x']))).error).not.toBeNull();
    state.client = server.client('bob');
    await syncNow();
    expect((await loadWardrobe()).items.length).toBe(0);
    expect(await db.images.count()).toBe(0);
  });
});

describe('zaxira', () => {
  it('rasmlar bilan eksport → tozalash → import', async () => {
    await putImage('33333333-3333-4333-8333-333333333333');
    await addItem(input(), { id: '33333333-3333-4333-8333-333333333333', ext: 'webp', bgRemoved: true });
    const data = JSON.parse(JSON.stringify(await exportAll(true)));
    expect(data.images.length).toBe(1);
    await freshDb();
    const r = await importBackup(data, async (b) => b);
    expect(r.images).toBe(1);
    const w = await loadWardrobe();
    expect(w.items[0].name).toBe('Jigarrang sviter');
    expect(await (await db.images.get('33333333-3333-4333-8333-333333333333'))!.blob.text()).toBe('RASM-33333333-3333-4333-8333-333333333333');
    await expect(importBackup({ app: 'boshqa' })).rejects.toBeInstanceOf(BackupError);
  });
});
