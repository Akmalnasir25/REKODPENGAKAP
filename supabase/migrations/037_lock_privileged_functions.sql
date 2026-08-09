-- ============================================================
-- MIGRATION 037: Kunci fungsi berkeistimewaan  ⚠ KESELAMATAN
-- ============================================================
--
-- LUBANG YANG DIBETULKAN
--   Supabase menetapkan default privileges yang memberi EXECUTE kepada `anon`
--   dan `authenticated` bagi SETIAP fungsi baharu dalam skema public.
--
--   Migrasi 029, 032, 033 dan 036 menulis:
--       revoke execute on function ... from public;
--       grant  execute on function ... to service_role;
--
--   `REVOKE ... FROM public` TIDAK membatalkan geran eksplisit kepada anon dan
--   authenticated. Jadi fungsi yang sepatutnya service_role sahaja kekal
--   terbuka kepada sesiapa yang memegang anon key — yang tertanam dalam kod
--   frontend dan boleh dibaca sesiapa.
--
--   Disahkan terhadap produksi sebelum pembetulan ini:
--       read_gateway_secret   anon -> HTTP 200
--       finalize_payment      anon -> HTTP 200
--
--   finalize_payment yang paling teruk: create-payment-bill memulangkan
--   paymentId ke pelayar sekolah, jadi sekolah boleh memanggilnya dengan ID
--   mereka sendiri dan menandakan bil sebagai 'paid' tanpa membayar apa-apa.
--   Itu memusnahkan seluruh pintu bayaran.
--
-- PELAJARAN
--   Pada Supabase, `revoke from public` tidak memadai. Peranan anon dan
--   authenticated mesti dinamakan secara eksplisit.
-- ============================================================

do $$
declare
  v_fn text;
  v_senarai text[] := array[
    'public.create_gateway_secret(text, text)',
    'public.update_gateway_secret(uuid, text)',
    'public.read_gateway_secret(uuid)',
    'public.claim_siri_seats(uuid, text)',
    'public.siri_seats_taken(uuid, smallint, uuid)',
    'public.finalize_payment(uuid, text)',
    'public.run_payment_reconciliation()'
  ];
begin
  foreach v_fn in array v_senarai loop
    -- Cabut daripada ketiga-tiga: public menutup lalai, anon dan
    -- authenticated menutup geran eksplisit Supabase.
    execute format('revoke execute on function %s from public, anon, authenticated', v_fn);
    execute format('grant execute on function %s to service_role', v_fn);
  end loop;
end $$;


-- ============================================================
-- reconciliation_secret_sekali — admin sahaja
-- ============================================================
-- Kekal terbuka kepada `authenticated` kerana ia mempunyai semakan peranan
-- DI DALAM fungsi (developer/admin sahaja). anon dicabut kerana anon tiada
-- profil, jadi semakan itu tidak bermakna untuknya.

revoke execute on function public.reconciliation_secret_sekali() from public, anon;
grant execute on function public.reconciliation_secret_sekali() to authenticated;


-- ============================================================
-- gen_random_bytes tidak tersedia
-- ============================================================
-- pgcrypto tidak dipasang pada projek ini, jadi gen_random_bytes() gagal dan
-- rahsia reconciliation tidak pernah dijana. gen_random_uuid() pula terbina
-- dalam Postgres sejak v13 — dua daripadanya memberi 64 aksara hex rawak,
-- lebih daripada cukup untuk token dalaman antara cron dan Edge Function.

create or replace function public.reconciliation_secret_sekali()
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_id uuid;
  v_secret text;
begin
  if (select role from public.profiles where id = auth.uid())
     not in ('developer', 'admin') then
    raise exception 'Hanya developer atau admin boleh membaca rahsia ini';
  end if;

  select id into v_id from vault.secrets where name = 'reconcile_secret';

  if v_id is null then
    v_secret := replace(gen_random_uuid()::text, '-', '')
             || replace(gen_random_uuid()::text, '-', '');
    perform vault.create_secret(
      v_secret, 'reconcile_secret',
      'Rahsia kongsi antara pg_cron dan Edge Function reconcile-payments.'
    );
    return v_secret;
  end if;

  select decrypted_secret into v_secret from vault.decrypted_secrets where id = v_id;
  return v_secret;
end;
$$;

revoke execute on function public.reconciliation_secret_sekali() from public, anon;
grant execute on function public.reconciliation_secret_sekali() to authenticated;


-- ============================================================
-- Pengesahan
-- ============================================================
-- Selepas migrasi, ini sepatutnya memulangkan SIFAR baris. Baris yang keluar
-- bermakna fungsi berkeistimewaan masih boleh dipanggil dari pelayar.
--
--   select p.proname, r.rolname
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   cross join lateral (values ('anon'), ('authenticated')) as r(rolname)
--   where n.nspname = 'public'
--     and p.proname in ('read_gateway_secret','finalize_payment','claim_siri_seats',
--                       'create_gateway_secret','update_gateway_secret',
--                       'siri_seats_taken','run_payment_reconciliation')
--     and has_function_privilege(r.rolname, p.oid, 'EXECUTE');
