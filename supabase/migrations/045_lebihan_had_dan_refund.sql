-- ============================================================
-- MIGRATION 045: Bayaran melebihi had masuk giliran; status refunded
-- ============================================================
-- Rujuk docs/rancangan-payment-online.md §13.14.
--
-- MASALAH
--   Sekolah yang membayar selepas tempat habis ditanda 'no_seat', dan
--   pendaftarannya KEKAL DRAF. Ia tidak pernah masuk giliran pengesahan, dan
--   tiada apa membawanya masuk selepas itu: menaikkan had tidak menuntut
--   semula tempat, dan sekolah tidak boleh menekan Hantar semula kerana
--   programnya sudah dibayar.
--
--   Sekolah itu tersekat — sudah bayar, ada tempat kosong, tidak boleh masuk.
--   Satu-satunya jalan keluar ialah mengubah pangkalan data secara manual.
--
-- KEPUTUSAN
--   Duit sudah diterima, jadi pendaftaran SENTIASA masuk giliran pengesahan,
--   ditanda melebihi had. Admin yang memutuskan: terima (masuk statistik
--   walaupun melebihi) atau tolak (refund).
--
--   Pintu keras kekal di tempat asalnya — semasa bil dijana. Tempat penuh
--   bermakna tiada bil, jadi lebihan hanya boleh berlaku melalui perlumbaan
--   serentak, bukan aliran berterusan.
--
-- KENAPA 'refunded' WAJIB
--   Tanpa peralihan status sebenar, bayaran yang di-refund secara manual
--   kekal 'paid': ia terus mengambil tempat yang sepatutnya dilepaskan, dan
--   terus dikira sebagai kutipan yang sudah dipulangkan. Angka kewangan
--   menyimpang dari wang sebenar tanpa sesiapa perasan.
-- ============================================================


-- ============================================================
-- 1. Status refunded
-- ============================================================

alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments
  add constraint payments_status_check
  check (status in ('pending', 'pending_review', 'paid', 'rejected', 'failed', 'cancelled', 'refunded'));

alter table public.payment_bills drop constraint if exists payment_bills_status_check;
alter table public.payment_bills
  add constraint payment_bills_status_check
  check (status in ('pending', 'pending_review', 'paid', 'rejected', 'failed', 'cancelled', 'refunded'));


-- ============================================================
-- 2. Tempat dikira tanpa mengira seat_status
-- ============================================================
-- Wang sudah masuk dan orangnya berkemungkinan masuk statistik, jadi tempat
-- itu memang terpakai. seat_status menjadi semata-mata PENANDA PERHATIAN,
-- bukan lagi suis yang menentukan sama ada tempat dikira.
--
-- 'refunded' terkeluar dengan sendirinya kerana ia bukan paid/pending_review.

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
  where ps.id = p_program_setting_id
    and (p_kecuali_payment_id is null or pay.id <> p_kecuali_payment_id);
$$;

revoke execute on function public.siri_seats_taken(uuid, smallint, uuid) from public, anon;
grant execute on function public.siri_seats_taken(uuid, smallint, uuid) to authenticated, service_role;


-- ============================================================
-- 3. claim_siri_seats menanda, tidak lagi menahan
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

  -- KUNCI BARIS YANG MEMEGANG HAD. Permintaan serentak BERATUR di sini, dan
  -- itulah yang menjadikan "dua pertama dapat, ketiga melebihi" boleh
  -- ditentukan langsung — tanpa kunci, ketiga-tiganya nampak ruang kosong.
  select * into v_ps from public.program_settings where id = v_ps_id for update;
  v_max := v_ps.max_peserta;

  select pss.is_closed into v_closed
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

  -- Bayaran DITERIMA walaupun melebihi. Duit sudah masuk; menahan pendaftaran
  -- di luar giliran hanya mencipta keadaan tersekat yang tiada siapa boleh
  -- keluar daripadanya tanpa SQL. Penanda dibawa ke barisan admin.
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

comment on function public.claim_siri_seats(uuid, text) is
  'Sentiasa menerima bayaran. Lebihan had ditanda seat_status = no_seat untuk '
  'perhatian admin, bukan ditahan — menahan mencipta keadaan tersekat yang '
  'hanya SQL boleh keluarkan.';


-- ============================================================
-- 4. finalize_payment sentiasa menghantar pendaftaran
-- ============================================================

