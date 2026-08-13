-- ============================================================
-- MIGRATION 052: syarat pegawai sebelum hantar
-- ============================================================
-- Rujuk docs/rancangan-syarat-pegawai.md
--
-- KEPERLUAN
--   Sesetengah program menuntut sekurang-kurangnya seorang PEMIMPIN dan
--   seorang PENGUJI menyertai pendaftaran peserta. Admin menetapkan berapa
--   ramai; 0 bermakna tidak diwajibkan.
--
-- LALAI 0
--   Migrasi ini tidak boleh mengubah tingkah laku mana-mana program sedia
--   ada. Setiap program bermula dengan 0 dan 0, iaitu tiada syarat.
--
-- HANYA PEMIMPIN
--   PENOLONG PEMIMPIN dan PEMBANTU tidak memenuhi syarat pemimpin. Syarat
--   itu bermaksud seorang KETUA; menerima penolong menjadikannya bermaksud
--   "seorang dewasa".
--
-- WANG MENGATASI SYARAT
--   Pencetus tidak menyekat baris yang payment_status-nya sudah 'paid' atau
--   'pending_review'. Edge Function menyemak syarat sebelum bil dicipta,
--   tetapi guru boleh memadam pemimpin itu selepas membayar dan sebelum
--   admin mengesahkan. Tanpa pengecualian ini, wang sudah masuk dan
--   pendaftaran tidak boleh keluar — corak tersekat yang sama seperti
--   §13.12, §13.14 dan §14.
-- ============================================================


-- ============================================================
-- 1. Lajur syarat
-- ============================================================

alter table public.program_settings
  add column if not exists min_pemimpin integer not null default 0
    check (min_pemimpin >= 0),
  add column if not exists min_penguji integer not null default 0
    check (min_penguji >= 0);

comment on column public.program_settings.min_pemimpin is
  'Bilangan minimum PEMIMPIN yang mesti didaftarkan bersama peserta sebelum '
  'penghantaran dibenarkan. 0 = tidak diwajibkan. PENOLONG PEMIMPIN dan '
  'PEMBANTU TIDAK dikira.';

comment on column public.program_settings.min_penguji is
  'Bilangan minimum PENGUJI. 0 = tidak diwajibkan.';


-- ============================================================
-- 2. Penyemak — satu sumber kebenaran bagi pencetus, Edge Function dan UI
-- ============================================================
-- Memulangkan jsonb dan bukan boolean: pemanggil perlu tahu APA yang kurang
-- untuk memberitahu guru. "Syarat tidak dipenuhi" menghantar mereka kepada
-- admin, dan itulah kos sebenar mesej yang kabur.

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

  select
    count(*) filter (where sp.role in ('PESERTA', 'PENERIMA RAMBU')),
    count(*) filter (where sp.role = 'PEMIMPIN'),
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
  'Memulangkan jsonb supaya pemanggil boleh menamakan apa yang kurang.';


-- ============================================================
-- 3. Pencetus — pintu sebenar
-- ============================================================
-- Pencetus BERASINGAN daripada enforce_submission_open, bukan sisipan ke
-- dalamnya. Dua peraturan berbeza dengan mesej ralat berbeza tidak
-- sepatutnya berkongsi satu fungsi.

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

  -- Sudah 'submitted' sebelum ini: bukan peralihan baharu.
  -- IF bersarang, bukan syarat bergabung — PL/pgSQL tidak menjamin penilaian
  -- litar-pintas, dan merujuk OLD semasa INSERT akan membuang ralat.
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

  -- Mesej menamakan apa yang kurang. Guru yang tidak tahu apa yang kurang
  -- akan menghubungi admin.
  v_pesan := 'Pendaftaran ini belum memenuhi syarat pegawai.';
  if coalesce((v_semak->>'kurang_pemimpin')::integer, 0) > 0 then
    v_pesan := v_pesan || format(' Kurang %s Pemimpin (ada %s, perlu %s).',
      v_semak->>'kurang_pemimpin', v_semak->>'ada_pemimpin', v_semak->>'min_pemimpin');
  end if;
  if coalesce((v_semak->>'kurang_penguji')::integer, 0) > 0 then
    v_pesan := v_pesan || format(' Kurang %s Penguji (ada %s, perlu %s).',
      v_semak->>'kurang_penguji', v_semak->>'ada_penguji', v_semak->>'min_penguji');
  end if;
  v_pesan := v_pesan || ' Nota: Penolong Pemimpin dan Pembantu tidak dikira sebagai Pemimpin.';

  raise exception '%', v_pesan using errcode = 'check_violation';
end;
$$;

drop trigger if exists trg_enforce_syarat_pegawai on public.school_badge_status;
create trigger trg_enforce_syarat_pegawai
  before insert or update on public.school_badge_status
  for each row execute function public.enforce_syarat_pegawai();

comment on function public.enforce_syarat_pegawai() is
  'Menyekat peralihan ke submitted bila program menuntut pegawai yang belum '
  'didaftarkan. Bayaran yang sudah diterima dikecualikan — menyekatnya '
  'meninggalkan sekolah yang sudah membayar tanpa jalan keluar.';
