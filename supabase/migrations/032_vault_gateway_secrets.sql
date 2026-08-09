-- ============================================================
-- MIGRATION 032: Pembungkus Vault untuk Kunci Gateway
-- ============================================================
-- Skema `vault` tidak terdedah kepada PostgREST, jadi Edge Function tidak
-- boleh memanggil vault.create_secret() secara terus. Migrasi ini menyediakan
-- tiga pembungkus dalam `public` — sempit, khusus untuk kunci gateway, dan
-- dihadkan kepada service_role sahaja.
--
-- KENAPA PEMBUNGKUS SEMPIT, BUKAN AKSES VAULT UMUM
--   Mendedahkan vault.create_secret() secara am bermakna mana-mana kod yang
--   berjaya memanggil RPC boleh membaca ATAU menulis apa-apa rahsia dalam
--   sistem. Tiga fungsi ini hanya melakukan apa yang aliran gateway perlukan,
--   dan read_gateway_secret() memulangkan kunci hanya kepada service_role —
--   yang bermakna hanya Edge Function, tidak pernah browser.
--
-- Rujuk docs/rancangan-payment-online.md §3.3, §6.3.
-- ============================================================


-- ============================================================
-- 1. create_gateway_secret
-- ============================================================

create or replace function public.create_gateway_secret(
  p_secret text,
  p_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_id uuid;
begin
  if p_secret is null or length(trim(p_secret)) = 0 then
    raise exception 'Kunci rahsia tidak boleh kosong';
  end if;

  select vault.create_secret(
    p_secret,
    p_name,
    'Kunci rahsia gateway pembayaran. Ditulis oleh Edge Function save-gateway-settings.'
  ) into v_id;

  return v_id;
end;
$$;


-- ============================================================
-- 2. update_gateway_secret
-- ============================================================

create or replace function public.update_gateway_secret(
  p_id uuid,
  p_secret text
)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  if p_secret is null or length(trim(p_secret)) = 0 then
    raise exception 'Kunci rahsia tidak boleh kosong';
  end if;

  perform vault.update_secret(p_id, p_secret);
end;
$$;


-- ============================================================
-- 3. read_gateway_secret
-- ============================================================
-- Dipanggil oleh Edge Function semasa mencipta bil dan semasa double-check
-- webhook. TIDAK PERNAH boleh dicapai dari browser — lihat GRANT di bawah.

create or replace function public.read_gateway_secret(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where id = p_id;

  return v_secret;
end;
$$;


-- ============================================================
-- 4. Kebenaran — service_role sahaja
-- ============================================================
-- Postgres memberi EXECUTE kepada PUBLIC secara lalai bagi fungsi baharu.
-- Tanpa cabutan ini, mana-mana pengguna yang log masuk boleh memanggil
-- read_gateway_secret() dan mendapatkan kunci rahsia ToyyibPay.
--
-- Mencabut daripada PUBLIC turut mencabut daripada service_role, jadi ia
-- mesti dikembalikan secara eksplisit.

revoke execute on function public.create_gateway_secret(text, text) from public;
revoke execute on function public.update_gateway_secret(uuid, text)  from public;
revoke execute on function public.read_gateway_secret(uuid)          from public;

grant execute on function public.create_gateway_secret(text, text) to service_role;
grant execute on function public.update_gateway_secret(uuid, text)  to service_role;
grant execute on function public.read_gateway_secret(uuid)          to service_role;

comment on function public.read_gateway_secret(uuid) is
  'Memulangkan kunci rahsia gateway. service_role SAHAJA — tidak pernah '
  'boleh dipanggil dari browser. Digunakan oleh Edge Function untuk mencipta '
  'bil dan mengesahkan callback.';
