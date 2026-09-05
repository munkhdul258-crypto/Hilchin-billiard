-- =========================================================
-- Hilchin Billiard — Audit log (хэн юуг өөрчилсөн бүх түүх)
-- Supabase SQL Editor-т нэг удаа Run хийнэ.
--
-- Юу хийдэг вэ:
--   audit_log гэсэн шинэ хүснэгт үүсгээд, дараах хүснэгтүүдэд
--   INSERT/UPDATE/DELETE болгонд автоматаар (trigger-ээр) бичигдэнэ:
--     billiard_tables, sessions, session_items, products,
--     expenses, debts, stock_requests, settings, announcements,
--     shift_handovers
--   Хэн (ямар хэрэглэгч), хэзээ, ямар үйлдэл хийсэн, өмнөх/шинэ
--   утга нь бүгд хадгалагдана. Зөвхөн admin харах эрхтэй.
-- =========================================================

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  operation text not null,
  row_id uuid,
  actor_id uuid,
  actor_name text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_created_at_idx on public.audit_log(created_at desc);
create index if not exists audit_log_table_name_idx on public.audit_log(table_name);

alter table public.audit_log enable row level security;

drop policy if exists "audit_log_select_admin" on public.audit_log;
create policy "audit_log_select_admin" on public.audit_log
  for select using (public.is_admin());

-- Trigger function: аль ч хүснэгтэд ажиллах ерөнхий audit функц.
create or replace function public.hb_audit_trigger() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_actor_name text;
begin
  v_actor := auth.uid();

  select coalesce(full_name, email) into v_actor_name
  from public.profiles
  where id = v_actor;

  insert into public.audit_log(table_name, operation, row_id, actor_id, actor_name, old_data, new_data)
  values (
    TG_TABLE_NAME,
    TG_OP,
    coalesce(new.id, old.id),
    v_actor,
    v_actor_name,
    to_jsonb(old),
    to_jsonb(new)
  );

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Хуучин trigger-үүдийг цэвэрлээд дахин үүсгэнэ (аюулгүй дахин ажиллуулж болно).
-- Хүснэгт байгаа тохиолдолд л trigger нэмнэ — v3/v4/v5-ийг Run хийгээгүй ч
-- энэ script алдаа өгөхгүй, зөвхөн байгаа хүснэгтүүд дээрээ л ажиллана.
do $$
declare
  t text;
begin
  foreach t in array array[
    'billiard_tables', 'sessions', 'session_items', 'products',
    'expenses', 'debts', 'stock_requests', 'settings',
    'announcements', 'shift_handovers'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists trg_audit_%I on public.%I', t, t);
      execute format(
        'create trigger trg_audit_%I after insert or update or delete on public.%I for each row execute function public.hb_audit_trigger()',
        t, t
      );
    end if;
  end loop;
end $$;

-- Realtime-д нэмэх (аль хэдийн нэмэгдсэн бол алдаа өгөхгүйгээр алгасна).
do $$
begin
  alter publication supabase_realtime add table public.audit_log;
exception when others then
  null;
end $$;
