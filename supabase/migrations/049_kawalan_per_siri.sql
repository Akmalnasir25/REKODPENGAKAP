-- ============================================================
-- MIGRATION 049: payment_online_required & submission_open per siri
-- ============================================================
-- Rujuk docs/rancangan-payment-online.md §15.
--
-- MASALAH
--   Kedua-dua togol hidup pada program_settings, satu baris per
--   program x skop x tahun. Hidupkan bayaran untuk Keris Emas 2026 dan
--   SETIAP siri 2026 mewajibkan bayaran. Tiada cara menyatakan
--   "Siri 2 berbayar, Siri 3 percuma".
--
--   Kesannya bukan kosmetik: enforce_payment_before_approval menolak
--   peralihan ke 'submitted' selagi payment_status <> 'paid', dan bagi siri
--   yang tidak sepatutnya dicaj tiada bil akan pernah wujud untuk
--   menjadikannya 'paid'. Guru tersekat tanpa jalan keluar — corak yang sama
--   seperti §13.12 dan §13.14.
--
--   Kadar yuran TIDAK berkongsi masalah ini. program_fee_overrides.siri
--   sudah wujud sejak migrasi 031, jadi "berapa" sudah per siri. Hanya
--   "sama ada" yang tidak.
--
-- KENAPA NULL, BUKAN BACKFILL
--   Keris Emas 2026 Siri 2 dan Keris Perak 2026 Siri 2 sedang berjalan
--   dengan bayaran hidup pada harga yang telah diumumkan. Migrasi ini tidak
--   menulis satu pun nilai bukan-NULL, jadi ia TIDAK BOLEH mengubah
--   tingkah laku mana-mana program sedia ada.
--
--   Backfill yang menyalin nilai induk ke setiap siri ditolak: ia
--   berkelakuan sama pada hari pertama tetapi mencipta salinan yang
--   menyimpang daripada induknya secara senyap.
-- ============================================================


-- ============================================================
-- 1. Lajur per siri — NULL bermakna warisi
-- ============================================================

alter table public.program_siri_settings
  add column if not exists payment_online_required boolean,
  add column if not exists submission_open boolean;

comment on column public.program_siri_settings.payment_online_required is
  'NULL = warisi program_settings. Nilai eksplisit mengatasi induk dan '
  'BERHENTI mewarisi: mematikan togol aras program selepas itu tidak lagi '
  'merambat ke siri ini. Lihat §15 K15.7.';

comment on column public.program_siri_settings.submission_open is
  'NULL = warisi program_settings. Semantik sama seperti '
  'payment_online_required di atas.';


-- ============================================================
-- 2. Penyelesai — satu sumber kebenaran bagi empat pemanggil
-- ============================================================
-- Baris siri mungkin tidak wujud langsung. LEFT JOIN, bukan JOIN: program
-- yang tidak pernah mempunyai tetapan per siri mesti tetap memulangkan
-- nilai induknya, bukan NULL.

