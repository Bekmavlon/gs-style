-- =====================================================================
-- Libosim — shaxsiy garderob. Qayta ishga tushirsa ham xato bermaydi.
-- Har jadval: user_id egasi, RLS, LWW trigger (updated_at), server_updated_at kursori.
-- Rasmlar: private "wardrobe" bucket, yo'l = <user_id>/<rasm>.webp
-- =====================================================================

create or replace function public.lb_before_write()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.updated_at < old.updated_at then
      return null; -- eski versiya: e'tiborsiz
    end if;
    new.created_at := old.created_at;
    new.user_id := old.user_id;
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end; $$;

create or replace function public.lb_attach(tbl regclass)
returns void language plpgsql as $$
begin
  execute format('drop trigger if exists lb_before_write on %s', tbl);
  execute format('create trigger lb_before_write before insert or update on %s for each row execute function public.lb_before_write()', tbl);
  execute format('alter table %s enable row level security', tbl);
  execute format('alter table %s force row level security', tbl);
  execute format('drop policy if exists own_select on %s', tbl);
  execute format('drop policy if exists own_insert on %s', tbl);
  execute format('drop policy if exists own_update on %s', tbl);
  execute format('drop policy if exists own_delete on %s', tbl);
  execute format('create policy own_select on %s for select to authenticated using (user_id = (select auth.uid()))', tbl);
  execute format('create policy own_insert on %s for insert to authenticated with check (user_id = (select auth.uid()))', tbl);
  execute format('create policy own_update on %s for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', tbl);
  execute format('create policy own_delete on %s for delete to authenticated using (user_id = (select auth.uid()))', tbl);
  execute format('create index if not exists %s on %s (user_id, server_updated_at)', replace(tbl::text, 'public.', '') || '_sync_idx', tbl);
end; $$;

create table if not exists public.user_settings (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  display_name text not null default '' check (char_length(display_name) <= 80),
  gender text check (gender in ('erkak', 'ayol')),
  height_cm numeric check (height_cm between 50 and 250),
  weight_kg numeric check (weight_kg between 20 and 300),
  age int check (age between 5 and 120),
  city_id text not null default 'toshkent' check (char_length(city_id) <= 40),
  theme text not null default 'light' check (theme in ('light', 'dark', 'system')),
  timezone text not null default 'Asia/Tashkent',
  forgotten_days int not null default 30 check (forgotten_days between 7 and 365),
  morning_reminder boolean not null default false,
  morning_time text not null default '07:30',
  remove_bg boolean not null default true,
  unique (user_id)
);

create table if not exists public.items (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 80),
  category text not null check (category in ('ustki', 'pastki', 'libos', 'tashqi', 'oyoq', 'aksessuar', 'boshqa')),
  subtype text not null default '' check (char_length(subtype) <= 40),
  colors jsonb not null default '[]',
  seasons jsonb not null default '[]',
  occasions jsonb not null default '[]',
  warmth smallint not null default 2 check (warmth between 1 and 3),
  brand text not null default '' check (char_length(brand) <= 60),
  size text not null default '' check (char_length(size) <= 20),
  price numeric check (price >= 0 and price < 1e12),
  purchased_on date,
  notes text not null default '' check (char_length(notes) <= 1000),
  favorite boolean not null default false,
  archived boolean not null default false,
  image_id uuid,
  image_ext text check (image_ext in ('webp', 'png', 'jpg')),
  bg_removed boolean not null default false
);

create table if not exists public.outfits (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 80),
  item_ids jsonb not null default '[]',
  occasion text not null default 'kundalik' check (occasion in ('kundalik', 'ish', 'sport', 'bayram', 'sayohat', 'uchrashuv')),
  seasons jsonb not null default '[]',
  favorite boolean not null default false,
  notes text not null default '' check (char_length(notes) <= 1000),
  check (jsonb_array_length(item_ids) <= 10)
);

create table if not exists public.wear_logs (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  date date not null,
  item_ids jsonb not null default '[]',
  outfit_id uuid,
  note text not null default '' check (char_length(note) <= 500),
  unique (user_id, date)
);

select public.lb_attach('public.user_settings');
select public.lb_attach('public.items');
select public.lb_attach('public.outfits');
select public.lb_attach('public.wear_logs');

revoke all on public.user_settings, public.items, public.outfits, public.wear_logs from anon;
grant select, insert, update, delete on public.user_settings, public.items, public.outfits, public.wear_logs to authenticated;

-- ---------- Rasmlar ombori (private) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wardrobe', 'wardrobe', false, 5242880, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists wardrobe_select on storage.objects;
drop policy if exists wardrobe_insert on storage.objects;
drop policy if exists wardrobe_update on storage.objects;
drop policy if exists wardrobe_delete on storage.objects;
create policy wardrobe_select on storage.objects for select to authenticated
  using (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy wardrobe_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy wardrobe_update on storage.objects for update to authenticated
  using (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy wardrobe_delete on storage.objects for delete to authenticated
  using (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------- Hisobni ilova ichidan o'chirish ----------
-- Rasmlar avval ilova tomonidan Storage API orqali o'chiriladi, so'ng shu funksiya chaqiriladi.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Avtorizatsiya talab qilinadi'; end if;
  delete from auth.users where id = uid;
end; $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
