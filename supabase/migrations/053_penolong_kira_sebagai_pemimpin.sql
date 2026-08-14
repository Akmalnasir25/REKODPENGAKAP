-- ============================================================
-- MIGRATION 053: Penolong Pemimpin memenuhi syarat pemimpin
-- ============================================================
-- Rujuk docs/rancangan-syarat-pegawai.md K9 (menyelakkan K5).
--
-- KENAPA DIUBAH
--   Migrasi 052 hanya menerima peranan PEMIMPIN. Dalam amalan sekolah kerap
--   mendaftarkan guru pengiring sebagai PENOLONG PEMIMPIN, dan mereka memang
--   guru bertugas.
--
--   Ia juga bertembung dengan realiti data: pepijat submitRegistration
--   menulis setiap Pemimpin sebagai Penolong Pemimpin sehingga ia dibetulkan.
--   Sekolah yang mendaftar sebelum itu mungkin tiada satu pun baris PEMIMPIN
--   sebenar walaupun mereka ada ketua. Menguatkuasakan peraturan lama pada
--   data tersebut menyekat sekolah atas kesilapan sistem.
--
-- PEMBANTU MASIH TIDAK DIKIRA
--   Ia peranan sokongan yang diperkenalkan untuk program tertentu (migrasi
--   050), bukan pengganti ketua rombongan.
--
-- TIADA PERUBAHAN SKEMA
--   Hanya dua fungsi diganti. Tetapan min_pemimpin / min_penguji sedia ada
--   kekal seperti adanya.
-- ============================================================


-- ============================================================
-- 1. semak_syarat_pegawai — penolong dikira
-- ============================================================

create or replace function public.semak_syarat_pegawai(
  p_school_id uuid,
  p_badge_id uuid,
  p_year integer,
  p_siri smallint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ps_id        uuid;
  v_min_pemimpin integer;
  v_min_penguji  integer;
  v_ada_peserta  integer;
  v_ada_pemimpin integer;
  v_ada_penguji  integer;
begin
  v_ps_id := public.resolve_program_setting(p_school_id, p_badge_id, p_year);
  if v_ps_id is null then
    return jsonb_build_object('ok', true, 'sebab', 'tiada_tetapan_program');
  end if;

  select coalesce(ps.min_pemimpin, 0), coalesce(ps.min_penguji, 0)
    into v_min_pemimpin, v_min_penguji
  from public.program_settings ps
  where ps.id = v_ps_id;

  if v_min_pemimpin = 0 and v_min_penguji = 0 then
    return jsonb_build_object('ok', true, 'sebab', 'tiada_syarat');
  end if;

  -- PEMIMPIN dan PENOLONG PEMIMPIN kedua-duanya memenuhi syarat pemimpin.
  -- PEMBANTU tidak.
  select
    count(*) filter (where sp.role in ('PESERTA', 'PENERIMA RAMBU')),
    count(*) filter (where sp.role in ('PEMIMPIN', 'PENOLONG PEMIMPIN')),
    count(*) filter (where sp.role = 'PENGUJI')
    into v_ada_peserta, v_ada_pemimpin, v_ada_penguji
  from public.submissions s
  join public.submission_people sp on sp.submission_id = s.id
  where s.school_id = p_school_id
    and s.badge_id  = p_badge_id
    and s.submission_year = p_year
    and sp.siri = p_siri
    and sp.is_deleted = false
    and coalesce(sp.is_withdrawn, false) = false;

  -- Syarat berbunyi "kalau nak hantar peserta". Program yang hanya
  -- mengandungi pegawai dalam siri ini tidak disekat.
  if coalesce(v_ada_peserta, 0) = 0 then
    return jsonb_build_object('ok', true, 'sebab', 'tiada_peserta');
  end if;

  return jsonb_build_object(
    'ok', coalesce(v_ada_pemimpin, 0) >= v_min_pemimpin
      and coalesce(v_ada_penguji, 0)  >= v_min_penguji,
    'min_pemimpin',  v_min_pemimpin,
    'min_penguji',   v_min_penguji,
    'ada_pemimpin',  coalesce(v_ada_pemimpin, 0),
    'ada_penguji',   coalesce(v_ada_penguji, 0),
    'kurang_pemimpin', greatest(v_min_pemimpin - coalesce(v_ada_pemimpin, 0), 0),
    'kurang_penguji',  greatest(v_min_penguji  - coalesce(v_ada_penguji, 0), 0)
  );
end;
$$;

grant execute on function public.semak_syarat_pegawai(uuid, uuid, integer, smallint) to authenticated, service_role;

comment on function public.semak_syarat_pegawai(uuid, uuid, integer, smallint) is
  'Sama ada pendaftaran program x siri ini memenuhi syarat pegawai. '
  'PEMIMPIN dan PENOLONG PEMIMPIN kedua-duanya memenuhi syarat pemimpin; '
  'PEMBANTU tidak. Memulangkan jsonb supaya pemanggil boleh menamakan apa '
  'yang kurang.';


-- ============================================================
-- 2. enforce_syarat_pegawai — mesej diselaraskan
-- ============================================================
-- Badan sama seperti migrasi 052; hanya nota di hujung mesej yang berubah.
-- Mesej yang masih berkata "Penolong Pemimpin tidak dikira" akan menghantar
-- sekolah membetulkan sesuatu yang sudah betul.

create or replace function public.enforce_syarat_pegawai()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_semak jsonb;
  v_bayar text;
  v_sedia text;
  v_pesan text;
begin
  if new.status is distinct from 'submitted' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'submitted' then
      return new;
    end if;
  end if;

  -- Wang mengatasi syarat. Nilai yang BERMAKNA ialah yang tersimpan: laluan
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

  v_semak := public.semak_syarat_pegawai(
    new.school_id, new.badge_id, new.year, new.siri::smallint);

  if coalesce((v_semak->>'ok')::boolean, true) then
    return new;
  end if;

  v_pesan := 'Pendaftaran ini belum memenuhi syarat pegawai.';
  if coalesce((v_semak->>'kurang_pemimpin')::integer, 0) > 0 then
    v_pesan := v_pesan || format(' Kurang %s Pemimpin (ada %s, perlu %s).',
      v_semak->>'kurang_pemimpin', v_semak->>'ada_pemimpin', v_semak->>'min_pemimpin');
  end if;
  if coalesce((v_semak->>'kurang_penguji')::integer, 0) > 0 then
    v_pesan := v_pesan || format(' Kurang %s Penguji (ada %s, perlu %s).',
      v_semak->>'kurang_penguji', v_semak->>'ada_penguji', v_semak->>'min_penguji');
  end if;
  v_pesan := v_pesan || ' Nota: Pemimpin dan Penolong Pemimpin kedua-duanya dikira; Pembantu tidak.';

  raise exception '%', v_pesan using errcode = 'check_violation';
end;
$$;

comment on function public.enforce_syarat_pegawai() is
  'Menyekat peralihan ke submitted bila program menuntut pegawai yang belum '
  'didaftarkan. Pemimpin dan Penolong Pemimpin kedua-duanya dikira. Bayaran '
  'yang sudah diterima dikecualikan.';
