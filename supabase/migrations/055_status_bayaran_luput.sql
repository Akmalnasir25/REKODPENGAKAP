-- 055 — payment_status 'expired' bagi bil yang mati tanpa bayaran
--
-- Rujuk docs/rancangan-baiki-laluan-hantar.md §6 (K5) dan keputusan S5.
--
-- MASALAH
--   Bil hidup 30 minit (TEMPOH_BIL_MINIT). Bila ia luput atau dibatalkan,
--   reconcile-payments menandakan bil dan baris payments, tetapi
--   school_badge_status.payment_status kekal 'pending' selama-lamanya.
--
--   Pada skrin, sekolah kelihatan sedang membayar sedangkan tiada bil hidup,
--   dan tiada apa memberitahu guru bahawa mereka perlu mula semula.
--
--   Kes sebenar: SK SUNGAI ROKAM · Keris Emas + Keris Perak · 2026 Siri 2.
--   Dua bil RM3403 dijana pada 06:29 dan 06:31, luput 07:01 tanpa sebarang
--   bayaran dan tanpa bukti. Kedua-dua program kekal 'pending'.
--
-- KENAPA 'expired' DAN BUKAN 'not_required'
--   Bil yang luput tidak memadamkan hutang. 'not_required' akan berbohong
--   pada arah yang bertentangan — ia mengatakan tiada bayaran diperlukan,
--   sedangkan yuran masih terhutang. 'expired' jujur pada kedua-dua pihak:
--   hutang masih ada, tetapi tiada bil aktif untuk dibayar.
--
-- KENAPA BUKAN SEKADAR MEMBIARKANNYA 'pending'
--   'pending' bermakna "bayaran sedang berjalan". Selepas bil mati, itu tidak
--   lagi benar, dan admin yang melihat senarai tidak dapat membezakan sekolah
--   yang sedang membayar daripada sekolah yang berhenti seminggu lalu.


-- ============================================================
-- 1. Nilai baharu pada CHECK constraint
-- ============================================================
-- Digugurkan mengikut DEFINISI, bukan nama. Nama constraint berbeza antara
-- pangkalan data bergantung pada bagaimana ia dicipta; definisinya tidak.
-- Corak yang sama dipakai dalam migrasi 050.

do $$
declare
  v_nama text;
begin
  for v_nama in
    select con.conname
      from pg_constraint con
     where con.conrelid = 'public.school_badge_status'::regclass
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) like '%not_required%'
  loop
    execute format('alter table public.school_badge_status drop constraint %I', v_nama);
  end loop;
end $$;

alter table public.school_badge_status
  add constraint school_badge_status_payment_status_check
  check (payment_status in
    ('not_required', 'pending', 'pending_review', 'paid', 'rejected', 'expired'));


-- ============================================================
-- 2. Pencetus perlindungan turut menyekat paid -> expired
-- ============================================================
-- Migrasi 054 menyekat paid -> not_required. 'expired' ialah cara kedua untuk
-- memadam rekod wang yang sama, dan ia baru sahaja wujud — jadi ia mesti
-- disekat pada saat yang sama ia diperkenalkan, bukan selepas ia berlaku.

create or replace function public.lindung_status_bayaran()
returns trigger
language plpgsql
as $$
begin
  if old.payment_status in ('paid', 'pending_review')
     and new.payment_status in ('not_required', 'expired') then

    raise warning
      'payment_status % -> % disekat (school_id=%, badge_id=%, year=%, siri=%). Nilai lama dikekalkan.',
      old.payment_status, new.payment_status,
      new.school_id, new.badge_id, new.year, new.siri;

    new.payment_status := old.payment_status;
  end if;

  return new;
end;
$$;

comment on function public.lindung_status_bayaran() is
  'Menghalang payment_status jatuh dari paid/pending_review ke not_required '
  'atau expired. Nilai lama dikekalkan dan amaran ditulis ke log; '
  'penghantaran guru tidak digagalkan. Lihat K1 dan K5.';


-- ============================================================
-- 3. tandai_bayaran_luput — tanda baris yang bilnya sudah mati
-- ============================================================
-- Idempoten: menjalankannya dua kali tidak mengubah apa-apa kali kedua.
--
-- "Hidup" bermakna salah satu daripada:
--   - pending dan expires_at BELUM berlalu   (guru masih boleh membayar)
--   - pending_review                          (bukti sedang disemak)
--   - paid                                    (selesai)
--
-- SEMAKAN DIBUAT PER BADGE, BUKAN PER BIL
--   payment_bills berkunci pada sekolah x tahun x SIRI sahaja — tiada badge.
--   Satu bil meliputi setiap program dalam siri itu, dan baris payments-nya
--   yang memegang badge_id.
--
--   Menyemak pada aras bil bermakna satu bil yang DIBAYAR untuk program lain
--   menjadikan setiap program dalam siri itu kelihatan hidup. SK JELAPANG
--   mempunyai empat bil bagi Siri 2, satu daripadanya dibayar — tetapi Keris
--   Perak tidak pernah termasuk dalam bil yang dibayar itu, dan kekal
--   tergantung.
--
-- Baris hanya ditanda jika SEKURANG-KURANGNYA SATU baris payments pernah
-- wujud bagi badge itu. 'pending' tanpa sebarang bil langsung ialah keadaan
-- yang berbeza dan tidak difahami — ia diserahkan kepada pemeriksaan manual,
-- bukan ditanda berdasarkan tekaan.

create or replace function public.tandai_bayaran_luput()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  update public.school_badge_status sbs
     set payment_status = 'expired'
   where sbs.payment_status = 'pending'
     and exists (
       select 1 from public.payments p
        where p.school_id = sbs.school_id
          and p.badge_id  = sbs.badge_id
          and p.year      = sbs.year
          and p.siri      = sbs.siri
     )
     and not exists (
       select 1
         from public.payments p
         left join public.payment_bills pb on pb.id = p.bill_id
        where p.school_id = sbs.school_id
          and p.badge_id  = sbs.badge_id
          and p.year      = sbs.year
          and p.siri      = sbs.siri
          and (
            p.status in ('pending_review', 'paid')
            or (p.status = 'pending' and coalesce(pb.expires_at, p.expires_at) > now())
          )
     );

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function public.tandai_bayaran_luput() is
  'Menanda payment_status = expired bagi pendaftaran yang setiap bilnya sudah '
  'mati (luput, dibatalkan, ditolak). Idempoten. Dipanggil oleh '
  'reconcile-payments selepas ia membatalkan bil luput.';

revoke execute on function public.tandai_bayaran_luput() from public, anon;
grant execute on function public.tandai_bayaran_luput() to authenticated, service_role;
