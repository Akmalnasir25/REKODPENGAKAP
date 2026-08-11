-- ============================================================
-- MIGRATION 048: Had tempat ditetapkan per SIRI
-- ============================================================
-- Rujuk docs/rancangan-payment-online.md §14b.
--
-- APA YANG BERUBAH
--   Migrasi 041 memindahkan max_peserta ke program_settings kerana had
--   difahami sebagai sifat program. Dalam amalan, setiap siri ialah pusingan
--   berasingan dengan tapak dan tarikhnya sendiri — Siri 1 mungkin memuatkan
--   300, Siri 2 hanya 200.
--
--   Had kembali ke program_siri_settings: satu ruang untuk setiap siri.
--
-- KUNCI BARIS KEKAL DI program_settings
--   Ini bahagian yang mudah tersilap. claim_siri_seats mengunci satu baris
--   supaya dua bayaran serentak tidak kedua-duanya nampak tempat terakhir
--   kosong. Kunci itu TIDAK boleh berpindah ke program_siri_settings, kerana
--   baris siri mungkin belum wujud — dan tiada baris bermakna tiada apa untuk
--   dikunci, iaitu tiada perlindungan langsung.
--
--   Baris yang dikunci tidak perlu memegang nilai. Ia hanya perlu WUJUD dan
--   sama bagi setiap permintaan yang bersaing. program_settings memenuhi
--   kedua-duanya; ia menyiri semua siri program itu, sedikit lebih kasar
--   daripada perlu tetapi betul.
-- ============================================================


-- ============================================================
-- 1. Lajur kembali ke jadual siri
-- ============================================================

alter table public.program_siri_settings
  add column if not exists max_peserta integer
    check (max_peserta is null or max_peserta > 0);

comment on column public.program_siri_settings.max_peserta is
  'Had tempat bagi siri ini sahaja. NULL = tiada had. Setiap siri berdiri '
  'sendiri; Siri 1 penuh tidak menyekat Siri 2.';


-- ============================================================
-- 2. Turunkan nilai sedia ada ke setiap siri
-- ============================================================
-- Program yang mempunyai had peringkat program hari ini mendapat nilai yang
-- SAMA pada setiap sirinya, supaya kelakuan tidak berubah semasa migrasi.
-- Baris siri dicipta jika belum wujud.

insert into public.program_siri_settings (program_setting_id, siri, max_peserta)
select ps.id, g.siri::smallint, ps.max_peserta
from public.program_settings ps
cross join generate_series(1, greatest(coalesce(ps.max_siri, 1), 1)) as g(siri)
where ps.max_peserta is not null
on conflict (program_setting_id, siri) do update
  set max_peserta = coalesce(public.program_siri_settings.max_peserta, excluded.max_peserta);

alter table public.program_settings drop column if exists max_peserta;


-- ============================================================
-- 3. check_siri_availability membaca had dari baris siri
-- ============================================================

drop function if exists public.check_siri_availability(uuid, uuid, integer, smallint, integer);

