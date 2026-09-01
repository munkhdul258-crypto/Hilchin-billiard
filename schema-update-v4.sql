-- =========================================================
-- Hilchin Billiard — v4 нэмэлт migration
-- ЭНЭ SQL-ийг Supabase Dashboard → SQL Editor-т буулгаад Run дарна.
-- Зөвхөн ШИНЭ багана нэмнэ (sessions.payment_method), өмнөх
-- schema.sql / schema-update-v3.sql-ийг дахин ажиллуулах шаардлагагүй.
-- Дахин ажиллуулахад ч аюулгүй (idempotent).
-- =========================================================

alter table public.sessions
  add column if not exists payment_method text not null default 'cash'
  check (payment_method in ('cash', 'transfer', 'pos'));

comment on column public.sessions.payment_method is
  'cash = бэлэн мөнгө, transfer = дансны шилжүүлэг, pos = POS/карт';
