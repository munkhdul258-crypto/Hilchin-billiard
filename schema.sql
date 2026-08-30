-- =========================================================
-- Hilchin Billiard — Борлуулалтын удирдлагын систем
-- Supabase SQL migration
-- Энэ файлыг Supabase Dashboard -> SQL Editor дотор нэг бүрчлэн
-- (эсвэл бүхэлд нь) хуулж ажиллуулна.
-- =========================================================

-- 1) Ажилтны профайл (auth.users -тэй холбогдоно)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  created_at timestamptz not null default now()
);

-- 2) Билльярдны ширээнүүд
create table if not exists public.billiard_tables (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  hourly_rate numeric(12,2) not null default 0,
  status text not null default 'available' check (status in ('available', 'occupied')),
  created_at timestamptz not null default now()
);

-- 3) Тоглолтын session (ширээ тус бүрийн цаг тооцоолол)
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.billiard_tables(id) on delete cascade,
  staff_id uuid references public.profiles(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  hourly_rate numeric(12,2) not null,
  total_amount numeric(12,2),
  status text not null default 'active' check (status in ('active', 'completed')),
  created_at timestamptz not null default now()
);

create index if not exists sessions_table_id_idx on public.sessions(table_id);
create index if not exists sessions_status_idx on public.sessions(status);
create index if not exists sessions_ended_at_idx on public.sessions(ended_at);

-- =========================================================
-- Шинэ хэрэглэгч бүртгэгдэхэд автоматаар profile мөр үүсгэх
-- (Ажилтныг Supabase Dashboard -> Authentication -> Add user
--  цэсээр админ л нэмнэ, нээлттэй бүртгэл байхгүй)
-- =========================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    'staff'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =========================================================
-- Row Level Security
-- =========================================================
alter table public.profiles enable row level security;
alter table public.billiard_tables enable row level security;
alter table public.sessions enable row level security;

-- Админ эсэхийг шалгах туслах функц (recursive RLS-ээс сэргийлнэ)
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- profiles policies
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select
  using (auth.role() = 'authenticated');

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
  on public.profiles for update
  using (public.is_admin());

-- billiard_tables policies
drop policy if exists "tables_select_authenticated" on public.billiard_tables;
create policy "tables_select_authenticated"
  on public.billiard_tables for select
  using (auth.role() = 'authenticated');

drop policy if exists "tables_update_authenticated" on public.billiard_tables;
create policy "tables_update_authenticated"
  on public.billiard_tables for update
  using (auth.role() = 'authenticated');

drop policy if exists "tables_insert_admin" on public.billiard_tables;
create policy "tables_insert_admin"
  on public.billiard_tables for insert
  with check (public.is_admin());

drop policy if exists "tables_delete_admin" on public.billiard_tables;
create policy "tables_delete_admin"
  on public.billiard_tables for delete
  using (public.is_admin());

-- sessions policies
drop policy if exists "sessions_select_authenticated" on public.sessions;
create policy "sessions_select_authenticated"
  on public.sessions for select
  using (auth.role() = 'authenticated');

drop policy if exists "sessions_insert_authenticated" on public.sessions;
create policy "sessions_insert_authenticated"
  on public.sessions for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "sessions_update_authenticated" on public.sessions;
create policy "sessions_update_authenticated"
  on public.sessions for update
  using (auth.role() = 'authenticated');

-- =========================================================
-- Realtime — ширээ болон session-ий өөрчлөлтийг бүх төхөөрөмж
-- дээр шууд харуулахын тулд асаана
-- =========================================================
alter publication supabase_realtime add table public.billiard_tables;
alter publication supabase_realtime add table public.sessions;

-- =========================================================
-- Жишээ ширээнүүд (хүсвэл ажиллуулаарай, эсвэл /staff.html-ээс
-- гараар нэмж болно)
-- =========================================================
insert into public.billiard_tables (name, hourly_rate) values
  ('Ширээ 1', 15000),
  ('Ширээ 2', 15000),
  ('Ширээ 3', 20000)
on conflict do nothing;
