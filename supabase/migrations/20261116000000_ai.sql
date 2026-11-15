-- G.S.Style — AI stilist uchun kunlik limit. Qayta ishga tushirsa ham xato bermaydi.
-- Hisob faqat server funksiyasi (Edge Function "ai") orqali o'zgaradi; foydalanuvchi jadvalni o'qiy/yoza olmaydi.

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count int not null default 0,
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;

-- Bitta so'rovni hisobga oladi. Limit tugagan bo'lsa ok=false qaytaradi (hisob oshmaydi).
create or replace function public.ai_take_quota(p_limit int)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  lim int := greatest(1, least(coalesce(p_limit, 10), 200));
  d date := (now() at time zone 'Asia/Tashkent')::date;
  c int;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  insert into public.ai_usage as u (user_id, day, count)
  values (uid, d, 1)
  on conflict (user_id, day) do update set count = u.count + 1
  where u.count < lim
  returning u.count into c;
  if c is null then
    return json_build_object('ok', false, 'used', lim, 'limit', lim);
  end if;
  return json_build_object('ok', true, 'used', c, 'limit', lim);
end;
$$;

-- AI xizmati xato bersa, olingan so'rov qaytariladi.
create or replace function public.ai_refund()
returns void
language sql
security definer
set search_path = public
as $$
  update public.ai_usage set count = greatest(0, count - 1)
  where user_id = auth.uid() and day = (now() at time zone 'Asia/Tashkent')::date;
$$;

revoke all on function public.ai_take_quota(int) from public, anon;
revoke all on function public.ai_refund() from public, anon;
grant execute on function public.ai_take_quota(int) to authenticated;
grant execute on function public.ai_refund() to authenticated;
