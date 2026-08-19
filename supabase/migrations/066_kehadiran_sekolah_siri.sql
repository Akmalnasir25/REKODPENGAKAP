-- 066 — carian kehadiran satu sekolah bagi satu siri
--
-- Rujuk docs/rancangan-qr-sekolah-siri.md.
--
-- QR sekolah menjadi PENUNJUK: ia membawa sekolah, tahun dan siri sahaja,
-- dan senarai program dicari semasa imbasan. Fungsi ini ialah carian itu.
--
-- Kenapa penunjuk: sekolah yang mendaftar program kedua selepas kad dicetak
-- tetap muncul semasa imbasan. Muatan lama (v3) membekukan senarai pada saat
-- cetakan, jadi setiap penambahan memerlukan cetakan semula.
--
-- Hanya pendaftaran 'approved'. Yang masih 'open' atau 'reopened' belum
-- disahkan admin; merekod kehadirannya bermakna mengesahkan sesuatu yang
-- belum wujud secara rasmi.

create or replace function public.kehadiran_sekolah_siri(
  p_kod_sekolah text,
  p_tahun integer,
  p_siri smallint
)
returns table (
  badge_id uuid,
  program text,
  peserta integer,
  pegawai integer,
  disahkan_pada timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin_or_above() then
    raise exception 'Hanya admin boleh mengimbas kehadiran sekolah';
  end if;

  return query
  select b.id,
         b.name,
         -- Peserta dan pegawai diasingkan kerana kad tercetak lama berkata
         -- "36 peserta" sedangkan 36 itu termasuk guru. Skrin imbasan
         -- memaparkan kedua-duanya supaya angka itu jujur.
         count(*) filter (where coalesce(sp.role, 'PESERTA') = 'PESERTA')::integer,
         count(*) filter (where coalesce(sp.role, 'PESERTA') <> 'PESERTA')::integer,
         (select av.verified_at
            from public.attendance_verifications av
           where av.school_id = s.school_id and av.badge_id = b.id
             and av.year = p_tahun and av.siri = p_siri
           limit 1)
    from public.submission_people sp
    join public.submissions s on s.id = sp.submission_id
    join public.badges b on b.id = s.badge_id
    join public.schools sc on sc.id = s.school_id
    join public.school_badge_status sbs
      on sbs.school_id = s.school_id and sbs.badge_id = s.badge_id
     and sbs.year = s.submission_year and sbs.siri = sp.siri
   where sc.school_code = p_kod_sekolah
     and s.submission_year = p_tahun
     and sp.siri = p_siri
     and sbs.status = 'approved'
     and sp.is_deleted = false
     and coalesce(sp.is_withdrawn, false) = false
   group by b.id, b.name, s.school_id
   order by b.name;
end;
$$;

comment on function public.kehadiran_sekolah_siri(text, integer, smallint) is
  'Senarai program diluluskan bagi satu sekolah dalam satu siri, dengan '
  'bilangan peserta dan pegawai, serta bila kehadirannya sudah disahkan. '
  'Dibaca semasa imbasan QR v4 (migrasi 066).';

revoke execute on function public.kehadiran_sekolah_siri(text, integer, smallint) from public, anon;
grant execute on function public.kehadiran_sekolah_siri(text, integer, smallint) to authenticated;
