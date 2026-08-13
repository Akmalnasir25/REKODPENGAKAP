-- ============================================================
-- MIGRATION 051: yuran berasingan untuk PEMBANTU
-- ============================================================
-- Rujuk docs/rancangan-yuran-pembantu.md
--
-- MEMBALIKKAN K4 MIGRASI 050
--   Migrasi 050 menetapkan PEMBANTU dicaj pada kadar PENOLONG dan tidak
--   dibezakan di lapisan wang. Kadar tersendiri bermakna ia perlukan
--   identitinya sendiri di setiap lapisan itu.
--
-- KENAPA SNAPSHOT MESTI DIPECAHKAN
--   payments.snapshot_* menyimpan bilangan orang yang DIBIL, dibekukan pada
--   masa bil dicipta. Ia menjawab dua soalan kemudian:
--     - berapa tempat sudah diambil (siri_seats_taken)
--     - berapa orang sudah dilindungi bayaran terdahulu, supaya bil susulan
--       mengecaj BEZA dan bukan jumlah penuh (§13.12)
--
--   Kalau PEMBANTU terus dikira ke dalam snapshot_penolong sedangkan kadarnya
--   berbeza, kedua-dua jawapan itu salah: bil susulan akan menganggap seorang
--   pembantu sudah dibayar sedangkan yang dibayar ialah penolong.
--
-- LALAI NULL
--   fee_pembantu bermula NULL, bermakna PEMBANTU tidak dicaj sehingga admin
--   menetapkan kadarnya. Ini TIDAK menjejaskan bil yang sudah dibayar —
--   pembantu di dalamnya sudah berada dalam snapshot_penolong dan tempatnya
--   kekal dikira oleh cabang fee_penolong.
--
--   Kesan yang PERLU disedari: sekolah yang belum menghantar tidak akan
--   dicaj bagi pembantu mereka sehingga kadar itu ditetapkan.
-- ============================================================


-- ============================================================
-- 1. Lajur yuran
-- ============================================================

alter table public.program_settings
  add column if not exists fee_pembantu numeric(10,2);

-- Override juga, jika tidak kadar Pembantu tidak boleh berbeza antara siri
-- atau jenis sekolah sedangkan tiga yang lain boleh.
alter table public.program_fee_overrides
  add column if not exists fee_pembantu numeric(10,2)
    check (fee_pembantu is null or fee_pembantu >= 0);

comment on column public.program_settings.fee_pembantu is
  'NULL = PEMBANTU tidak dicaj bagi program ini, dan tidak mengambil tempat. '
  'Ditambah dalam migrasi 051; sebelum itu pembantu dicaj pada kadar penolong.';


-- ============================================================
-- 2. Snapshot
-- ============================================================
-- Lalai 0 betul untuk baris sedia ada: tiada bil terdahulu pernah mengecaj
-- sesiapa sebagai PEMBANTU pada kadar pembantu.

alter table public.payments
  add column if not exists snapshot_pembantu integer not null default 0;


-- ============================================================
-- 3. resolve_program_fees — empat lajur pulangan
-- ============================================================
-- DROP dahulu: `create or replace function` tidak boleh menukar bentuk
-- pulangan. Perangkap ini sudah dilanggar dua kali dalam projek ini
-- (get_payment_methods, check_siri_availability).

drop function if exists public.resolve_program_fees(uuid, smallint, text);

