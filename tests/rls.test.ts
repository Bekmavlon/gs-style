// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
let pg: PGlite;
async function as<T>(uid: string | null, fn: () => Promise<T>) {
  await pg.exec(`set role ${uid ? 'authenticated' : 'anon'}; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false);`);
  try { return await fn(); } finally { await pg.exec('reset role;'); }
}
const SQL = () => readFileSync(resolve(__dirname, '../supabase/migrations/20261115000000_init.sql'), 'utf8');

beforeAll(async () => {
  pg = new PGlite();
  // Supabase muhiti taqlidi: auth + storage
  await pg.exec(`
    create role authenticated nologin; create role anon nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid default auth.uid());
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
    alter table storage.objects enable row level security;
    grant usage on schema auth, storage, public to authenticated, anon;
    grant select, insert, update, delete on storage.objects to authenticated;
  `);
  await pg.exec(SQL());
  await pg.exec(SQL()); // qayta ishga tushirish xato bermasligi kerak
  await pg.exec(`insert into auth.users values ('${A}'), ('${B}')`);
}, 60000);

const item = (id: string, uid: string, name: string, upd = '2026-11-15T10:00:00Z') =>
  `insert into public.items (id, user_id, name, category, updated_at, created_at) values ('${id}', '${uid}', '${name}', 'ustki', '${upd}', '${upd}')
   on conflict (id) do update set name = excluded.name, updated_at = excluded.updated_at`;

describe('Libosim migratsiyasi', () => {
  it('bucket yopiq holda yaratilgan', async () => {
    const r = await pg.query<{ public: boolean }>(`select public from storage.buckets where id = 'wardrobe'`);
    expect(r.rows[0].public).toBe(false);
  });
  it('foydalanuvchi faqat o‘z kiyimlarini ko‘radi va o‘zgartiradi', async () => {
    const i1 = 'aaaaaaaa-0000-4000-8000-000000000001';
    await as(A, () => pg.exec(item(i1, A, 'A sviteri')));
    expect((await as(A, () => pg.query(`select * from public.items`))).rows.length).toBe(1);
    expect((await as(B, () => pg.query(`select * from public.items`))).rows.length).toBe(0);
    await as(B, () => pg.exec(`update public.items set name='buzildi' where id='${i1}'`));
    await expect(as(B, () => pg.exec(item('aaaaaaaa-0000-4000-8000-000000000002', A, 'soxta')))).rejects.toThrow(/row-level security/);
    expect((await as(A, () => pg.query<{ name: string }>(`select name from public.items`))).rows[0].name).toBe('A sviteri');
  });
  it('LWW: eski versiya yangisini bosib keta olmaydi', async () => {
    const i1 = 'aaaaaaaa-0000-4000-8000-000000000001';
    await as(A, () => pg.exec(item(i1, A, 'yangi', '2026-11-15T12:00:00Z')));
    await as(A, () => pg.exec(item(i1, A, 'eski', '2026-11-15T11:00:00Z')));
    expect((await as(A, () => pg.query<{ name: string }>(`select name from public.items where id='${i1}'`))).rows[0].name).toBe('yangi');
  });
  it('rasm ombori: faqat o‘z papkasi', async () => {
    await as(A, () => pg.exec(`insert into storage.objects (bucket_id, name) values ('wardrobe', '${A}/r1.webp')`));
    await expect(as(A, () => pg.exec(`insert into storage.objects (bucket_id, name) values ('wardrobe', '${B}/r2.webp')`))).rejects.toThrow(/row-level security/);
    expect((await as(B, () => pg.query(`select * from storage.objects`))).rows.length).toBe(0);
    expect((await as(A, () => pg.query(`select * from storage.objects`))).rows.length).toBe(1);
  });
  it('kuniga bitta “kiydim” yozuvi; cheklovlar', async () => {
    await as(A, () => pg.exec(`insert into public.wear_logs (id, user_id, date) values (gen_random_uuid(), '${A}', '2026-11-15')`));
    await expect(as(A, () => pg.exec(`insert into public.wear_logs (id, user_id, date) values (gen_random_uuid(), '${A}', '2026-11-15')`))).rejects.toThrow(/unique|duplicate/);
    await expect(as(A, () => pg.exec(`insert into public.items (id, user_id, name, category) values (gen_random_uuid(), '${A}', 'x', 'nomalum')`))).rejects.toThrow(/check/);
  });
  it('anon hech narsa ko‘rmaydi; hisobni faqat o‘zi o‘chiradi', async () => {
    await expect(as(null, () => pg.query(`select * from public.items`))).rejects.toThrow(/permission denied/);
    await expect(as(null, () => pg.exec(`select public.delete_my_account()`))).rejects.toThrow();
    await as(A, () => pg.exec(`select public.delete_my_account()`));
    const r = await pg.query<{ u: number; i: number; b: number }>(`select (select count(*) from auth.users where id='${A}')::int u, (select count(*) from public.items where user_id='${A}')::int i, (select count(*) from auth.users where id='${B}')::int b`);
    expect(r.rows[0]).toEqual({ u: 0, i: 0, b: 1 });
  });
});
