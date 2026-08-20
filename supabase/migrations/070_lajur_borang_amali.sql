-- 070 — lajur borang kumpulan amali boleh ditetapkan
--
-- Rujuk docs/rancangan-kumpulan-amali.md §8.
--
-- KEPERLUAN
--   Lajur tanda pada borang ikatan ditetapkan keras sebagai SERAYA, SILANG,
--   TUNGKU. Ujian lain menguji kemahiran lain, dan bilangannya pun berbeza.
--   Admin perlu menetapkan berapa lajur dan apa namanya.
--
-- BIL DAN NAMA PESERTA KEKAL TETAP
--   Ia tidak boleh ditetapkan kerana borang tanpa nama peserta bukan borang.
--   SEKOLAH juga kekal automatik — ia muncul sendiri pada kumpulan CAMPUR
--   sahaja, kerana di situ tajuk kumpulan tidak boleh membawanya.
--
-- KENAPA PADA LARIAN, DAN MELALUI RPC
--   Menjana semula ialah PADAM dan SISIP baris larian (lihat 069). Kalau lajur
--   disimpan pada baris itu tetapi tidak dihantar semasa menjana, setiap kali
--   admin menjana semula lajurnya akan kembali kepada lalai dan kerja menaipnya
--   hilang. Sebab itu simpan_kumpulan_amali menerimanya sebagai parameter.
--
-- HAD 6
--   Lebar A4 potret. BIL, NAMA dan CATATAN sudah mengambil bahagiannya; lebih
--   daripada enam lajur tanda menjadikan setiap petak terlalu sempit untuk
--   ditanda pen, iaitu satu-satunya kerja borang ini.

alter table public.practical_group_runs
  add column if not exists lajur_tanda text[] not null default
    array['SERAYA', 'SILANG', 'TUNGKU'],
  add column if not exists guna_catatan boolean not null default true;

-- Sekurang-kurangnya satu lajur, paling banyak enam, dan tiada label kosong.
-- Label kosong mencetak petak tanpa kepala — penguji tidak tahu apa yang
-- ditanda, dan borang itu menjadi sia-sia selepas dicetak.
--
-- Diletakkan dalam fungsi kerana Postgres menolak subquery dalam CHECK
-- ('cannot use subquery in check constraint'), dan memeriksa setiap elemen
-- array memerlukan unnest. Fungsi mesti IMMUTABLE untuk digunakan dalam CHECK.
create or replace function public.lajur_tanda_sah(p text[])
returns boolean
language sql
immutable
set search_path = public
as $$
  select p is not null
     and array_length(p, 1) between 1 and 6
     and array_position(p, null) is null
     and not exists (select 1 from unnest(p) as t(x) where btrim(x) = '');
$$;

comment on function public.lajur_tanda_sah(text[]) is
  'Penyemak kekangan chk_lajur_tanda: 1-6 label, tiada null, tiada kosong.';

alter table public.practical_group_runs
  drop constraint if exists chk_lajur_tanda;
alter table public.practical_group_runs
  add constraint chk_lajur_tanda check (public.lajur_tanda_sah(lajur_tanda));

comment on column public.practical_group_runs.lajur_tanda is
  'Kepala lajur tanda pada borang, mengikut susunan. Lalai Seraya/Silang/Tungku.';
comment on column public.practical_group_runs.guna_catatan is
  'Sama ada lajur CATATAN kosong dicetak di hujung setiap baris.';


-- ============================================================
-- simpan_kumpulan_amali — tandatangan baharu
-- ============================================================
-- Bentuk lama DIGUGURKAN dan bukan dibiarkan bersama yang baharu. Dua bentuk
-- serentak bermakna pemanggil yang terlupa menghantar lajur akan senyap-senyap
-- memilih bentuk lama dan menetapkan semula lajur kepada lalai — tepat
-- kegagalan yang migrasi ini cuba elakkan.

drop function if exists public.simpan_kumpulan_amali(
  text, integer, smallint, smallint, boolean, jsonb, text);

create or replace function public.simpan_kumpulan_amali(
  p_badge_name   text,
  p_year         integer,
  p_siri         smallint,
  p_saiz         smallint,
  p_asing_ppki   boolean,
  p_ahli         jsonb,
  p_lajur_tanda  text[] default array['SERAYA', 'SILANG', 'TUNGKU'],
  p_guna_catatan boolean default true,
  p_nota         text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_badge uuid;
  v_run   uuid;
  v_lajur text[];
begin
  if not public.is_admin_or_above() then
    raise exception 'Hanya admin boleh menjana kumpulan amali';
  end if;

  select id into v_badge from public.badges where name = p_badge_name;
  if v_badge is null then
    raise exception 'Program % tidak dijumpai', p_badge_name;
  end if;

  -- Ruang di hujung label tidak kelihatan pada skrin tetapi mengubah lebar
  -- lajur yang dicetak. Dibersihkan sekali di sini, bukan diharapkan daripada
  -- setiap pemanggil.
  select array_agg(btrim(x)) into v_lajur
    from unnest(coalesce(p_lajur_tanda, array['SERAYA','SILANG','TUNGKU'])) as t(x)
   where btrim(x) <> '';

  if v_lajur is null or array_length(v_lajur, 1) = 0 then
    raise exception 'Borang perlu sekurang-kurangnya satu lajur tanda';
  end if;

  delete from public.practical_group_runs
   where badge_id = v_badge and year = p_year and siri = p_siri;

  insert into public.practical_group_runs
         (badge_id, year, siri, saiz_kumpulan, asing_ppki,
          lajur_tanda, guna_catatan, nota, created_by)
  values (v_badge, p_year, p_siri, p_saiz, p_asing_ppki,
          v_lajur, coalesce(p_guna_catatan, true), p_nota, auth.uid())
  returning id into v_run;

  insert into public.practical_group_members
         (run_id, kumpulan, person_id, nama, school_id, sekolah, unit)
  select v_run,
         (x->>'kumpulan')::smallint,
         (x->>'person_id')::uuid,
         coalesce(x->>'nama', '-'),
         nullif(x->>'school_id', '')::uuid,
         coalesce(nullif(x->>'sekolah', ''), '-'),
         nullif(x->>'unit', '')
    from jsonb_array_elements(p_ahli) as x;

  return v_run;
end;
$$;

revoke execute on function public.simpan_kumpulan_amali(
  text, integer, smallint, smallint, boolean, jsonb, text[], boolean, text)
  from public, anon;
grant execute on function public.simpan_kumpulan_amali(
  text, integer, smallint, smallint, boolean, jsonb, text[], boolean, text)
  to authenticated;
