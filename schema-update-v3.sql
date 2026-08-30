-- =========================================================
-- Hilchin Billiard — v3 нэмэлт migration
-- ЭНЭ SQL-ийг Supabase Dashboard → SQL Editor-т буулгаад Run дарна.
-- Зөвхөн ШИНЭ хэсгүүд (ээлж хүлээлцэх + admin мэдэгдэл) нэмнэ,
-- өмнөх schema.sql-ийг дахин ажиллуулах шаардлагагүй.
-- Дахин ажиллуулахад ч аюулгүй (idempotent).
-- =========================================================

-- ---------------------------------------------------------
-- 1) Ээлж хүлээлцэх түүх (ажилтан ээлжээ хаахдаа бөглөнө)
-- ---------------------------------------------------------
create table if not exists public.shift_handovers (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references public.profiles(id),
  shift_start timestamptz not null,
  shift_end timestamptz not null default now(),
  revenue numeric(12,2) not null default 0,
  expense numeric(12,2) not null default 0,
  net numeric(12,2) not null default 0,
  stock_snapshot jsonb,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists shift_handovers_created_at_idx on public.shift_handovers(created_at);

alter table public.shift_handovers enable row level security;

drop policy if exists "shift_handovers_select_authenticated" on public.shift_handovers;
create policy "shift_handovers_select_authenticated" on public.shift_handovers
  for select using (auth.role() = 'authenticated');

drop policy if exists "shift_handovers_insert_authenticated" on public.shift_handovers;
create policy "shift_handovers_insert_authenticated" on public.shift_handovers
  for insert with check (auth.role() = 'authenticated');

-- ---------------------------------------------------------
-- 2) Admin-аас ажилтнууд руу илгээх мэдэгдэл
-- ---------------------------------------------------------
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  created_by uuid references public.profiles(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists announcements_active_idx on public.announcements(active);

alter table public.announcements enable row level security;

drop policy if exists "announcements_select_authenticated" on public.announcements;
create policy "announcements_select_authenticated" on public.announcements
  for select using (auth.role() = 'authenticated');

drop policy if exists "announcements_insert_admin" on public.announcements;
create policy "announcements_insert_admin" on public.announcements
  for insert with check (public.is_admin());

drop policy if exists "announcements_update_admin" on public.announcements;
create policy "announcements_update_admin" on public.announcements
  for update using (public.is_admin());

drop policy if exists "announcements_delete_admin" on public.announcements;
create policy "announcements_delete_admin" on public.announcements
  for delete using (public.is_admin());

-- ---------------------------------------------------------
-- Realtime (алдаа гарвал үл тоож үргэлжилнэ)
-- ---------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.shift_handovers;
exception when others then
  raise notice 'shift_handovers realtime skip: %', sqlerrm;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.announcements;
exception when others then
  raise notice 'announcements realtime skip: %', sqlerrm;
end $$;
