-- =========================================================
-- Hilchin Billiard — тест дата цэвэрлэх скрипт (v2, аюулгүй хувилбар)
-- ЭНЭ SQL-ийг Supabase Dashboard → SQL Editor-т нэг удаа Run хийнэ.
--
-- Энэ хувилбар нь хүснэгт байхгүй бол алдаа өгөхгүй, зүгээр
-- алгасаад явна (жишээ нь shift_handovers / announcements хүснэгтүүд
-- хараахан үүсээгүй байвал ч script бүтэн ажиллана).
--
-- ЦЭВЭРЛЭГДЭХ (байгаа бол л, бүх тест/туршилтын дата устна):
--   sessions, session_items (тоглосон session-үүд)
--   expenses (зарлага)
--   stock_requests (барааны хүсэлт)
--   debts (зээл)
--   shift_handovers (ээлж хүлээлцсэн түүх)
--   announcements (мэдэгдэл)
--   products (барааны каталог — тест бараа, үлдэгдэл)
--
-- ХЭВЭЭР ҮЛДЭХ (устгагдахгүй):
--   profiles (ажилтны нэвтрэх эрх — хэн ч дахин нэвтрэх боломжтой хэвээр)
--   billiard_tables (одоогийн 6 ширээ, нэр/үнэ хэвээр)
--   settings (ээлж солигдох цагийн тохиргоо хэвээр)
-- =========================================================

do $$
begin
  if to_regclass('public.session_items') is not null then
    execute 'delete from public.session_items';
  end if;

  if to_regclass('public.sessions') is not null then
    execute 'delete from public.sessions';
  end if;

  if to_regclass('public.stock_requests') is not null then
    execute 'delete from public.stock_requests';
  end if;

  if to_regclass('public.debts') is not null then
    execute 'delete from public.debts';
  end if;

  if to_regclass('public.expenses') is not null then
    execute 'delete from public.expenses';
  end if;

  if to_regclass('public.shift_handovers') is not null then
    execute 'delete from public.shift_handovers';
  end if;

  if to_regclass('public.announcements') is not null then
    execute 'delete from public.announcements';
  end if;

  if to_regclass('public.products') is not null then
    execute 'delete from public.products';
  end if;

  if to_regclass('public.billiard_tables') is not null then
    execute 'update public.billiard_tables set status = ''available''';
  end if;
end $$;