create or replace function public.finalize_payment(
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
  v_tuntut jsonb;
  v_lebih boolean;
begin
  select * into v_pay from public.payments where id = p_payment_id;
  if not found then
    return jsonb_build_object('ok', false, 'sebab', 'bayaran_tidak_dijumpai');
  end if;

  v_tuntut := public.claim_siri_seats(p_payment_id, p_new_status);
  if coalesce((v_tuntut ->> 'ok')::boolean, false) = false then
    return jsonb_build_object('ok', false, 'sebab', v_tuntut ->> 'sebab', 'tuntut', v_tuntut);
  end if;
  v_lebih := coalesce((v_tuntut ->> 'melebihi')::boolean, false);

  select * into v_pay from public.payments where id = p_payment_id;

  update public.submissions
     set status = 'submitted'
   where school_id = v_pay.school_id
     and badge_id = v_pay.badge_id
     and submission_year = v_pay.year
     and status = 'draft';

  insert into public.school_badge_status (
    school_id, badge_id, year, siri, status, payment_status, submitted_at
  ) values (
    v_pay.school_id, v_pay.badge_id, v_pay.year, v_pay.siri,
    'submitted', p_new_status, now()
  )
  on conflict (school_id, badge_id, year, siri) do update
    set payment_status = excluded.payment_status,
        -- Program yang SUDAH disahkan tidak ditolak balik kepada 'submitted'
        -- — itu akan mengeluarkan peserta dari statistik semata-mata kerana
        -- bayaran susulan direkodkan.
        status = case when school_badge_status.status = 'approved'
                      then school_badge_status.status
                      else 'submitted' end,
        submitted_at = coalesce(school_badge_status.submitted_at, now());

  return jsonb_build_object(
    'ok', true,
    'melebihi', v_lebih,
    'seatStatus', v_pay.seat_status,
    'paymentStatus', v_pay.status,
    'tuntut', v_tuntut
  );
end;
$$;

revoke execute on function public.finalize_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.finalize_payment(uuid, text) to service_role;

comment on function public.finalize_payment(uuid, text) is
  'Pendaftaran masuk giliran pengesahan walaupun bayaran melebihi had. '
  'Lebihan ialah keputusan admin, bukan penolakan automatik (§13.14).';


-- ============================================================
-- 5. Refund
-- ============================================================
-- Melepaskan tempat, membuka semula pendaftaran, dan mengeluarkan bil dari
-- jumlah kutipan. Wang dipulangkan di luar sistem; ini merekod hakikat itu
-- supaya angka dalam sistem sepadan dengan wang sebenar.

create or replace function public.admin_refund_bill(
  p_bill_id uuid,
  p_sebab text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_bil public.payment_bills%rowtype;
  v_role text;
  v_negeri uuid;
  v_daerah uuid;
  v_sn uuid;
  v_sd uuid;
begin
  select role, negeri_id, daerah_id into v_role, v_negeri, v_daerah
  from public.profiles where id = auth.uid();

  if v_role is null or v_role not in ('developer', 'admin', 'negeri_admin', 'daerah_admin') then
    return jsonb_build_object('ok', false, 'sebab', 'tiada_kebenaran');
  end if;

  if p_sebab is null or length(trim(p_sebab)) = 0 then
    return jsonb_build_object('ok', false, 'sebab', 'sebab_diperlukan');
  end if;

  select * into v_bil from public.payment_bills where id = p_bill_id;
  if not found then
    return jsonb_build_object('ok', false, 'sebab', 'bayaran_tidak_dijumpai');
  end if;

  select negeri_id, daerah_id into v_sn, v_sd from public.schools where id = v_bil.school_id;
  if v_role = 'negeri_admin' and v_sn is distinct from v_negeri then
    return jsonb_build_object('ok', false, 'sebab', 'luar_skop');
  end if;
  if v_role = 'daerah_admin' and v_sd is distinct from v_daerah then
    return jsonb_build_object('ok', false, 'sebab', 'luar_skop');
  end if;

  if v_bil.status not in ('paid', 'pending_review') then
    return jsonb_build_object('ok', false, 'sebab', 'bukan_bayaran_diterima', 'status', v_bil.status);
  end if;

  update public.payment_bills
     set status = 'refunded', rejected_reason = trim(p_sebab),
         confirmed_by = auth.uid(), confirmed_at = now()
   where id = p_bill_id;

  update public.payments
     set status = 'refunded', rejected_reason = trim(p_sebab),
         confirmed_by = auth.uid(), confirmed_at = now()
   where bill_id = p_bill_id;

  -- Pendaftaran kembali menunggu bayaran. Program yang SUDAH disahkan tidak
  -- ditolak balik keluar dari statistik oleh tindakan ini — kalau admin mahu
  -- mengeluarkannya, itu tindakan Buka Semula yang berasingan dan disengajakan.
  update public.school_badge_status sbs
     set payment_status = 'rejected',
         status = case when sbs.status = 'approved' then sbs.status else 'reopened' end
    from public.payments p
   where p.bill_id = p_bill_id
     and sbs.school_id = p.school_id and sbs.badge_id = p.badge_id
     and sbs.year = p.year and sbs.siri = p.siri;

  insert into public.audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, details)
  values (auth.uid(), v_role, 'bayaran_direfund', 'payment_bills', p_bill_id::text,
          jsonb_build_object('sebab', trim(p_sebab), 'jumlah', v_bil.total_amount));

  return jsonb_build_object('ok', true, 'status', 'refunded');
end;
$$;

revoke execute on function public.admin_refund_bill(uuid, text) from public, anon;
grant execute on function public.admin_refund_bill(uuid, text) to authenticated;

comment on function public.admin_refund_bill(uuid, text) is
  'Merekod refund yang dibuat di luar sistem: melepaskan tempat, membuka '
  'semula pendaftaran, dan mengeluarkan bil dari jumlah kutipan. Tanpa ini '
  'bayaran yang dipulangkan kekal dikira sebagai wang yang diterima.';
