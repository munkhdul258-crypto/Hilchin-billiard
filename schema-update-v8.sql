-- Hilchin Billiard: schema-update-v8.sql
-- QR захиалгын хуудсан дээр харилцагч өөрийн ширээний тооцоог (цаг + бараа)
-- бодит цагаар харах боломжтой болгоно. Ингэснээр "би захиалаагүй" гэх
-- маргаан үүсэхгүй — харилцагч өөрийн утсан дээр л тооцоо шинэчлэгдэхийг харна.
--
-- Юу нэмэгдэж байна:
--   1. sessions хүснэгтийн ИДЭВХТЭЙ (status = 'active') мөрүүдийг хэн ч (нэвтрээгүй ч)
--      уншиж болно — зөвхөн одоо тоглож буй ширээний цаг/дүн харагдана, дууссан
--      тоглолтын түүх харагдахгүй.
--   2. session_items хүснэгтийн идэвхтэй session-д хамаарах мөрүүдийг хэн ч уншиж болно
--      — ширээн дээр нэмэгдсэн бараа бүрийг харилцагч өөрөө нэхэн шалгах боломжтой.
--   3. customer_orders хүснэгтийг хэн ч уншиж болно (аль хэдийн insert нь public байсан) —
--      ингэснээр харилцагч өөрийн өгсөн захиалгын төлөв (хүлээгдэж буй/баталгаажсан/
--      татгалзсан) шууд харагдана.
--
-- Энэ update-ийг Supabase SQL Editor-т бүхэлд нь paste хийж Run дарна уу.
-- Дахин ажиллуулахад алдаа гарахгүй (create or replace / drop-if-exists хэлбэртэй).

drop policy if exists "sessions_select_public_active" on public.sessions;
create policy "sessions_select_public_active"
  on public.sessions for select
  using (status = 'active');

drop policy if exists "session_items_select_public_active" on public.session_items;
create policy "session_items_select_public_active"
  on public.session_items for select
  using (
    exists (
      select 1 from public.sessions s
      where s.id = session_items.session_id
        and s.status = 'active'
    )
  );

drop policy if exists "customer_orders_select_public" on public.customer_orders;
create policy "customer_orders_select_public"
  on public.customer_orders for select
  using (true);
