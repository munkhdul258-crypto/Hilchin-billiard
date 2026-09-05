-- =========================================================
-- Hilchin Billiard — QR цэс/захиалгын систем
-- Supabase SQL Editor-т нэг удаа Run хийнэ.
--
-- Юу нэмдэг вэ:
--   1) Нэвтрээгүй зочин (QR уншсан харилцагч) menu-г харах боломжтой
--      болгохын тулд products, billiard_tables хүснэгтийг олон нийтэд
--      (public/anon) уншиж болохоор нээнэ (зөвхөн унших, засах боломжгүй).
--   2) customer_orders — харилцагчийн өгсөн захиалгыг хадгална.
--      Зөвхөн admin/ажилтан итгэмжлэгдсэн (authenticated) хэрэглэгч
--      батлах/цуцлах эрхтэй.
-- =========================================================

-- Menu харагдахын тулд бүх хүн (нэвтрээгүй ч) products, billiard_tables
-- унших боломжтой болгоно (зөвхөн select, insert/update/delete хэвээрээ хамгаалагдсан хэвээр).
drop policy if exists "products_select_authenticated" on public.products;
drop policy if exists "products_select_public" on public.products;
create policy "products_select_public" on public.products for select using (true);

drop policy if exists "tables_select_authenticated" on public.billiard_tables;
drop policy if exists "tables_select_public" on public.billiard_tables;
create policy "tables_select_public" on public.billiard_tables for select using (true);

-- Харилцагчийн захиалга
create table if not exists public.customer_orders (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.billiard_tables(id) on delete cascade,
  items jsonb not null,
  total_amount numeric(12,2) not null default 0,
  note text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists customer_orders_table_id_idx on public.customer_orders(table_id);
create index if not exists customer_orders_status_idx on public.customer_orders(status);

alter table public.customer_orders enable row level security;

-- Зочин (нэвтрээгүй ч) захиалга илгээж чадна, гэхдээ зөвхөн "pending"
-- төлөвтэйгээр л шинээр үүсгэж болно — өөрөө шууд "confirmed" болгож чадахгүй.
drop policy if exists "customer_orders_insert_public" on public.customer_orders;
create policy "customer_orders_insert_public" on public.customer_orders
  for insert with check (status = 'pending');

-- Захиалгыг зөвхөн нэвтэрсэн ажилтан/admin харах, шийдвэрлэх эрхтэй.
drop policy if exists "customer_orders_select_authenticated" on public.customer_orders;
create policy "customer_orders_select_authenticated" on public.customer_orders
  for select using (auth.role() = 'authenticated');

drop policy if exists "customer_orders_update_authenticated" on public.customer_orders;
create policy "customer_orders_update_authenticated" on public.customer_orders
  for update using (auth.role() = 'authenticated');

-- Realtime-д нэмэх.
do $$
begin
  alter publication supabase_realtime add table public.customer_orders;
exception when others then
  null;
end $$;

-- Хэрэв audit log систем (schema-update-v6.sql) аль хэдийн суусан бол
-- customer_orders хүснэгтэд ч бас trigger нэмнэ.
do $$
begin
  if to_regprocedure('public.hb_audit_trigger()') is not null then
    drop trigger if exists trg_audit_customer_orders on public.customer_orders;
    create trigger trg_audit_customer_orders
      after insert or update or delete on public.customer_orders
      for each row execute function public.hb_audit_trigger();
  end if;
end $$;
