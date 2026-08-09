-- ============================================================
-- MIGRATION 036: Jadual Reconciliation Bayaran
-- ============================================================
-- Rujuk docs/rancangan-payment-online.md §6.4 (lapisan 3).
--
-- pg_cron memanggil Edge Function reconcile-payments melalui pg_net.
-- Kedua-dua extension sudah disahkan aktif semasa Fasa 0.
--
-- KENAPA RAHSIA DISIMPAN DALAM VAULT
--   Perintah yang didaftarkan melalui cron.schedule() tersimpan sebagai TEKS
--   BIASA dalam jadual cron.job, yang boleh dibaca sesiapa yang ada akses
--   pangkalan data. Membenamkan token di situ bermakna sesiapa yang boleh
--   membaca cron.job boleh memanggil fungsi reconciliation.
--
--   Sebaliknya cron memanggil satu fungsi pembungkus, dan fungsi itu yang
--   membaca rahsia dari Vault semasa jalan.
--
-- SELEPAS MIGRASI INI, DUA LANGKAH MANUAL DIPERLUKAN:
--   1. Baca rahsia yang dijana:
--        select public.reconciliation_secret_sekali();
--   2. Tetapkan nilai yang SAMA sebagai rahsia Edge Function:
--        npx supabase secrets set RECONCILE_SECRET=<nilai>
--        npx supabase functions deploy reconcile-payments --no-verify-jwt
--
--   Tanpa langkah 2, setiap larian cron akan mendapat 401 dan reconciliation
--   tidak pernah berjalan — secara senyap.
-- ============================================================


-- ============================================================
-- 1. Rahsia kongsi dalam Vault
-- ============================================================

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
  -- Hanya developer/admin boleh membacanya.
  if (select role from public.profiles where id = auth.uid())
     not in ('developer', 'admin') then
    raise exception 'Hanya developer atau admin boleh membaca rahsia ini';
  end if;

  select id into v_id from vault.secrets where name = 'reconcile_secret';

  if v_id is null then
    v_secret := encode(gen_random_bytes(24), 'hex');
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

revoke execute on function public.reconciliation_secret_sekali() from public;
grant execute on function public.reconciliation_secret_sekali() to authenticated;


-- ============================================================
-- 2. Pembungkus yang cron panggil
-- ============================================================
-- Rahsia dibaca di dalam fungsi, jadi ia tidak pernah muncul dalam cron.job.

create or replace function public.run_payment_reconciliation()
returns void
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'reconcile_secret';

  if v_secret is null then
    raise notice 'reconcile_secret belum dijana — reconciliation dilangkau';
    return;
  end if;

  -- pg_net bersifat fire-and-forget: ia memulangkan id permintaan dan tidak
  -- menunggu respons. Itu betul di sini — Edge Function melakukan kerjanya
  -- dan menulis sendiri ke pangkalan data.
  perform net.http_post(
    url := 'https://jvjxeckzmokoqjfsuene.supabase.co/functions/v1/reconcile-payments',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-reconcile-secret', v_secret
    ),
    body := '{}'::jsonb
  );
end;
$$;

revoke execute on function public.run_payment_reconciliation() from public;
grant execute on function public.run_payment_reconciliation() to service_role;


-- ============================================================
-- 3. Jadual
-- ============================================================
-- Setiap 5 minit. Edge Function hanya menyentuh bil yang berusia sekurang-
-- kurangnya 5 minit, jadi webhook sentiasa mendapat peluang dahulu.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'payment_reconciliation') then
    perform cron.unschedule('payment_reconciliation');
  end if;

  perform cron.schedule(
    'payment_reconciliation',
    '*/5 * * * *',
    'select public.run_payment_reconciliation()'
  );
end $$;

comment on function public.run_payment_reconciliation() is
  'Dipanggil oleh pg_cron setiap 5 minit. Membaca rahsia kongsi dari Vault '
  'supaya ia tidak tersimpan sebagai teks biasa dalam cron.job.';
