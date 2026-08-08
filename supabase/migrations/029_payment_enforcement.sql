-- ============================================================
-- MIGRATION 029: Kuatkuasa Bayaran & Had Tempat
-- ============================================================
-- Rujuk docs/rancangan-payment-online.md §3.5, §3.8, §3.9.
--
-- Migrasi 028 menambah jadual. Migrasi ini menambah PERATURAN yang
-- menguatkuasakannya, di peringkat pangkalan data:
--
--   1. resolve_program_setting()   — cari tetapan program ikut skop sekolah
--   2. siri_seats_taken()          — kiraan tempat terisi (sumber kebenaran)
--   3. check_siri_availability()   — semakan baca-sahaja, untuk UI & pra-bil
--   4. claim_siri_seats()          — semakan + tuntut tempat, ATOMIK
--   5. trigger pengesahan          — halang 'approved' sebelum bayaran selesai
--
-- KENAPA DI PANGKALAN DATA, BUKAN DALAM EDGE FUNCTION
--   approveSchoolBadge ialah upsert biasa dari browser (supabaseApi.ts).
--   Sesiapa yang ada peranan admin boleh memanggilnya terus, memintas
--   apa-apa semakan UI. Trigger ialah satu-satunya jaminan sebenar.
--
--   Bagi had tempat, masalahnya keserentakan: dua sekolah membayar untuk
--   tempat terakhir pada saat yang sama. Corak baca-dulu-tulis-kemudian
--   (seperti modul kursus, courseService.ts:332) membenarkan kedua-duanya
--   masuk. Penguncian baris menjadikannya beratur.
-- ============================================================


-- ============================================================
-- 1. resolve_program_setting — tetapan program ikut skop sekolah
-- ============================================================
-- Program berskop 'negeri' guna tetapan negeri sekolah; berskop 'daerah'
-- guna tetapan daerah. Mencerminkan findSetting() dalam programSummary.ts.