create function public.resolve_program_fees(
  p_program_setting_id uuid,
  p_siri smallint default 1,
  p_school_type text default 'lain'
)
returns table (
  fee_peserta numeric(10,2),
  fee_pemimpin numeric(10,2),
  fee_penolong numeric(10,2),
  fee_pembantu numeric(10,2)
)
language sql
stable
security definer
set search_path = public
as $$
  with asas as (
    select ps.fee_peserta, ps.fee_pemimpin, ps.fee_penolong, ps.fee_pembantu
    from public.program_settings ps
    where ps.id = p_program_setting_id
  ),
  pilihan as (
    select o.fee_peserta, o.fee_pemimpin, o.fee_penolong, o.fee_pembantu,
           case
             when o.siri is not null and o.school_type is not null then 1
             when o.siri is not null                               then 2
             when o.school_type is not null                        then 3
             else 4
           end as keutamaan
    from public.program_fee_overrides o
    where o.program_setting_id = p_program_setting_id
      and (o.siri is null or o.siri = p_siri)
      and (o.school_type is null or o.school_type = p_school_type)
  ),
  terpilih as (
    select * from pilihan order by keutamaan limit 1
  )
  select
    -- Syarat `asas is not null` mengekalkan peraturan asal: override memberi
    -- JUMLAH, ia tidak boleh MENAMBAH peranan yang dicaj. Itulah yang menjaga
    -- Keputusan #10 — set peranan berbayar sama untuk setiap sekolah.
    case when asas.fee_peserta  is null then null
         else coalesce((select fee_peserta  from terpilih), asas.fee_peserta)  end,
    case when asas.fee_pemimpin is null then null
         else coalesce((select fee_pemimpin from terpilih), asas.fee_pemimpin) end,
    case when asas.fee_penolong is null then null
         else coalesce((select fee_penolong from terpilih), asas.fee_penolong) end,
    case when asas.fee_pembantu is null then null
         else coalesce((select fee_pembantu from terpilih), asas.fee_pembantu) end
  from asas;
$$;

grant execute on function public.resolve_program_fees(uuid, smallint, text) to authenticated;


-- ============================================================
-- 4. siri_seats_taken — sebutan keempat
-- ============================================================

create or replace function public.siri_seats_taken(
  p_program_setting_id uuid,
  p_siri smallint,
  p_kecuali_payment_id uuid default null
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(
    (case when ps.fee_peserta  is not null then pay.snapshot_peserta  else 0 end)
  + (case when ps.fee_pemimpin is not null then pay.snapshot_pemimpin else 0 end)
  + (case when ps.fee_penolong is not null then pay.snapshot_penolong else 0 end)
  + (case when ps.fee_pembantu is not null then pay.snapshot_pembantu else 0 end)
  ), 0)::integer
  from public.program_settings ps
  join public.badges b on b.id = ps.badge_id
  join public.schools sc
    on (coalesce(b.scope, 'daerah') = 'negeri' and sc.negeri_id is not distinct from ps.negeri_id)
    or (coalesce(b.scope, 'daerah') = 'daerah' and sc.daerah_id is not distinct from ps.daerah_id)
  join public.payments pay
    on pay.school_id = sc.id
   and pay.badge_id = ps.badge_id
   and pay.year = ps.year
   and pay.siri = p_siri
   and pay.status in ('paid', 'pending_review')
   and pay.seat_status = 'ok'
  where ps.id = p_program_setting_id
    and (p_kecuali_payment_id is null or pay.id <> p_kecuali_payment_id);
$$;

revoke execute on function public.siri_seats_taken(uuid, smallint, uuid) from public, anon;
grant execute on function public.siri_seats_taken(uuid, smallint, uuid) to authenticated, service_role;


-- ============================================================
-- 5. claim_siri_seats — sebutan keempat dalam kiraan diminta
-- ============================================================
-- Badan sama seperti migrasi 048; hanya v_minta yang bertambah satu sebutan.

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

  -- KUNCI pada baris program_settings: ia SENTIASA wujud, sedangkan baris
  -- siri boleh tiada, dan mengunci sesuatu yang tiada bermakna tiada
  -- perlindungan langsung.
  select * into v_ps from public.program_settings where id = v_ps_id for update;

  select pss.max_peserta, pss.is_closed
    into v_max, v_closed
  from public.program_siri_settings pss
  where pss.program_setting_id = v_ps_id and pss.siri = v_pay.siri;

  v_minta :=
      (case when v_ps.fee_peserta  is not null then coalesce(v_pay.snapshot_peserta, 0)  else 0 end)
    + (case when v_ps.fee_pemimpin is not null then coalesce(v_pay.snapshot_pemimpin, 0) else 0 end)
    + (case when v_ps.fee_penolong is not null then coalesce(v_pay.snapshot_penolong, 0) else 0 end)
    + (case when v_ps.fee_pembantu is not null then coalesce(v_pay.snapshot_pembantu, 0) else 0 end);

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
-- 6. baki_tempat_siri — PEMBANTU diasingkan daripada penolong
-- ============================================================

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
          or (sp.role = 'PEMBANTU'                     and ps.fee_pembantu is not null)
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
