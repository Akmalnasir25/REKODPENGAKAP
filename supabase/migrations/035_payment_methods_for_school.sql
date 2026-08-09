-- ============================================================
-- MIGRATION 035: get_payment_methods — apa yang sekolah boleh lihat
-- ============================================================
-- Rujuk docs/rancangan-payment-online.md §5.1.
--
-- MASALAH YANG DIBETULKAN
--   View payment_gateway_settings_public (migrasi 028) berakhir dengan
--   `else false`, jadi pengguna sekolah tidak mendapat sebarang baris. Ia
--   direka untuk admin membaca tetapan mereka sendiri.
--
--   Tetapi sekolah juga perlu tahu dua perkara sebelum boleh membayar:
--     - adakah bayaran online tersedia untuk daerah/negeri mereka
--     - ke akaun bank mana hendak membuat pindahan
--
--   Kesannya: skrin bayaran memaparkan pindahan bank & cek tanpa nombor
--   akaun, dan tidak pernah menawarkan ToyyibPay walaupun akaun wujud.
--
-- KENAPA FUNGSI, BUKAN MEMBUKA VIEW ITU
--   Membuka view kepada sekolah turut mendedahkan category_code. Ia bukan
--   rahsia, tetapi tiada sebab sekolah memerlukannya. Fungsi ini memulangkan
--   TEPAT dua medan yang skrin bayaran perlukan, dan tiada yang lain.
--
--   Skop diselesaikan mengikut skop BADGE — sama seperti create-payment-bill,
--   supaya apa yang sekolah nampak sepadan dengan akaun yang sebenarnya
--   akan digunakan.
-- ============================================================

create or replace function public.get_payment_methods(
  p_badge_name text,
  p_year integer
)
returns table (
  bank_account_info text,
  online_available boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
  v_badge_id uuid;
  v_scope text;
  v_negeri uuid;
  v_daerah uuid;
begin
  -- Sekolah pemanggil. Admin yang memanggil tanpa sekolah tidak mendapat
  -- apa-apa di sini — mereka membaca melalui view berskop mereka sendiri.
  select school_id into v_school_id from public.profiles where id = auth.uid();
  if v_school_id is null then
    return;
  end if;

  select b.id, coalesce(b.scope, 'daerah') into v_badge_id, v_scope
  from public.badges b where b.name = p_badge_name;
  if v_badge_id is null then
    return;
  end if;

  select s.negeri_id, s.daerah_id into v_negeri, v_daerah
  from public.schools s where s.id = v_school_id;

  return query
  select
    g.bank_account_info,
    -- ToyyibPay ditawarkan hanya bila akaun benar-benar boleh digunakan.
    -- Kredensial yang hilang bermakna cipta bil akan gagal, jadi lebih baik
    -- pilihan itu tidak muncul langsung daripada gagal selepas diklik.
    (g.is_active and g.category_code is not null and g.secret_vault_id is not null) as online_available
  from public.payment_gateway_settings g
  where g.provider = 'toyyibpay'
    and (
      (v_scope = 'negeri' and g.negeri_id is not distinct from v_negeri and g.daerah_id is null)
      or
      (v_scope = 'daerah' and g.daerah_id is not distinct from v_daerah and g.negeri_id is null)
    )
  limit 1;
end;
$$;

grant execute on function public.get_payment_methods(text, integer) to authenticated;

comment on function public.get_payment_methods(text, integer) is
  'Dua medan yang skrin bayaran sekolah perlukan: maklumat akaun bank dan '
  'sama ada bayaran online tersedia. Skop diselesaikan ikut skop badge, sama '
  'seperti create-payment-bill, supaya paparan sepadan dengan akaun sebenar. '
  'Tidak mendedahkan category_code mahupun rujukan Vault.';
