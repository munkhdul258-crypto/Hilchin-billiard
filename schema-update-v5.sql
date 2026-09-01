-- =========================================================
-- Hilchin Billiard — v5 нэмэлт migration
-- ЭНЭ SQL-ийг Supabase Dashboard → SQL Editor-т буулгаад Run дарна.
-- Ээлж солигдох цагийг (10:00 гэж хатуу тогтоосныг) admin өөрөө
-- өөрчлөх боломжтой болгох "settings" хүснэгт нэмнэ.
-- Дахин ажиллуулахад ч аюулгүй (idempotent).
-- =========================================================

create table if not exists public.settings (
  key text primary key,
  value text not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

insert into public.settings (key, value)
values ('shift_start_hour', '10')
on conflict (key) do nothing;

alter table public.settings enable row level security;

drop policy if exists "settings_select_authenticated" on public.settings;
create policy "settings_select_authenticated" on public.settings
  for select using (auth.role() = 'authenticated');

drop policy if exists "settings_upsert_admin" on public.settings;
create policy "settings_upsert_admin" on public.settings
  for insert with check (public.is_admin());

drop policy if exists "settings_update_admin" on public.settings;
create policy "settings_update_admin" on public.settings
  for update using (public.is_admin());

do $$
begin
  alter publication supabase_realtime add table public.settings;
exception when others then
  raise notice 'settings realtime skip: %', sqlerrm;
end $$;
