-- 071 — ganti penguji pada stesen tanpa menjana semula
--
-- Rujuk docs/rancangan-kumpulan-stesen.md §17.
--
-- Penguji berubah selepas jadual dibuat. Satu-satunya alat yang ada ialah
-- mengagih semula keseluruhan jadual, yang membuang setiap pelarasan manual
-- yang sudah dibuat.
--
-- Ganti ialah padam-dan-sisip. Kekangan unique(year, siri, person_ic) tidak
-- menghalangnya kerana dua orang berbeza terlibat — masalahnya kegagalan
-- separuh jalan. Kalau sisipan gagal selepas padaman berjaya, stesen itu
-- kehilangan seorang penguji dan tiada apa memberitahu sesiapa.
--
-- Tambah dan buang masing-masing satu operasi, jadi ia dibuat terus dari
-- aplikasi dan tidak memerlukan fungsi di sini.

create or replace function public.ganti_penguji_stesen(
  p_run_id      uuid,
  p_ic_lama     text,
  p_ic_baharu   text,
  p_nama_baharu text,
  p_sekolah     text
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_stesen text;
  v_year   integer;
  v_siri   smallint;
begin
  if not public.is_admin_or_above() then
    raise exception 'Hanya admin boleh menukar penguji';
  end if;

  select e.station_label, e.year, e.siri
    into v_stesen, v_year, v_siri
    from public.station_group_examiners e
   where e.run_id = p_run_id and e.person_ic = p_ic_lama;

  if v_stesen is null then
    raise exception 'Penguji yang hendak diganti tidak dijumpai dalam jadual ini';
  end if;

  -- Penggantinya mesti belum berada dalam mana-mana jadual siri itu.
  -- Kekangan akan menolaknya juga, tetapi mesej ini memberitahu SEBAB.
  if exists (
    select 1 from public.station_group_examiners e
     where e.year = v_year and e.siri = v_siri and e.person_ic = p_ic_baharu
  ) then
    raise exception 'Penguji pengganti sudah ditempatkan dalam jadual lain bagi siri ini';
  end if;

  delete from public.station_group_examiners
   where run_id = p_run_id and person_ic = p_ic_lama;

  insert into public.station_group_examiners
    (run_id, station_label, person_ic, nama, sekolah, year, siri)
  values (p_run_id, v_stesen, p_ic_baharu, p_nama_baharu, p_sekolah, v_year, v_siri);
end;
$$;

comment on function public.ganti_penguji_stesen(uuid, text, text, text, text) is
  'Tukar seorang penguji dengan orang lain pada stesen yang SAMA, dalam satu '
  'transaksi. Susunan stesen lain tidak disentuh (migrasi 071).';

revoke execute on function public.ganti_penguji_stesen(uuid, text, text, text, text) from public, anon;
grant execute on function public.ganti_penguji_stesen(uuid, text, text, text, text) to authenticated;
