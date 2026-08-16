-- 054 — lindungi payment_status daripada dipadam
--
-- Rujuk docs/rancangan-baiki-laluan-hantar.md §2 (K1) dan S1.
--
-- KENAPA PENCETUS DAN BUKAN SEKADAR PEMBAIKAN KOD
--   create-payment-bill baris 415 menulis payment_status = 'not_required'
--   melalui upsert. Bila sekolah yang SUDAH membayar dibuka semula dan
--   menghantar semula, jumlah dikira boleh jatuh ke RM0 — dan tulisan itu
--   memadam 'paid'. Pengesahan kemudian mustahil: pintu membaca cache yang
--   sudah rosak, bukan wang yang memang ada.
--
--   Kes sebenar: SMK TAMBUN · Maju · 2026 · Siri 2. RM510 dibayar bagi 6
--   peserta. Selepas ditolak admin, seorang Pemimpin (yuran NULL) ditambah.
--   Baki bukan sifar tetapi jumlah RM0, jadi laluan RM0 dimasuki dan rekod
--   bayaran dipadam.
--
--   Laluan itu sudah dibaiki. Pencetus ini menutup yang BELUM diketahui:
--   satu laluan baharu yang terlepas boleh memadam rekod wang sekali lagi,
--   tanpa sebarang ralat dan tanpa sesiapa perasan sehingga admin cuba
--   mengesahkan.
--
-- KENAPA MEMULIHKAN DAN BUKAN MEMBUANG RALAT
--   Membuang ralat akan menggagalkan penghantaran guru sepenuhnya kerana
--   pepijat yang bukan salah mereka. Nilai lama dikekalkan dan amaran ditulis
--   ke log Postgres — kerja guru diteruskan, dan kita masih nampak kejadiannya.
--
-- KENAPA NAMA PENCETUS TIADA AWALAN trg_
--   Pencetus baris menembak mengikut susunan ABJAD. Ia mesti berjalan sebelum
--   trg_enforce_payment_before_approval, kerana satu pernyataan boleh menetapkan
--   status = 'approved' dan payment_status = 'not_required' serentak; pintu itu
--   perlu melihat nilai yang sudah dipulihkan. 'lindung_' mendahului 'trg_'.

create or replace function public.lindung_status_bayaran()
returns trigger
language plpgsql
as $$
begin
  if old.payment_status in ('paid', 'pending_review')
     and new.payment_status = 'not_required' then

    raise warning
      'payment_status % -> not_required disekat (school_id=%, badge_id=%, year=%, siri=%). Nilai lama dikekalkan.',
      old.payment_status, new.school_id, new.badge_id, new.year, new.siri;

    new.payment_status := old.payment_status;
  end if;

  return new;
end;
$$;

comment on function public.lindung_status_bayaran() is
  'Menghalang payment_status jatuh dari paid/pending_review ke not_required. '
  'Nilai lama dikekalkan dan amaran ditulis ke log; penghantaran guru tidak '
  'digagalkan. Lihat docs/rancangan-baiki-laluan-hantar.md K1.';

drop trigger if exists lindung_status_bayaran on public.school_badge_status;

create trigger lindung_status_bayaran
  before update on public.school_badge_status
  for each row execute function public.lindung_status_bayaran();
