-- Hilchin Billiard: schema-update-v9.sql
-- Кассын нягтлан бодох (ээлжийн зөрүү тооцоолол) — "Ээлж" хуудсанд
-- нягтлан бодогчийн хийдэг маягийн нарийвчилсан тооцоо нэмэгдэнэ:
--   систем дэх орлого (цаг + бараа) vs бодитоор бэлэн/дансаар/POS-оор орсон дүн,
--   тэдгээрийн зөрүү, мөн ажилтанд өгсөн урьдчилгаа / бусад тохиолдлын
--   зохицуулалт (жишээ нь: гэнэтийн хүнд мөнгө өгсөн, POS дээр илүү
--   тоолж буцаасан гэх мэт) — эдгээрийг бүртгэснээр эцсийн ЗӨРҮҮ зөвхөн
--   ЖИНХЭНЭ тайлбарлагдаагүй дутагдал/илүүдлийг харуулна.
--
-- Энэ update-ийг Supabase SQL Editor-т бүхэлд нь paste хийж Run дарна уу.
-- Дахин ажиллуулахад ч аюулгүй.

-- ---------------------------------------------------------
-- 1) Кассын гар хөдөлгөөн (урьдчилгаа / бусад зохицуулалт)
-- ---------------------------------------------------------
create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('out', 'in')),
  category text not null default 'other' check (category in ('advance', 'other')),
  payment_method text not null default 'cash' check (payment_method in ('cash', 'transfer', 'pos')),
  amount numeric(12,2) not null,
  person_name text,
  reason text,
  settled boolean not null default false,
  settled_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists cash_movements_created_at_idx on public.cash_movements(created_at);
create index if not exists cash_movements_category_settled_idx on public.cash_movements(category, settled);

alter table public.cash_movements enable row level security;

drop policy if exists "cash_movements_select_authenticated" on public.cash_movements;
create policy "cash_movements_select_authenticated" on public.cash_movements
  for select using (auth.role() = 'authenticated');

drop policy if exists "cash_movements_insert_authenticated" on public.cash_movements;
create policy "cash_movements_insert_authenticated" on public.cash_movements
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "cash_movements_update_own_or_admin" on public.cash_movements;
create policy "cash_movements_update_own_or_admin" on public.cash_movements
  for update using (auth.uid() = created_by or public.is_admin());

drop policy if exists "cash_movements_delete_own_or_admin" on public.cash_movements;
create policy "cash_movements_delete_own_or_admin" on public.cash_movements
  for delete using (auth.uid() = created_by or public.is_admin());

-- ---------------------------------------------------------
-- 2) Ээлж хүлээлцэх бүртгэлд нягтлан бодох баганууд нэмэх
-- ---------------------------------------------------------
do $$
begin
  if to_regclass('public.shift_handovers') is not null then
    alter table public.shift_handovers add column if not exists opening_cash numeric(12,2) not null default 0;
    alter table public.shift_handovers add column if not exists expected_cash numeric(12,2);
    alter table public.shift_handovers add column if not exists counted_cash numeric(12,2);
    alter table public.shift_handovers add column if not exists cash_diff numeric(12,2);
    alter table public.shift_handovers add column if not exists expected_transfer numeric(12,2);
    alter table public.shift_handovers add column if not exists counted_transfer numeric(12,2);
    alter table public.shift_handovers add column if not exists transfer_diff numeric(12,2);
    alter table public.shift_handovers add column if not exists expected_pos numeric(12,2);
    alter table public.shift_handovers add column if not exists counted_pos numeric(12,2);
    alter table public.shift_handovers add column if not exists pos_diff numeric(12,2);
    alter table public.shift_handovers add column if not exists total_diff numeric(12,2);
    alter table public.shift_handovers add column if not exists cash_movements_snapshot jsonb;
  end if;
end $$;

-- ---------------------------------------------------------
-- Realtime (алдаа гарвал үл тоож үргэлжилнэ)
-- ---------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.cash_movements;
exception when others then
  raise notice 'cash_movements realtime skip: %', sqlerrm;
end $$;

-- ---------------------------------------------------------
-- 3) Аудит триггер (байгаа бол) cash_movements дээр
-- ---------------------------------------------------------
do $$
begin
  if to_regprocedure('public.hb_audit_trigger()') is not null then
    drop trigger if exists audit_cash_movements on public.cash_movements;
    create trigger audit_cash_movements
      after insert or update or delete on public.cash_movements
      for each row execute procedure public.hb_audit_trigger();
  end if;
end $$;
