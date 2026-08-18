-- ============================================================
-- MIGRATION 054: Pemimpin yang merangkap Penguji
-- ============================================================
--
-- APA MASALAHNYA
--   Seorang guru yang mengiringi pasukan DAN bertugas sebagai penguji ialah
--   kes biasa. Hari ini tiada cara merekodkannya: borang menolak KP yang
--   sama dua kali (UserForm), jadi dia tidak boleh didaftarkan sekali sebagai
--   Pemimpin dan sekali lagi sebagai Penguji.
--
-- LAJUR INI SUDAH WUJUD DALAM PRODUCTION
--   is_penguji ada pada submission_people dengan 64 baris bertanda, tetapi
--   TIADA fail migrasi, TIADA rujukan kod, dan TIADA sebutan dalam sejarah
--   git. Ia mendahului repo ini — berkemungkinan dari era Apps Script, dan
--   flagnya terbawa masuk semasa migrasi ke Supabase. Kod yang menulis dan
--   membacanya hilang semasa borang disatukan (commit 0c3eef6).
--
--   `add column if not exists` menangkapnya semula ke dalam repo tanpa
--   menyentuh data sedia ada. Pangkalan data baharu kini sepadan dengan
--   production; sebelum ini ia tidak.
--
-- SATU PENDAFTARAN, BUKAN DUA
--   Orang bertanda kekal SATU baris: satu tempat, satu yuran, dikira sebagai
--   pemimpin dalam pengiraan bayaran. Flag hanya menjadikannya turut dikira
--   sebagai penguji. Dua baris akan menggandakan tempat dan yuran untuk
--   seorang manusia yang sama — itulah sebabnya flag, bukan pendaftaran
--   kedua.
--
-- KESAN SERTA-MERTA
--   64 baris yang sudah bertanda akan mula dikira. Keris Emas 2026 Siri 1
--   sahaja mempunyai 31 daripadanya. Angka penguji akan naik, dan angka
--   baharu itulah yang betul.
-- ============================================================


-- ============================================================
-- 1. Lajur ditangkap semula ke dalam repo
-- ============================================================

alter table public.submission_people
  add column if not exists is_penguji boolean not null default false;

comment on column public.submission_people.is_penguji is
  'Pegawai ini turut bertugas sebagai Penguji. Hanya bermakna bagi PEMIMPIN, '
  'PENOLONG PEMIMPIN dan PEMBANTU — PESERTA tidak pernah ditanda. Baris kekal '
  'SATU pendaftaran: satu tempat, satu yuran.';

-- PESERTA tidak boleh membawa flag ini. Tanpa jaringan ini, satu import pukal
-- yang tersilap lajur akan menyuntik peserta ke dalam kiraan penguji dan
-- memenuhi syarat min_penguji tanpa seorang penguji pun.
update public.submission_people
   set is_penguji = false
 where is_penguji = true
   and role in ('PESERTA', 'PENERIMA RAMBU');


-- ============================================================
-- 2. semak_syarat_pegawai mengambil kira flag
-- ============================================================
-- Dibina atas versi migrasi 053: PEMIMPIN dan PENOLONG PEMIMPIN kedua-duanya
-- memenuhi syarat pemimpin, PEMBANTU tidak. Yang berubah hanya kiraan
-- penguji.
--
-- Seorang pemimpin bertanda dikira DUA KALI dengan sengaja — sekali sebagai
-- pemimpin, sekali sebagai penguji. Itu memang maksudnya: dia benar-benar
-- memenuhi kedua-dua tugas.

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
  --
  -- Penguji = mereka yang berperanan PENGUJI, DITAMBAH pegawai yang ditanda
  -- merangkap penguji. `or` dalam satu filter, bukan dua count dijumlahkan:
  -- baris berperanan PENGUJI tidak boleh membawa flag itu juga tanpa dikira
  -- dua kali.
  select
    count(*) filter (where sp.role in ('PESERTA', 'PENERIMA RAMBU')),
    count(*) filter (where sp.role in ('PEMIMPIN', 'PENOLONG PEMIMPIN')),
    count(*) filter (where sp.role = 'PENGUJI' or coalesce(sp.is_penguji, false))
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

comment on function public.semak_syarat_pegawai(uuid, uuid, integer, smallint) is
  'Syarat pegawai sebelum hantar. Penguji dikira daripada peranan PENGUJI '
  'DAN pegawai yang ditanda merangkap penguji (migrasi 054).';