create or replace function public.siri_payment_required(
  p_program_setting_id uuid,
  p_siri smallint default 1
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(pss.payment_online_required, ps.payment_online_required, false)
  from public.program_settings ps
  left join public.program_siri_settings pss
    on pss.program_setting_id = ps.id and pss.siri = p_siri
  where ps.id = p_program_setting_id;
$$;

create or replace function public.siri_submission_open(
  p_program_setting_id uuid,
  p_siri smallint default 1
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(pss.submission_open, ps.submission_open, true)
  from public.program_settings ps
  left join public.program_siri_settings pss
    on pss.program_setting_id = ps.id and pss.siri = p_siri
  where ps.id = p_program_setting_id;
$$;

grant execute on function public.siri_payment_required(uuid, smallint) to authenticated;
grant execute on function public.siri_submission_open(uuid, smallint) to authenticated;

comment on function public.siri_payment_required(uuid, smallint) is
  'Sama ada siri ini mewajibkan bayaran. Siri mengatasi program; program '
  'mengatasi lalai palsu. Digunakan oleh pencetus, Edge Function dan UI '
  'supaya ketiga-tiganya tidak boleh berselisih.';


-- ============================================================
-- 3. enforce_payment_before_approval — kini sedar siri
-- ============================================================
-- Badan sama seperti migrasi 039 (termasuk pengendalian ON CONFLICT yang
-- membaca payment_status TERSIMPAN); satu-satunya perubahan ialah bacaan
-- payment_online_required terus daripada program_settings digantikan
-- dengan penyelesai yang mengambil new.siri.

create or replace function public.enforce_payment_before_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ps_id        uuid;
  v_required     boolean;
  v_bayar        text;
  v_status_sedia text;
  v_bayar_sedia  text;
begin
  if new.status is distinct from 'approved' then
    return new;
  end if;

  -- Sudah approved sebelum ini: bukan peralihan baharu, biarkan.
  -- IF bersarang, bukan `tg_op = 'UPDATE' and old.status = ...` — PL/pgSQL
  -- tidak menjamin penilaian litar-pintas, dan merujuk OLD semasa INSERT
  -- akan membuang ralat "record old is not assigned yet".
  if tg_op = 'UPDATE' then
    if old.status = 'approved' then
      return new;
    end if;
  end if;

  v_bayar := new.payment_status;

  -- Laluan ON CONFLICT: kita dipanggil sebagai INSERT, tetapi baris sudah
  -- wujud dan pernyataan ini sebenarnya akan mengemas kininya. Nilai yang
  -- BERMAKNA ialah nilai yang tersimpan, bukan lalai lajur yang dibawa oleh
  -- muatan yang tidak menyebut payment_status langsung.
  if tg_op = 'INSERT' then
    select sbs.status, sbs.payment_status
      into v_status_sedia, v_bayar_sedia
    from public.school_badge_status sbs
    where sbs.school_id = new.school_id
      and sbs.badge_id  = new.badge_id
      and sbs.year      = new.year
      and sbs.siri      = new.siri;

    if found then
      if v_status_sedia = 'approved' then
        return new;
      end if;
      if v_bayar_sedia = 'paid' then
        v_bayar := 'paid';
      end if;
    end if;
  end if;

  v_ps_id := public.resolve_program_setting(new.school_id, new.badge_id, new.year);
  if v_ps_id is null then
    return new;   -- program tanpa tetapan: tiada bayaran diwajibkan
  end if;

  -- §15: kewajipan bayaran ialah per program x siri, bukan per program.
  v_required := public.siri_payment_required(v_ps_id, new.siri::smallint);

  if coalesce(v_required, false) and coalesce(v_bayar, 'not_required') <> 'paid' then
    raise exception
      'Pendaftaran ini belum dibayar (status: %). Program mewajibkan bayaran sebelum pengesahan.',
      coalesce(v_bayar, 'not_required')
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.enforce_payment_before_approval() is
  'Menyekat kelulusan sehingga bayaran selesai, bagi siri yang mewajibkannya. '
  'Sedar bahawa PostgreSQL menembak pencetus BEFORE INSERT bagi baris ON '
  'CONFLICT sebelum konflik dikesan, jadi ia membaca payment_status yang '
  'TERSIMPAN dan bukan lalai lajur yang dibawa oleh muatan upsert.';


-- ============================================================
-- 4. enforce_submission_open — kini sedar siri
-- ============================================================

create or replace function public.enforce_submission_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ps_id  uuid;
  v_buka   boolean;
  v_bayar  text;
  v_sedia  text;
begin
  if new.status is distinct from 'submitted' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'submitted' then
      return new;
    end if;
  end if;

  v_ps_id := public.resolve_program_setting(new.school_id, new.badge_id, new.year);
  if v_ps_id is null then
    return new;   -- program tanpa tetapan: tiada togol untuk dikuatkuasakan
  end if;

  -- §15: togol hantar juga per program x siri. Membuka Siri 2 tidak lagi
  -- membuka Siri 3 yang belum diumumkan.
  v_buka := public.siri_submission_open(v_ps_id, new.siri::smallint);

  if coalesce(v_buka, true) then
    return new;
  end if;

  -- Wang mengatasi togol. Nilai yang BERMAKNA ialah yang tersimpan: laluan
  -- ON CONFLICT menembak pencetus BEFORE INSERT dengan lalai lajur, bukan
  -- dengan baris sebenar (perangkap yang sama seperti migrasi 039).
  v_bayar := new.payment_status;
  if tg_op = 'INSERT' then
    select sbs.payment_status into v_sedia
    from public.school_badge_status sbs
    where sbs.school_id = new.school_id
      and sbs.badge_id  = new.badge_id
      and sbs.year      = new.year
      and sbs.siri      = new.siri;
    if found and v_sedia in ('paid', 'pending_review') then
      v_bayar := v_sedia;
    end if;
  end if;

  if coalesce(v_bayar, 'not_required') in ('paid', 'pending_review') then
    return new;
  end if;

  raise exception
    'Penghantaran pendaftaran bagi siri ini belum dibuka. Sila tunggu makluman admin.'
    using errcode = 'check_violation';
end;
$$;

comment on function public.enforce_submission_open() is
  'Menyekat peralihan ke submitted bila admin belum membuka penghantaran '
  'bagi siri itu. Bayaran yang sudah diterima dikecualikan — menyekatnya '
  'meninggalkan sekolah yang sudah membayar di luar giliran tanpa jalan keluar.';