create or replace function public.check_siri_availability(
  p_school_id uuid,
  p_badge_id uuid,
  p_year integer,
  p_siri smallint,
  p_minta integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ps_id uuid;
  v_max integer;
  v_closed boolean;
  v_deadline timestamptz;
  v_taken integer;
  v_baki integer;
begin
  v_ps_id := public.resolve_program_setting(p_school_id, p_badge_id, p_year);
  if v_ps_id is null then
    return jsonb_build_object('ok', false, 'sebab', 'tiada_tetapan_program');
  end if;

  -- Had, tarikh tutup dan penutupan manual semuanya per siri sekarang.
  select pss.max_peserta, pss.is_closed, pss.payment_deadline
    into v_max, v_closed, v_deadline
  from public.program_siri_settings pss
  where pss.program_setting_id = v_ps_id and pss.siri = p_siri;

  if coalesce(v_closed, false) then
    return jsonb_build_object('ok', false, 'sebab', 'siri_ditutup');
  end if;

  if v_deadline is not null and now() > v_deadline then
    return jsonb_build_object('ok', false, 'sebab', 'tarikh_tutup_berlalu', 'tarikh_tutup', v_deadline);
  end if;

  if v_max is null then
    return jsonb_build_object('ok', true, 'had', null, 'baki', null);
  end if;

  v_taken := public.siri_seats_taken(v_ps_id, p_siri, null);
  v_baki := greatest(v_max - v_taken, 0);

  return jsonb_build_object(
    'ok', v_taken + greatest(coalesce(p_minta, 0), 0) <= v_max,
    'sebab', case when v_taken + greatest(coalesce(p_minta, 0), 0) > v_max
                  then 'tempat_penuh' end,
    'had', v_max,
    'terisi', v_taken,
    'baki', v_baki,
    'diminta', greatest(coalesce(p_minta, 0), 0)
  );
end;
$$;

grant execute on function public.check_siri_availability(uuid, uuid, integer, smallint, integer) to authenticated;
revoke execute on function public.check_siri_availability(uuid, uuid, integer, smallint, integer) from anon;


-- ============================================================
-- 4. claim_siri_seats — had dari baris siri, kunci kekal di program
-- ============================================================

create or replace function public.claim_siri_seats(
  p_payment_id uuid,
  p_new_status text default 'paid'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_pay public.payments%rowtype;
  v_ps public.program_settings%rowtype;
  v_ps_id uuid;
  v_max integer;
  v_closed boolean;
  v_taken integer;
  v_minta integer;
  v_lebih boolean := false;
begin
  if p_new_status not in ('paid', 'pending_review') then
    return jsonb_build_object('ok', false, 'sebab', 'status_tidak_sah');
  end if;

  select * into v_pay from public.payments where id = p_payment_id;
  if not found then
    return jsonb_build_object('ok', false, 'sebab', 'bayaran_tidak_dijumpai');
  end if;

  v_ps_id := public.resolve_program_setting(v_pay.school_id, v_pay.badge_id, v_pay.year);
  if v_ps_id is null then
    return jsonb_build_object('ok', false, 'sebab', 'tiada_tetapan_program');
  end if;

  -- KUNCI. Baris ini tidak lagi memegang had, tetapi ia masih baris yang
  -- dikunci — ia SENTIASA wujud, dan itulah syarat sebenar bagi kunci yang
  -- boleh dipercayai. Baris siri boleh tiada, dan mengunci sesuatu yang tiada
  -- bermakna tiada perlindungan langsung.
  select * into v_ps from public.program_settings where id = v_ps_id for update;

  select pss.max_peserta, pss.is_closed
    into v_max, v_closed
  from public.program_siri_settings pss
  where pss.program_setting_id = v_ps_id and pss.siri = v_pay.siri;

  v_minta :=
      (case when v_ps.fee_peserta  is not null then coalesce(v_pay.snapshot_peserta, 0)  else 0 end)
    + (case when v_ps.fee_pemimpin is not null then coalesce(v_pay.snapshot_pemimpin, 0) else 0 end)
    + (case when v_ps.fee_penolong is not null then coalesce(v_pay.snapshot_penolong, 0) else 0 end);

  if v_max is not null then
    v_taken := public.siri_seats_taken(v_ps_id, v_pay.siri, p_payment_id);
    v_lebih := (v_taken + v_minta) > v_max;
  end if;

  if coalesce(v_closed, false) then
    v_lebih := true;
  end if;

  -- Bayaran DITERIMA walaupun melebihi (§13.14). Menahannya mencipta keadaan
  -- tersekat yang hanya SQL boleh keluarkan.
  update public.payments
     set status = p_new_status,
         seat_status = case when v_lebih then 'no_seat' else 'ok' end,
         paid_at = coalesce(paid_at, now())
   where id = p_payment_id;

  return jsonb_build_object(
    'ok', true,
    'melebihi', v_lebih,
    'had', v_max,
    'terisi', coalesce(v_taken, 0),
    'diminta', v_minta,
    'sebab', case when coalesce(v_closed, false) then 'siri_ditutup'
                  when v_lebih then 'melebihi_had' end
  );
end;
$$;

revoke execute on function public.claim_siri_seats(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_siri_seats(uuid, text) to service_role;


-- ============================================================
-- 5. baki_tempat_siri — jalur baki pada papan pemuka sekolah
-- ============================================================

drop function if exists public.baki_tempat_siri(integer, smallint);

create or replace function public.baki_tempat_siri(
  p_year integer,
  p_siri smallint
)
returns table (
  badge_name   text,
  had          integer,
  terisi       integer,
  baki         integer,
  perlu        integer,
  ditutup      boolean,
  tarikh_tutup timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_school uuid;
begin
  select school_id into v_school from public.profiles where id = auth.uid();
  if v_school is null then
    return;
  end if;

  return query
  select
    b.name::text,
    pss.max_peserta,
    public.siri_seats_taken(ps.id, p_siri, null),
    greatest(pss.max_peserta - public.siri_seats_taken(ps.id, p_siri, null), 0),
    (
      select count(*)::integer
      from public.submissions s
      join public.submission_people sp on sp.submission_id = s.id
      where s.school_id = v_school
        and s.badge_id = ps.badge_id
        and s.submission_year = p_year
        and sp.siri = p_siri
        and sp.is_deleted = false
        and coalesce(sp.is_withdrawn, false) = false
        and (
             (sp.role in ('PESERTA', 'PENERIMA RAMBU') and ps.fee_peserta  is not null)
          or (sp.role = 'PEMIMPIN'                     and ps.fee_pemimpin is not null)
          or (sp.role = 'PENOLONG PEMIMPIN'            and ps.fee_penolong is not null)
        )
    ),
    coalesce(pss.is_closed, false),
    pss.payment_deadline
  from public.badges b
  cross join lateral (
    select public.resolve_program_setting(v_school, b.id, p_year) as id
  ) r
  join public.program_settings ps on ps.id = r.id
  join public.program_siri_settings pss
    on pss.program_setting_id = ps.id and pss.siri = p_siri
  where pss.max_peserta is not null
  order by b.name;
end;
$$;

revoke execute on function public.baki_tempat_siri(integer, smallint) from public, anon;
grant execute on function public.baki_tempat_siri(integer, smallint) to authenticated;
