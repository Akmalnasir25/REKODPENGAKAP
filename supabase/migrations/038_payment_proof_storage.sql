-- ============================================================
-- MIGRATION 038: Storan bukti bayaran
-- ============================================================
-- Rujuk docs/rancangan-payment-online.md §5.2.
--
-- KENAPA BUKAN R2
--   Skrin bayaran asalnya memuat naik melalui r2-presigned-upload. Fungsi itu
--   tidak pernah di-deploy ke projek ini, dan tiada satu pun kredensial R2
--   ditetapkan — jadi preflight mendapat 404 dan pelayar melaporkannya sebagai
--   ralat CORS. Modul kursus tidak pernah menyedarinya kerana ia mempunyai
--   fallback senyap ke Supabase Storage; laluan yang benar-benar berfungsi
--   dalam projek ini sentiasa Supabase Storage.
--
-- KENAPA BALDI PERSENDIRIAN
--   Bukti bayaran ialah slip bank: nama, nombor akaun, baki kadangkala. Ia
--   tidak boleh berada pada URL awam yang boleh diteka. Admin membacanya
--   melalui URL bertandatangan yang luput.
--
-- BENTUK LALUAN OBJEK
--   <payment_id>/<nama-fail>
--   Segmen pertama ialah kunci kepada keseluruhan kebenaran di bawah.
--
-- KENAPA POLISI INI CUKUP RINGKAS
--   Ia tidak mengulang semula logik skop. `payments` sudah mempunyai RLS yang
--   betul (migrasi 028): sekolah nampak bayaran sendiri, admin nampak skop
--   mereka. PostgreSQL mengenakan RLS secara rekursif pada jadual yang
--   dirujuk dalam ungkapan polisi, jadi `exists (select 1 from payments ...)`
--   di sini mewarisi skop itu tepat-tepat. Menulis semula syarat daerah/negeri
--   di sini hanya mencipta salinan kedua yang boleh menyimpang.
-- ============================================================


-- ============================================================
-- 1. Baldi
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  false,
  10485760,                      -- 10MB, sama dengan had lama r2-presigned-upload
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do update set
  public             = false,    -- jangan sekali-kali terbuka secara awam
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;


-- ============================================================
-- 2. Polisi
-- ============================================================

drop policy if exists "payment_proof_insert" on storage.objects;
create policy "payment_proof_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and exists (
      select 1 from public.payments p
      where p.id::text = split_part(storage.objects.name, '/', 1)
    )
  );

drop policy if exists "payment_proof_select" on storage.objects;
create policy "payment_proof_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and exists (
      select 1 from public.payments p
      where p.id::text = split_part(storage.objects.name, '/', 1)
    )
  );

-- Tiada polisi update atau delete dengan sengaja. Bukti bayaran ialah rekod
-- kewangan: sekali dimuat naik, sekolah tidak boleh menggantikannya selepas
-- admin mula menyemak. Pembersihan, jika perlu, dibuat dengan service_role.


comment on policy "payment_proof_select" on storage.objects is
  'Skop diwarisi dari RLS payments — sekolah nampak bukti sendiri, admin '
  'nampak yang dalam daerah/negeri mereka. Jangan tulis semula syarat skop '
  'di sini; satu sumber kebenaran sahaja.';
