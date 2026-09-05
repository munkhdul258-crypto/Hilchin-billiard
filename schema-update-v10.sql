-- Hilchin Billiard: schema-update-v10.sql
-- Барааны нөөц (products) хүснэгтийн эрхийг чангатгах:
--   - Уншихад (select) хэвээрээ бүгд (нэвтрээгүй ч) - QR цэс ажиллахын тулд.
--   - Шинэ бараа нэмэх / засах / устгах (insert/update/delete) - ЗӨВХӨН admin.
--     Ажилтан шууд products хүснэгтэд бичих боломжгүй болно; ажилтны
--     "бараа нэмэх" хүсэлт өмнөх шигээ stock_requests-рүү орж, admin
--     батлахад л (эсвэл admin өөрөө шууд нэмэхэд л) бодит нөөцөд орно.
--
-- Энэ update-ийг Supabase SQL Editor-т бүхэлд нь paste хийж Run дарна уу.
-- Дахин ажиллуулахад ч аюулгүй. Одоо байгаа мэдээллийг устгахгүй,
-- зөвхөн эрх (policy) өөрчилнө.

drop policy if exists "products_all_authenticated" on public.products;

drop policy if exists "products_insert_admin" on public.products;
create policy "products_insert_admin" on public.products
  for insert with check (public.is_admin());

drop policy if exists "products_update_admin" on public.products;
create policy "products_update_admin" on public.products
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "products_delete_admin" on public.products;
create policy "products_delete_admin" on public.products
  for delete using (public.is_admin());

-- Уншихад зориулсан policy-г хөндөхгүй (products_select_public,
-- schema-update-v7.sql-с ирсэн) — QR цэс болон бусад бүх хуудас
-- өмнөх шигээ бараа харна.
