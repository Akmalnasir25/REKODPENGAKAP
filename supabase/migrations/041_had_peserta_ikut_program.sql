-- ============================================================
-- MIGRATION 041: Had peserta ialah sifat PROGRAM, bukan siri
-- ============================================================
-- Rujuk docs/rancangan-payment-online.md §13.5.
--
-- APA YANG BERUBAH
--   max_peserta berpindah dari program_siri_settings ke program_settings.
--   Satu program mempunyai satu had; ia dikira semula bagi setiap siri,
--   kerana setiap siri ialah pusingan berasingan dengan peserta berbeza.
--
--   Contoh: Siri 2 mengandungi Keris Emas dan Keris Perak. Emas tiada had,
--   Perak dihadkan 300 — hadnya membezakan PROGRAM, bukan siri.
--
-- APA YANG KEKAL PER SIRI
--   payment_deadline dan is_closed. Siri 2 lazimnya ditutup pada tarikh
--   berbeza daripada Siri 1, jadi kedua-duanya memang bersifat per siri.
--
-- KUNCI BARIS
--   claim_siri_seats mengunci baris yang memegang had supaya dua bayaran
--   serentak tidak kedua-duanya nampak tempat terakhir kosong. Kunci itu
--   MESTI berpindah bersama had — mengunci baris program_siri_settings yang
--   tidak lagi memegang had bermakna tiada perlindungan langsung.
--
--   Mengunci program_settings menyiri semua siri program itu, bukan satu
--   siri sahaja. Itu sedikit lebih kasar daripada perlu, tetapi ia betul,
--   dan barisnya SENTIASA wujud — tidak seperti program_siri_settings, yang
--   tiada baris bermakna tiada apa untuk dikunci.
-- ============================================================


-- ============================================================
-- 1. Lajur baharu pada program_settings
-- ============================================================

alter table public.program_settings
  add column if not exists max_peserta integer
    check (max_peserta is null or max_peserta > 0);

comment on column public.program_settings.max_peserta is
  'Had tempat bagi program ini, dikira semula setiap siri. NULL = tiada had. '
  'Tempat dikira daripada peranan yang DICAJ (fee_* bukan null), jadi '
  'menukar siapa dicaj turut menukar siapa mengambil tempat.';


-- ============================================================
-- 2. Pindahkan nilai sedia ada, kemudian buang lajur lama
-- ============================================================
-- UI untuk had tidak pernah wujud sehingga hari ini, jadi ini dijangka tiada
-- kesan. Ia ditulis tetap kerana "dijangka kosong" dan "kosong" bukan perkara
-- yang sama, dan menggugurkan lajur adalah muktamad.

update public.program_settings ps
   set max_peserta = x.had
  from (
    select program_setting_id, max(max_peserta) as had
    from public.program_siri_settings
    where max_peserta is not null
    group by program_setting_id
  ) x
 where x.program_setting_id = ps.id
   and ps.max_peserta is null;

alter table public.program_siri_settings drop column if exists max_peserta;


-- ============================================================
-- 3. check_siri_availability — had dari program, tarikh dari siri
-- ============================================================
-- Parameter baharu p_minta: §13.5 langkah 4 perlu menjawab "ada ruang untuk
-- N orang ini?" dan bukan sekadar "ada ruang?". Tanpa itu, bil dijana untuk
-- 40 peserta ke dalam 3 tempat yang tinggal, dan kegagalan hanya muncul
-- selepas duit diterima.
--
-- Fungsi lama digugurkan dahulu: menambah parameter berdefault mencipta
-- tandatangan KEDUA, dan panggilan empat-argumen sedia ada akan menjadi
-- taksa antara keduanya.

drop function if exists public.check_siri_availability(uuid, uuid, integer, smallint);

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

  select ps.max_peserta into v_max
  from public.program_settings ps where ps.id = v_ps_id;

  -- Tarikh tutup dan penutupan manual kekal per siri. Ketiadaan baris
  -- bermakna siri itu terbuka tanpa tarikh tutupnya sendiri — bukan bermakna
  -- program itu tiada had.
  select pss.is_closed, pss.payment_deadline
    into v_closed, v_deadline
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
-- 4. claim_siri_seats — kunci berpindah ke baris yang memegang had
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

  -- KUNCI BARIS YANG MEMEGANG HAD. Permintaan serentak bagi program yang sama
  -- BERATUR di sini. Tanpa ini, dua sekolah yang membayar serentak untuk
  -- tempat terakhir akan kedua-duanya nampak ruang kosong dan kedua-duanya
  -- masuk.
  select ps.max_peserta into v_max
  from public.program_settings ps
  where ps.id = v_ps_id
  for update;

  -- Penutupan manual kekal per siri.
  select pss.is_closed into v_closed
  from public.program_siri_settings pss
  where pss.program_setting_id = v_ps_id and pss.siri = v_pay.siri;

  -- Tiada had dan tidak ditutup: tuntut terus.
  if v_max is null and not coalesce(v_closed, false) then
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

  if coalesce(v_closed, false) or (v_max is not null and (v_taken + v_minta) > v_max) then
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

revoke execute on function public.claim_siri_seats(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_siri_seats(uuid, text) to service_role;
