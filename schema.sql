-- =========================================================
-- Hilchin Billiard — Борлуулалтын удирдлагын систем (v2)
-- Supabase SQL migration — БҮГДИЙГ ганц удаа SQL Editor-т
-- буулгаж Run дарна. Дахин ажиллуулахад ч аюулгүй (idempotent).
-- =========================================================

-- ---------------------------------------------------------
-- 1) Ажилтны профайл
-- ---------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- 2) Билльярдны ширээнүүд
-- ---------------------------------------------------------
create table if not exists public.billiard_tables (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  hourly_rate numeric(12,2) not null default 0,
  status text not null default 'available' check (status in ('available', 'occupied')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- 3) Тоглолтын session (ширээ тус бүрийн цаг тооцоолол)
--    planned_hours: эхлэхдээ "хэдэн цаг захиалсан" гэдгийг гараар
--    оруулсан утга (заавал биш, зөвхөн харагдацад зориулсан)
-- ---------------------------------------------------------
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.billiard_tables(id) on delete cascade,
  staff_id uuid references public.profiles(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  planned_hours numeric(6,2),
  hourly_rate numeric(12,2) not null,
  time_amount numeric(12,2),
  items_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2),
  status text not null default 'active' check (status in ('active', 'completed')),
  created_at timestamptz not null default now()
);

create index if not exists sessions_table_id_idx on public.sessions(table_id);
create index if not exists sessions_status_idx on public.sessions(status);
create index if not exists sessions_ended_at_idx on public.sessions(ended_at);

-- ---------------------------------------------------------
-- 4) Барааны каталог (нөөц)
-- ---------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text,
  unit text not null default 'ширхэг',
  quantity numeric(12,2) not null default 0,
  unit_price numeric(12,2) not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- 5) Ширээн дээр зарагдсан бараа (session-ий нэхэмжлэлд нэмэгдэнэ)
-- ---------------------------------------------------------
create table if not exists public.session_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  product_id uuid references public.products(id),
  product_name text not null,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists session_items_session_id_idx on public.session_items(session_id);

-- ---------------------------------------------------------
-- 6) Бараа нөөцөд нэмэх хүсэлт (ажилтан бөглөнө, admin батална)
-- ---------------------------------------------------------
create table if not exists public.stock_requests (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  category text,
  unit text not null default 'ширхэг',
  quantity numeric(12,2) not null,
  unit_price numeric(12,2) not null default 0,
  receipt_url text,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_by uuid references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  admin_note text,
  created_at timestamptz not null default now()
);

create index if not exists stock_requests_status_idx on public.stock_requests(status);

-- ---------------------------------------------------------
-- 7) Зээлийн бүртгэл
-- ---------------------------------------------------------
create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  phone text,
  amount numeric(12,2) not null,
  due_date date,
  note text,
  status text not null default 'unpaid' check (status in ('unpaid', 'paid')),
  created_by uuid references public.profiles(id),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists debts_status_idx on public.debts(status);
create index if not exists debts_due_date_idx on public.debts(due_date);

-- ---------------------------------------------------------
-- 8) Зарлага (гараар оруулах зардал)
-- ---------------------------------------------------------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount numeric(12,2) not null,
  category text,
  created_by uuid references public.profiles(id),
  spent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists expenses_spent_at_idx on public.expenses(spent_at);

-- =========================================================
-- Шинэ хэрэглэгч бүртгэгдэхэд автоматаар profile мөр үүсгэх
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
alter table public.products enable row level security;
alter table public.session_items enable row level security;
alter table public.stock_requests enable row level security;
alter table public.debts enable row level security;
alter table public.expenses enable row level security;

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

-- profiles
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated" on public.profiles for select using (auth.role() = 'authenticated');
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles for update using (public.is_admin());

-- billiard_tables
drop policy if exists "tables_select_authenticated" on public.billiard_tables;
create policy "tables_select_authenticated" on public.billiard_tables for select using (auth.role() = 'authenticated');
drop policy if exists "tables_update_authenticated" on public.billiard_tables;
create policy "tables_update_authenticated" on public.billiard_tables for update using (auth.role() = 'authenticated');
drop policy if exists "tables_insert_admin" on public.billiard_tables;
create policy "tables_insert_admin" on public.billiard_tables for insert with check (public.is_admin());
drop policy if exists "tables_delete_admin" on public.billiard_tables;
create policy "tables_delete_admin" on public.billiard_tables for delete using (public.is_admin());

