-- ============================================================
-- MIGRATION 047: Togol "Benarkan Hantar Pengesahan"
-- ============================================================
-- Rujuk docs/rancangan-payment-online.md §14.
--
-- MASALAH
--   Sekolah menyediakan pendaftaran lebih awal tetapi tidak boleh menghantar
--   sehingga admin memaklumkan. Hari ini tiada apa menghalang mereka selain
--   amaran dalam hebahan — dan menekan Hantar terlalu awal mengunci senarai
--   serta memulakan proses bayaran. Membukanya semula memerlukan tindakan
--   admin bagi setiap sekolah.
--
-- WANG MENGATASI TOGOL
--   Pencetus di bawah TIDAK menyekat baris yang payment_status nya sudah
--   'paid' atau 'pending_review'. Bayaran yang sedang dalam perjalanan boleh
--   selesai selepas admin menutup togol; menyekatnya pada saat itu
--   meninggalkan sekolah yang sudah membayar di luar giliran tanpa jalan
--   keluar — corak tersekat yang sama seperti §13.14 dan §13.12.
--
-- LALAI TERBUKA
--   Setiap program sedia ada mesti kekal berkelakuan sama selepas migrasi ini.
-- ============================================================

alter table public.program_settings
  add column if not exists submission_open boolean not null default true;

comment on column public.program_settings.submission_open is
  'Bila palsu, sekolah tidak boleh menghantar pendaftaran untuk pengesahan. '
  'Bayaran yang sudah diterima tetap membawa pendaftarannya masuk — lihat §14.';


-- ============================================================
-- Pencetus: pintu sebenar bagi program tanpa bayaran
-- ============================================================
-- Program percuma tidak pernah melalui create-payment-bill, jadi tanpa
-- pencetus ini togol hanya disekat oleh paparan — dan paparan boleh dipintas.

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

  -- Sudah 'submitted' sebelum ini: bukan peralihan baharu.
  -- IF bersarang, bukan `tg_op = 'UPDATE' and old.status = ...` — PL/pgSQL
  -- tidak menjamin penilaian litar-pintas, dan merujuk OLD semasa INSERT
  -- akan membuang ralat.
  if tg_op = 'UPDATE' then
    if old.status = 'submitted' then
      return new;
    end if;
  end if;

  v_ps_id := public.resolve_program_setting(new.school_id, new.badge_id, new.year);
  if v_ps_id is null then
    return new;   -- program tanpa tetapan: tiada togol untuk dikuatkuasakan
  end if;

  select coalesce(ps.submission_open, true) into v_buka
  from public.program_settings ps where ps.id = v_ps_id;

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
    'Penghantaran pendaftaran bagi program ini belum dibuka. Sila tunggu makluman admin.'
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists trg_enforce_submission_open on public.school_badge_status;
create trigger trg_enforce_submission_open
  before insert or update on public.school_badge_status
  for each row execute function public.enforce_submission_open();

comment on function public.enforce_submission_open() is
  'Menyekat peralihan ke submitted bila admin belum membuka penghantaran. '
  'Bayaran yang sudah diterima dikecualikan — menyekatnya meninggalkan '
  'sekolah yang sudah membayar di luar giliran tanpa jalan keluar.';
