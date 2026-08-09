-- ============================================================
-- MIGRATION 034: admin_review_payment — sahkan / tolak bukti manual
-- ============================================================
-- Rujuk docs/rancangan-payment-online.md §5.2.
--
-- KENAPA FUNGSI DB, BUKAN EDGE FUNCTION
--   Tiada panggilan HTTP terlibat — ini semata-mata peralihan status. Edge
--   Function akan menambah satu deployment lagi untuk diselaraskan tanpa
--   memberi apa-apa.
--
-- KENAPA BUKAN POLISI RLS BIASA
--   `payments` sengaja tiada polisi tulis (migrasi 028). Membukanya untuk
--   admin bermakna mana-mana admin boleh menetapkan apa-apa status pada
--   apa-apa bayaran melalui pelayar — termasuk menanda 'paid' tanpa duit.
--   Fungsi ini membenarkan tepat DUA peralihan, dan tiada yang lain.

create or replace function public.admin_review_payment(
  p_payment_id uuid,
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
  v_pay public.payments%rowtype;
  v_role text;
  v_negeri uuid;
  v_daerah uuid;
  v_sekolah_negeri uuid;
  v_sekolah_daerah uuid;
  v_hasil jsonb;
begin
  select role, negeri_id, daerah_id into v_role, v_negeri, v_daerah
  from public.profiles where id = auth.uid();

  if v_role is null or v_role not in ('developer', 'admin', 'negeri_admin', 'daerah_admin') then
    return jsonb_build_object('ok', false, 'sebab', 'tiada_kebenaran');
  end if;

  select * into v_pay from public.payments where id = p_payment_id;
  if not found then
    return jsonb_build_object('ok', false, 'sebab', 'bayaran_tidak_dijumpai');
  end if;

  -- Admin berskop hanya boleh menyemak bayaran dalam skop sendiri.
  select negeri_id, daerah_id into v_sekolah_negeri, v_sekolah_daerah
  from public.schools where id = v_pay.school_id;

  if v_role = 'negeri_admin' and v_sekolah_negeri is distinct from v_negeri then
    return jsonb_build_object('ok', false, 'sebab', 'luar_skop');
  end if;
  if v_role = 'daerah_admin' and v_sekolah_daerah is distinct from v_daerah then
    return jsonb_build_object('ok', false, 'sebab', 'luar_skop');
  end if;

  -- Hanya bukti yang sedang menunggu semakan boleh disemak. Ini menghalang
  -- admin daripada "mengesahkan" bayaran ToyyibPay yang sudah automatik, atau
  -- menghidupkan semula bayaran yang telah dibatalkan.
  if v_pay.status <> 'pending_review' then
    return jsonb_build_object('ok', false, 'sebab', 'bukan_menunggu_semakan', 'status', v_pay.status);
  end if;

  if p_terima then
    -- Tempat sudah dituntut semasa bukti dihantar (pending_review mengambil
    -- tempat), jadi pengesahan hanya menaikkan status. Tiada penuntutan
    -- kedua — itu akan mengira peserta yang sama dua kali.
    update public.payments
       set status = 'paid',
           confirmed_by = auth.uid(),
           confirmed_at = now(),
           rejected_reason = null
     where id = p_payment_id;

    update public.school_badge_status
       set payment_status = 'paid'
     where school_id = v_pay.school_id and badge_id = v_pay.badge_id
       and year = v_pay.year and siri = v_pay.siri;

    v_hasil := jsonb_build_object('ok', true, 'status', 'paid');
  else
    if p_sebab is null or length(trim(p_sebab)) = 0 then
      return jsonb_build_object('ok', false, 'sebab', 'sebab_diperlukan');
    end if;

    -- Ditolak: tempat DILEPASKAN. Kiraan tempat mengira status
    -- paid/pending_review sahaja, jadi menukar status kepada 'rejected'
    -- sudah cukup — tiada kaunter untuk dikurangkan.
    update public.payments
       set status = 'rejected',
           rejected_reason = trim(p_sebab),
           confirmed_by = auth.uid(),
           confirmed_at = now()
     where id = p_payment_id;

    -- Pendaftaran kembali menunggu bayaran. Program yang SUDAH disahkan tidak
    -- ditolak balik — mengeluarkan sekolah dari statistik kerana satu bukti
    -- ditolak adalah tindak balas yang terlalu keras.
    update public.school_badge_status
       set payment_status = 'rejected',
           status = case when status = 'approved' then status else 'reopened' end
     where school_id = v_pay.school_id and badge_id = v_pay.badge_id
       and year = v_pay.year and siri = v_pay.siri;

    v_hasil := jsonb_build_object('ok', true, 'status', 'rejected');
  end if;

  insert into public.audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, details)
  values (auth.uid(), v_role,
          case when p_terima then 'bukti_bayaran_disahkan' else 'bukti_bayaran_ditolak' end,
          'payments', p_payment_id::text,
          jsonb_build_object('sebab', p_sebab));

  return v_hasil;
end;
$$;

-- Dipanggil dari pelayar oleh admin; kebenaran disemak DI DALAM fungsi.
grant execute on function public.admin_review_payment(uuid, boolean, text) to authenticated;

comment on function public.admin_review_payment(uuid, boolean, text) is
  'Sahkan atau tolak bukti bayaran manual. Membenarkan tepat dua peralihan '
  'dari pending_review, dengan semakan skop admin di dalam. payments kekal '
  'tanpa polisi tulis supaya tiada laluan lain wujud.';
