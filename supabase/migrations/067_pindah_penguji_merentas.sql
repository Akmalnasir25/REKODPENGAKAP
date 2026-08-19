-- 067 — pindah penguji ke stesen program lain
--
-- Rujuk docs/rancangan-kumpulan-stesen.md §15.
--
-- Kolam penguji dikongsi merentas program (migrasi 063), tetapi penempatan
-- hanya boleh diubah dalam program yang sama. Membetulkan satu pilihan
-- bermakna reset kedua-dua jadual.
--
-- KENAPA FUNGSI, BUKAN DUA PANGGILAN DARI PELAYAR
--   unique (year, siri, person_ic) bermakna baris lama mesti hilang sebelum
--   baris baharu boleh wujud. Padam-kemudian-sisip dari pelayar mempunyai
--   celah antara keduanya: kalau sisipan gagal, penguji itu lenyap daripada
--   kedua-dua jadual dan tiada apa memberitahu sesiapa. Di sini kedua-duanya
--   berlaku dalam satu transaksi, atau tidak langsung.

create or replace function public.pindah_penguji_stesen(
  p_person_ic text,
  p_year integer,
  p_siri smallint,
  p_run_baharu uuid,
  p_stesen text
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_nama text;
  v_sekolah text;
  v_run_lama uuid;
begin
  if not public.is_admin_or_above() then
    raise exception 'Hanya admin boleh memindahkan penguji';
  end if;

  -- Satu baris sahaja boleh wujud bagi seorang penguji dalam satu siri —
  -- itulah yang kekangan itu jamin, jadi pencarian ini tidak perlu tahu
  -- larian mana dia berada sekarang.
  select e.nama, e.sekolah, e.run_id
    into v_nama, v_sekolah, v_run_lama
    from public.station_group_examiners e
   where e.person_ic = p_person_ic and e.year = p_year and e.siri = p_siri;

  if v_nama is null then
    raise exception 'Penguji tidak dijumpai dalam mana-mana jadual Siri % %', p_siri, p_year;
  end if;

  if not exists (select 1 from public.station_group_runs r
                  where r.id = p_run_baharu and r.year = p_year and r.siri = p_siri) then
    raise exception 'Jadual sasaran bukan milik Siri % % yang sama', p_siri, p_year;
  end if;

  delete from public.station_group_examiners
   where person_ic = p_person_ic and year = p_year and siri = p_siri;

  insert into public.station_group_examiners
    (run_id, station_label, person_ic, nama, sekolah, year, siri)
  values (p_run_baharu, p_stesen, p_person_ic, v_nama, v_sekolah, p_year, p_siri);
end;
$$;

comment on function public.pindah_penguji_stesen(text, integer, smallint, uuid, text) is
  'Pindahkan seorang penguji ke stesen mana-mana program dalam siri yang '
  'sama. Padam dan sisip berlaku dalam satu transaksi kerana '
  'unique(year, siri, person_ic) tidak membenarkan kedua-duanya wujud '
  'serentak (migrasi 067).';

revoke execute on function public.pindah_penguji_stesen(text, integer, smallint, uuid, text) from public, anon;
grant execute on function public.pindah_penguji_stesen(text, integer, smallint, uuid, text) to authenticated;