create or replace function public.resolve_program_setting(
  p_school_id uuid,
  p_badge_id uuid,
  p_year integer
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select ps.id
  from public.schools sc
  join public.badges b on b.id = p_badge_id
  join public.program_settings ps
    on ps.badge_id = p_badge_id
   and ps.year = p_year
   and (
        (coalesce(b.scope, 'daerah') = 'negeri' and ps.negeri_id is not distinct from sc.negeri_id)
     or (coalesce(b.scope, 'daerah') = 'daerah' and ps.daerah_id is not distinct from sc.daerah_id)
   )
  where sc.id = p_school_id
  limit 1;
$$;


-- ============================================================
-- 2. siri_seats_taken — kiraan tempat terisi
-- ============================================================
-- SATU sumber kebenaran untuk "berapa tempat sudah diambil". Dikira LANGSUNG
-- daripada data, bukan kaunter tersimpan: kaunter menyimpang apabila ada tarik
-- diri, bukti ditolak, dan pembatalan — dan penyimpangan pada data berbayar
-- bermakna refund manual.
--
-- Peraturan yang terkandung di sini:
--   • Had ialah had SELURUH PROGRAM dalam skop itu, bukan per sekolah
--   • Hanya peranan yang ADA YURAN mengambil tempat (Keputusan #10)
--   • 'pending_review' mengambil tempat — duit sudah keluar dari sekolah
--   • Peserta withdrawn / deleted melepaskan tempat

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
  select count(*)::integer
  from public.program_settings ps
  join public.badges b on b.id = ps.badge_id
  join public.schools sc
    on (coalesce(b.scope, 'daerah') = 'negeri' and sc.negeri_id is not distinct from ps.negeri_id)
    or (coalesce(b.scope, 'daerah') = 'daerah' and sc.daerah_id is not distinct from ps.daerah_id)
  join public.submissions s
    on s.school_id = sc.id
   and s.badge_id = ps.badge_id
   and s.submission_year = ps.year
  join public.submission_people sp
    on sp.submission_id = s.id
   and sp.siri = p_siri
  join public.payments pay
    on pay.school_id = sc.id
   and pay.badge_id = ps.badge_id
   and pay.year = ps.year
   and pay.siri = p_siri
   and pay.status in ('paid', 'pending_review')
   and pay.seat_status = 'ok'
  where ps.id = p_program_setting_id
    and sp.is_deleted = false
    and coalesce(sp.is_withdrawn, false) = false
    -- Peranan yang mengambil tempat = peranan yang ada yuran (Keputusan #10).
    -- PENGUJI tiada lajur yuran, jadi tidak pernah dikira.
    and (
         (sp.role in ('PESERTA', 'PENERIMA RAMBU') and ps.fee_peserta  is not null)
      or (sp.role = 'PEMIMPIN'                     and ps.fee_pemimpin is not null)
      or (sp.role = 'PENOLONG PEMIMPIN'            and ps.fee_penolong is not null)
    )
    -- Semasa menuntut, bayaran yang sedang diproses dikecualikan supaya
    -- pesertanya tidak dikira dua kali.
    and (p_kecuali_payment_id is null or pay.id <> p_kecuali_payment_id);
$$;


-- ============================================================
-- 3. check_siri_availability — semakan baca-sahaja
-- ============================================================
-- Untuk dropdown siri, pra-semakan sebelum cipta bil, dan paparan admin.
-- TIDAK menuntut apa-apa dan TIDAK mengunci — jangan bergantung padanya
-- sebagai kuatkuasa. Pintu sebenar ialah claim_siri_seats().

create or replace function public.check_siri_availability(
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
  v_ps_id uuid;
  v_max integer;
  v_closed boolean;
  v_deadline timestamptz;
  v_taken integer;
begin
  v_ps_id := public.resolve_program_setting(p_school_id, p_badge_id, p_year);
  if v_ps_id is null then
    return jsonb_build_object('ok', false, 'sebab', 'tiada_tetapan_program');
  end if;

  select pss.max_peserta, pss.is_closed, pss.payment_deadline
    into v_max, v_closed, v_deadline
  from public.program_siri_settings pss
  where pss.program_setting_id = v_ps_id and pss.siri = p_siri;

  -- Tiada baris tetapan siri = tiada had dan tiada tarikh tutup
  if not found then
    return jsonb_build_object('ok', true, 'had', null, 'baki', null);
  end if;

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
  return jsonb_build_object(
    'ok', v_taken < v_max,
    'had', v_max,
    'terisi', v_taken,
    'baki', greatest(v_max - v_taken, 0)
  );
end;
$$;


-- ============================================================
-- 4. claim_siri_seats — semakan + tuntut, ATOMIK
-- ============================================================
-- INILAH pintu sebenar. Dipanggil ketika bayaran disahkan (webhook ToyyibPay
-- atau admin mengesahkan bukti manual).
--
-- Mengembalikan hasil dan BUKAN membuang ralat, kerana pemanggilnya ialah
-- webhook: duit sudah masuk, jadi kegagalan mesti direkodkan sebagai
-- 'no_seat' untuk tindakan admin, bukan mengguguran transaksi.

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
  v_ps_id uuid;
  v_max integer;
  v_closed boolean;
  v_taken integer;
  v_minta integer;
begin
  if p_new_status not in ('paid', 'pending_review') then
    return jsonb_build_object('ok', false, 'sebab', 'status_tidak_sah');
  end if;

  select * into v_pay from public.payments where id = p_payment_id;
  if not found then
    return jsonb_build_object('ok', false, 'sebab', 'bayaran_tidak_dijumpai');
  end if;

  -- Idempoten: webhook boleh sampai lebih daripada sekali
  if v_pay.status = p_new_status and v_pay.seat_status = 'ok' then
    return jsonb_build_object('ok', true, 'sebab', 'sudah_dituntut');
  end if;

  v_ps_id := public.resolve_program_setting(v_pay.school_id, v_pay.badge_id, v_pay.year);
  if v_ps_id is null then
    return jsonb_build_object('ok', false, 'sebab', 'tiada_tetapan_program');
  end if;

  -- KUNCI BARIS. Permintaan serentak untuk siri yang sama BERATUR di sini.
  -- Tanpa ini, dua sekolah yang membayar serentak untuk tempat terakhir akan
  -- kedua-duanya nampak ruang kosong dan kedua-duanya masuk.
  select pss.max_peserta, pss.is_closed
    into v_max, v_closed
  from public.program_siri_settings pss
  where pss.program_setting_id = v_ps_id and pss.siri = v_pay.siri
  for update;

  -- Tiada baris tetapan siri, atau tiada had: tuntut terus.
  if not found or v_max is null then
    update public.payments
       set status = p_new_status,
           seat_status = 'ok',
           paid_at = coalesce(paid_at, now())
     where id = p_payment_id;
    return jsonb_build_object('ok', true, 'had', null);
  end if;

  -- Tarikh tutup TIDAK disemak di sini dengan sengaja. Duit sudah diterima;
  -- menolaknya kerana lewat beberapa saat akan mencipta kes refund. Penapisan
  -- tarikh berlaku lebih awal, semasa bil dicipta.

  v_taken := public.siri_seats_taken(v_ps_id, v_pay.siri, p_payment_id);

  -- Berapa tempat bayaran ini minta? Kira peserta berbayar bagi sekolah ini.
  select count(*)::integer into v_minta
  from public.submissions s
  join public.submission_people sp on sp.submission_id = s.id
  join public.program_settings ps on ps.id = v_ps_id
  where s.school_id = v_pay.school_id
    and s.badge_id = v_pay.badge_id
    and s.submission_year = v_pay.year
    and sp.siri = v_pay.siri
    and sp.is_deleted = false
    and coalesce(sp.is_withdrawn, false) = false
    and (
         (sp.role in ('PESERTA', 'PENERIMA RAMBU') and ps.fee_peserta  is not null)
      or (sp.role = 'PEMIMPIN'                     and ps.fee_pemimpin is not null)
      or (sp.role = 'PENOLONG PEMIMPIN'            and ps.fee_penolong is not null)
    );

  if coalesce(v_closed, false) or (v_taken + v_minta) > v_max then
    -- Duit sudah diterima tetapi tempat tiada. Tanda untuk tindakan admin;
    -- JANGAN naikkan kiraan dan JANGAN benarkan pengesahan automatik.
    update public.payments
       set status = p_new_status,
           seat_status = 'no_seat',
           paid_at = coalesce(paid_at, now())
     where id = p_payment_id;

    return jsonb_build_object(
      'ok', false,
      'sebab', case when coalesce(v_closed, false) then 'siri_ditutup' else 'tempat_penuh' end,
      'had', v_max, 'terisi', v_taken, 'diminta', v_minta
    );
  end if;

  update public.payments
     set status = p_new_status,
         seat_status = 'ok',
         paid_at = coalesce(paid_at, now())
   where id = p_payment_id;

  return jsonb_build_object('ok', true, 'had', v_max, 'terisi', v_taken + v_minta);
end;
$$;


-- ============================================================
-- 5. Trigger: halang pengesahan sebelum bayaran selesai
-- ============================================================
-- Meliputi INSERT dan UPDATE kerana approveSchoolBadge menggunakan upsert —
-- baris boleh terus dicipta dengan status 'approved'.

create or replace function public.enforce_payment_before_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ps_id uuid;
  v_required boolean;
begin
  if new.status is distinct from 'approved' then
    return new;
  end if;

  -- Sudah approved sebelum ini: bukan peralihan baharu, biarkan.
  -- IF bersarang, bukan `tg_op = 'UPDATE' and old.status = ...` — PL/pgSQL
  -- tidak menjamin penilaian litar-pintas, dan merujuk OLD semasa INSERT
  -- akan membuang ralat "record old is not assigned yet".
  if tg_op = 'UPDATE' then
    if old.status = 'approved' then
      return new;
    end if;
  end if;

  v_ps_id := public.resolve_program_setting(new.school_id, new.badge_id, new.year);
  if v_ps_id is null then
    return new;   -- program tanpa tetapan: tiada bayaran diwajibkan
  end if;

  select coalesce(ps.payment_online_required, false)
    into v_required
  from public.program_settings ps
  where ps.id = v_ps_id;

  if coalesce(v_required, false) and coalesce(new.payment_status, 'not_required') <> 'paid' then
    raise exception
      'Pendaftaran ini belum dibayar (status: %). Program mewajibkan bayaran sebelum pengesahan.',
      coalesce(new.payment_status, 'not_required')
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_payment_before_approval on public.school_badge_status;
create trigger trg_enforce_payment_before_approval
  before insert or update on public.school_badge_status
  for each row execute function public.enforce_payment_before_approval();


-- ============================================================
-- 6. Kebenaran
-- ============================================================
-- Fungsi baca-sahaja dibuka kepada client (dropdown siri perlukannya).
-- claim_siri_seats TIDAK — ia mengubah status bayaran, jadi hanya Edge
-- Function service role boleh memanggilnya.

grant execute on function public.check_siri_availability(uuid, uuid, integer, smallint) to authenticated;
grant execute on function public.resolve_program_setting(uuid, uuid, integer) to authenticated;

-- Postgres memberi EXECUTE kepada PUBLIC secara lalai bagi fungsi baharu.
-- Menariknya balik daripada PUBLIC turut menariknya daripada service_role,
-- jadi ia mesti dikembalikan secara eksplisit — jika tidak, webhook sendiri
-- tidak akan dapat memanggil fungsi ini.
revoke execute on function public.claim_siri_seats(uuid, text) from public;
grant execute on function public.claim_siri_seats(uuid, text) to service_role;

revoke execute on function public.siri_seats_taken(uuid, smallint, uuid) from anon;
