-- ============================================================
-- MIGRATION 042: Semakan bukti bayaran di peringkat BIL
-- ============================================================
-- Rujuk docs/rancangan-payment-online.md §13.6.
--
-- KENAPA
--   Satu slip bank membayar keseluruhan siri. Bukti dilampirkan pada bil,
--   bukan pada satu baris program. Membenarkan admin menerima bukti bagi
--   satu program dan menolaknya bagi program lain dalam bil yang SAMA tidak
--   masuk akal — ia satu bayaran, satu keputusan.
--
--   Pengesahan PENDAFTARAN kekal per program (keputusan 13b). Yang berubah
--   di sini hanyalah pengesahan WANG.
--
-- Fungsi lama dikekalkan untuk baris sejarah? Tidak. Setiap bayaran kini
-- mempunyai bil (migrasi 040), termasuk yang lama, jadi laluan bil meliputi
-- kesemuanya. Menyimpan dua fungsi bermakna dua tempat untuk menyimpang.
-- ============================================================

drop function if exists public.admin_review_payment(uuid, boolean, text);

create or replace function public.admin_review_payment(
  p_payment_id uuid,        -- kini id BIL; nama dikekalkan supaya klien lama tidak pecah
  p_terima boolean,
  p_sebab text default null
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
  v_sekolah_negeri uuid;
  v_sekolah_daerah uuid;
begin
  select role, negeri_id, daerah_id into v_role, v_negeri, v_daerah
  from public.profiles where id = auth.uid();

  if v_role is null or v_role not in ('developer', 'admin', 'negeri_admin', 'daerah_admin') then
    return jsonb_build_object('ok', false, 'sebab', 'tiada_kebenaran');
  end if;

  select * into v_bil from public.payment_bills where id = p_payment_id;
  if not found then
    return jsonb_build_object('ok', false, 'sebab', 'bayaran_tidak_dijumpai');
  end if;

  -- Admin berskop hanya boleh menyemak bayaran dalam skop sendiri.
  select negeri_id, daerah_id into v_sekolah_negeri, v_sekolah_daerah
  from public.schools where id = v_bil.school_id;

  if v_role = 'negeri_admin' and v_sekolah_negeri is distinct from v_negeri then
    return jsonb_build_object('ok', false, 'sebab', 'luar_skop');
  end if;
  if v_role = 'daerah_admin' and v_sekolah_daerah is distinct from v_daerah then
    return jsonb_build_object('ok', false, 'sebab', 'luar_skop');
  end if;

  -- Hanya bukti yang sedang menunggu semakan boleh disemak. Ini menghalang
  -- admin daripada "mengesahkan" bayaran ToyyibPay yang sudah automatik, atau
  -- menghidupkan semula bil yang telah dibatalkan.
  if v_bil.status <> 'pending_review' then
    return jsonb_build_object('ok', false, 'sebab', 'bukan_menunggu_semakan', 'status', v_bil.status);
  end if;

  if p_terima then
    -- Tempat sudah dituntut semasa bukti dihantar (pending_review mengambil
    -- tempat), jadi pengesahan hanya menaikkan status. Tiada penuntutan
    -- kedua — itu akan mengira peserta yang sama dua kali.
    update public.payment_bills
       set status = 'paid', confirmed_by = auth.uid(), confirmed_at = now(),
           rejected_reason = null
     where id = p_payment_id;

    update public.payments
       set status = 'paid', confirmed_by = auth.uid(), confirmed_at = now(),
           rejected_reason = null
     where bill_id = p_payment_id and status = 'pending_review';

    update public.school_badge_status sbs
       set payment_status = 'paid'
      from public.payments p
     where p.bill_id = p_payment_id
       and sbs.school_id = p.school_id and sbs.badge_id = p.badge_id
       and sbs.year = p.year and sbs.siri = p.siri;

  else
    if p_sebab is null or length(trim(p_sebab)) = 0 then
      return jsonb_build_object('ok', false, 'sebab', 'sebab_diperlukan');
    end if;

    -- Ditolak: tempat DILEPASKAN. Kiraan tempat mengira status
    -- paid/pending_review sahaja, jadi menukar status kepada 'rejected'
    -- sudah cukup — tiada kaunter untuk dikurangkan.
    update public.payment_bills
       set status = 'rejected', rejected_reason = trim(p_sebab),
           confirmed_by = auth.uid(), confirmed_at = now()
     where id = p_payment_id;

    update public.payments
       set status = 'rejected', rejected_reason = trim(p_sebab),
           confirmed_by = auth.uid(), confirmed_at = now()
     where bill_id = p_payment_id and status = 'pending_review';

    -- Pendaftaran kembali menunggu bayaran. Program yang SUDAH disahkan tidak
    -- ditolak balik — mengeluarkan sekolah dari statistik kerana satu bukti
    -- ditolak adalah tindak balas yang terlalu keras.
    update public.school_badge_status sbs
       set payment_status = 'rejected',
           status = case when sbs.status = 'approved' then sbs.status else 'reopened' end
      from public.payments p
     where p.bill_id = p_payment_id
       and sbs.school_id = p.school_id and sbs.badge_id = p.badge_id
       and sbs.year = p.year and sbs.siri = p.siri;
  end if;

  insert into public.audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, details)
  values (auth.uid(), v_role,
          case when p_terima then 'bukti_bayaran_disahkan' else 'bukti_bayaran_ditolak' end,
          'payment_bills', p_payment_id::text,
          jsonb_build_object('sebab', p_sebab));

  return jsonb_build_object('ok', true, 'status', case when p_terima then 'paid' else 'rejected' end);
