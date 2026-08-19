-- 068 — label stesen menjadi data, bukan formula
--
-- Rujuk docs/rancangan-kumpulan-stesen.md §16.
--
-- Label dihasilkan oleh formula tetap: 1A..6A, 1B..6B, enam setiap bahagian.
-- Admin mahu memilih formatnya sendiri — nombor lurus, huruf, atau senarai
-- yang ditaip sendiri.
--
-- Menyimpan label sebagai ARRAY, bukan menyimpan nama format, kerana:
--   - format tersuai tidak boleh dijana semula daripada nama format
--   - label yang sudah dicetak tidak boleh berubah kerana seseorang menukar
--     tetapan kemudian; array membekukan apa yang sebenarnya dicetak
--
-- Larian lama mempunyai NULL di sini dan terus menggunakan formula lama,
-- jadi tiada jadual sedia ada berubah labelnya.

alter table public.station_group_runs
  add column if not exists label_stesen text[];

comment on column public.station_group_runs.label_stesen is
  'Label setiap stesen mengikut susunan. NULL bermakna larian lama yang '
  'menggunakan formula 1A..6A/1B..6B (migrasi 068).';


-- ============================================================
-- simpan_kumpulan_stesen menerima label
-- ============================================================
-- Parameter baharu diberi nilai lalai supaya panggilan lama tetap sah.
--
-- Tandatangan lama DIGUGURKAN. Membiarkan kedua-duanya bermakna panggilan
-- lima atau enam hujah sepadan dengan dua fungsi sekaligus, dan Postgres
-- menolaknya sebagai tidak jelas — termasuk panggilan dari PostgREST.

drop function if exists public.simpan_kumpulan_stesen(text, integer, smallint, integer, jsonb, text);

create or replace function public.simpan_kumpulan_stesen(
  p_badge_name   text,
  p_year         integer,
  p_siri         smallint,
  p_bil_kumpulan integer,
  p_agihan       jsonb,
  p_nota         text default null,
  p_label        text[] default null
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
begin
  if not public.is_admin_or_above() then
    raise exception 'Hanya admin boleh menjana kumpulan stesen';
  end if;

  select id into v_badge from public.badges where name = p_badge_name;
  if v_badge is null then
    raise exception 'Program % tidak dijumpai', p_badge_name;
  end if;

  -- Label mesti sepadan dengan bilangan kumpulan, jika tidak menu stesen
  -- akan menawarkan label yang tiada baris, atau baris tanpa label.
  if p_label is not null and array_length(p_label, 1) <> p_bil_kumpulan then
    raise exception 'Bilangan label (%) tidak sepadan dengan bilangan kumpulan (%)',
      coalesce(array_length(p_label, 1), 0), p_bil_kumpulan;
  end if;

  delete from public.station_group_runs
   where badge_id = v_badge and year = p_year and siri = p_siri;

  insert into public.station_group_runs
    (badge_id, year, siri, bil_kumpulan, nota, created_by, label_stesen)
  values (v_badge, p_year, p_siri, p_bil_kumpulan, p_nota, auth.uid(), p_label)
  returning id into v_run;

  insert into public.station_group_schools (run_id, station_label, school_id, peserta_snapshot)
  select v_run,
         x->>'station_label',
         (x->>'school_id')::uuid,
         coalesce((x->>'peserta')::integer, 0)
    from jsonb_array_elements(p_agihan) as x;

  return v_run;
end;
$$;

revoke execute on function public.simpan_kumpulan_stesen(text, integer, smallint, integer, jsonb, text, text[]) from public, anon;
grant execute on function public.simpan_kumpulan_stesen(text, integer, smallint, integer, jsonb, text, text[]) to authenticated;
