-- 022 — tambah badge pada broadcast_sessions
--
-- ============================================================
-- AMARAN: FAIL INI IALAH REKONSTRUKSI, BUKAN SUMBER ASAL
-- ============================================================
-- Migrasi 022 dipakai pada pangkalan data produksi tetapi failnya tidak
-- pernah dikomit ke git — ia tiada dalam mana-mana cabang. Yang tinggal
-- hanyalah barisnya dalam supabase_migrations.schema_migrations, bernama
-- 'add_badge_to_broadcast_sessions'.
--
-- Fail ini dibina semula pada 20 Ogos 2026 daripada KEADAAN SEBENAR
-- pangkalan data, bukan daripada kod asal. Ia menghasilkan skema yang sama,
-- tetapi ia tidak boleh menuntut ia sama perkataan demi perkataan dengan apa
-- yang sebenarnya dijalankan. Kalau fail asal ditemui kemudian, ia yang
-- patut menang.
--
-- Diperhatikan dalam DB pada tarikh itu:
--   broadcast_sessions.badge_id   uuid, FK -> badges(id) ON DELETE SET NULL
--   broadcast_sessions.badge_name text
--   idx_broadcast_sessions_badge_id  btree (badge_id)
--
-- Kedua-dua lajur ialah lajur TERAKHIR jadual (kedudukan 11 dan 12), sepadan
-- dengan lajur yang ditambah selepas penciptaan. Tiada migrasi terkomit lain
-- menyebut badge bersama broadcast_sessions, jadi 022 ialah satu-satunya
-- sumber yang munasabah.
--
-- KENAPA ON DELETE SET NULL
--   Diambil daripada kekangan sebenar, bukan pilihan baharu. Ia bermakna
--   memadam program tidak memadam sesi siaran yang merujuknya; sesi itu
--   kehilangan pautan programnya dan kekal.
--
-- IDEMPOTEN
--   Setiap penyata dilindungi. Menjalankan fail ini pada pangkalan data yang
--   sudah memilikinya tidak melakukan apa-apa — itu disahkan pada produksi
--   ketika fail ini ditulis. Kekangan FK ditulis SEBARIS dengan lajur, dan
--   bukan sebagai `add constraint` berasingan, kerana `add constraint` tiada
--   bentuk `if not exists` dan akan gagal pada larian kedua.
--
-- TIADA `comment on column` DI SINI
--   Kedua-dua lajur TIADA komen dalam pangkalan data. Menambah komen di sini
--   akan menjadikan fail ini melakukan sesuatu yang 022 asal jelas tidak buat,
--   dan menjadikannya bukan lagi larian kosong. Penjelasan tinggal di kepala.

alter table public.broadcast_sessions
  add column if not exists badge_id uuid
    references public.badges(id) on delete set null,
  add column if not exists badge_name text;

create index if not exists idx_broadcast_sessions_badge_id
  on public.broadcast_sessions(badge_id);