end;
$$;

revoke execute on function public.admin_review_payment(uuid, boolean, text) from public, anon;
grant execute on function public.admin_review_payment(uuid, boolean, text) to authenticated;

comment on function public.admin_review_payment(uuid, boolean, text) is
  'Menerima id BIL. Satu slip bank membayar keseluruhan siri, jadi ia satu '
  'keputusan untuk semua program dalam bil itu. Pengesahan PENDAFTARAN kekal '
  'per program dan tidak disentuh di sini.';


-- ============================================================
-- 3. Bukti bayaran berpindah dari baris program ke BIL
-- ============================================================
-- attachments.payment_id menunjuk kepada payments. Satu slip bank kini
-- membayar keseluruhan siri, jadi ia mesti menunjuk kepada bil — jika tidak
-- submit-payment-proof menghantar id bil ke lajur yang merujuk jadual lain,
-- dan setiap muat naik gagal dengan pelanggaran kunci asing.
--
-- Baris sedia ada dipetakan melalui payments.bill_id. Migrasi 040 mencipta
-- bil 1:1 untuk setiap bayaran lama, jadi pemetaan ini lengkap.

alter table public.attachments drop constraint if exists attachments_payment_id_fkey;

update public.attachments a
   set payment_id = p.bill_id
  from public.payments p
 where a.payment_id = p.id;

alter table public.attachments
  add constraint attachments_payment_id_fkey
  foreign key (payment_id) references public.payment_bills(id) on delete cascade;

comment on column public.attachments.payment_id is
  'Merujuk payment_bills, bukan payments. Satu bukti bayaran meliputi '
  'keseluruhan bil — semua program dalam satu siri.';

-- Polisi delete membaca status bayaran; ia mesti membaca status BIL sekarang.
drop policy if exists "attachments_delete" on public.attachments;
create policy "attachments_delete" on public.attachments
  for delete to authenticated using (
    public.is_admin_or_above()
    or (
      category = 'payment_proof'
      and public.can_access_submission(submission_id)
      and exists (
        select 1 from public.payment_bills b
        where b.id = attachments.payment_id
          and b.status = 'pending_review'
      )
    )
  );


-- ============================================================
-- 4. Polisi storan: segmen laluan kini id BIL
-- ============================================================
-- Laluan objek ialah <id>/<nama-fail>. Sebelum ini <id> ialah id bayaran;
-- kini ia id bil. Membiarkan polisi memadankan payments bermakna setiap muat
-- naik ditolak oleh RLS — dan mesejnya tidak akan menyebut sebabnya.

drop policy if exists "payment_proof_insert" on storage.objects;
create policy "payment_proof_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and exists (
      select 1 from public.payment_bills b
      where b.id::text = split_part(storage.objects.name, '/', 1)
    )
  );

drop policy if exists "payment_proof_select" on storage.objects;
create policy "payment_proof_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and exists (
      select 1 from public.payment_bills b
      where b.id::text = split_part(storage.objects.name, '/', 1)
    )
  );

comment on policy "payment_proof_select" on storage.objects is
  'Skop diwarisi dari RLS payment_bills — sekolah nampak bukti sendiri, admin '
  'nampak yang dalam daerah/negeri mereka. Jangan tulis semula syarat skop '
  'di sini; satu sumber kebenaran sahaja.';