-- sessions
drop policy if exists "sessions_select_authenticated" on public.sessions;
create policy "sessions_select_authenticated" on public.sessions for select using (auth.role() = 'authenticated');
drop policy if exists "sessions_insert_authenticated" on public.sessions;
create policy "sessions_insert_authenticated" on public.sessions for insert with check (auth.role() = 'authenticated');
drop policy if exists "sessions_update_authenticated" on public.sessions;
create policy "sessions_update_authenticated" on public.sessions for update using (auth.role() = 'authenticated');

-- products
drop policy if exists "products_select_authenticated" on public.products;
create policy "products_select_authenticated" on public.products for select using (auth.role() = 'authenticated');
drop policy if exists "products_all_authenticated" on public.products;
create policy "products_all_authenticated" on public.products for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- session_items
drop policy if exists "session_items_select_authenticated" on public.session_items;
create policy "session_items_select_authenticated" on public.session_items for select using (auth.role() = 'authenticated');
drop policy if exists "session_items_insert_authenticated" on public.session_items;
create policy "session_items_insert_authenticated" on public.session_items for insert with check (auth.role() = 'authenticated');
drop policy if exists "session_items_delete_authenticated" on public.session_items;
create policy "session_items_delete_authenticated" on public.session_items for delete using (auth.role() = 'authenticated');

-- stock_requests
drop policy if exists "stock_requests_select_authenticated" on public.stock_requests;
create policy "stock_requests_select_authenticated" on public.stock_requests for select using (auth.role() = 'authenticated');
drop policy if exists "stock_requests_insert_authenticated" on public.stock_requests;
create policy "stock_requests_insert_authenticated" on public.stock_requests for insert with check (auth.role() = 'authenticated');
drop policy if exists "stock_requests_update_admin" on public.stock_requests;
create policy "stock_requests_update_admin" on public.stock_requests for update using (public.is_admin());

-- debts
drop policy if exists "debts_select_authenticated" on public.debts;
create policy "debts_select_authenticated" on public.debts for select using (auth.role() = 'authenticated');
drop policy if exists "debts_all_authenticated" on public.debts;
create policy "debts_all_authenticated" on public.debts for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- expenses
drop policy if exists "expenses_select_authenticated" on public.expenses;
create policy "expenses_select_authenticated" on public.expenses for select using (auth.role() = 'authenticated');
drop policy if exists "expenses_all_authenticated" on public.expenses;
create policy "expenses_all_authenticated" on public.expenses for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- =========================================================
-- Storage: баримт/зургийн сан (stock request receipts)
-- =========================================================
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do nothing;

drop policy if exists "receipts_read_public" on storage.objects;
create policy "receipts_read_public" on storage.objects for select using (bucket_id = 'receipts');

drop policy if exists "receipts_insert_authenticated" on storage.objects;
create policy "receipts_insert_authenticated" on storage.objects for insert
  with check (bucket_id = 'receipts' and auth.role() = 'authenticated');

-- =========================================================
-- Realtime — алдаа гарвал (publication байхгүй гэх мэт) бүх
-- script-ийг зогсоохгүйн тулд DO блокоор хамгаалав
-- =========================================================
do $$
begin
  alter publication supabase_realtime add table public.billiard_tables;
exception when others then
  raise notice 'billiard_tables realtime skip: %', sqlerrm;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.sessions;
exception when others then
  raise notice 'sessions realtime skip: %', sqlerrm;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.stock_requests;
exception when others then
  raise notice 'stock_requests realtime skip: %', sqlerrm;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.debts;
exception when others then
  raise notice 'debts realtime skip: %', sqlerrm;
end $$;

-- =========================================================
-- 8 ширээ (жишээ, дахин ажиллуулахад давхардахгүй)
-- =========================================================
insert into public.billiard_tables (name, hourly_rate)
select name, 15000
from (values ('Ширээ 1'),('Ширээ 2'),('Ширээ 3'),('Ширээ 4'),
             ('Ширээ 5'),('Ширээ 6'),('Ширээ 7'),('Ширээ 8')) as t(name)
where not exists (select 1 from public.billiard_tables);
