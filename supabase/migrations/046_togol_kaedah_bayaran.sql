-- ============================================================
-- MIGRATION 046: Togol kaedah bayaran ikut skop
-- ============================================================
-- Rujuk docs/rancangan-payment-online.md §5.1.
--
-- KENAPA PADA TETAPAN GATEWAY, BUKAN PER PROGRAM
--   "Daerah ini menerima cek" ialah dasar organisasi, bukan sifat program.
--   Meletakkannya pada program bermakna ia perlu ditetapkan semula bagi
--   setiap program dan setiap tahun, dan ia akan menyimpang.
--
-- LALAI MESTI BENAR
--   Skop tanpa baris gateway langsung (daerah tanpa ToyyibPay) mesti terus
--   menawarkan pindahan bank dan cek seperti sebelum ini. Lalai palsu akan
--   mematikan bayaran manual untuk setiap daerah yang belum menyediakan
--   gateway — iaitu kebanyakan daerah.
--
--   Sebab itu get_payment_methods di bawah SENTIASA memulangkan satu baris,
--   walaupun tiada gateway. Versi lama memulangkan sifar baris, dan pemanggil
--   terpaksa meneka maksudnya.
-- ============================================================

alter table public.payment_gateway_settings
  add column if not exists allow_fpx           boolean not null default true,
  add column if not exists allow_bank_transfer boolean not null default true,
  add column if not exists allow_cheque        boolean not null default true;

comment on column public.payment_gateway_settings.allow_fpx is
  'Togol paparan. FPX juga memerlukan kredensial sah — togol ini tidak boleh '
  'menghidupkannya tanpa akaun yang berfungsi.';


-- Lajur pulangan bertambah, jadi jenis barisnya berubah — dan `create or
-- replace` tidak boleh mengubah jenis baris OUT. Fungsi lama digugurkan
-- dahulu. Pemanggilnya semua melalui RPC dengan nama, jadi tiada kebergantungan
-- yang perlu disusun semula selepas ini.
drop function if exists public.get_payment_methods(text, integer);

create or replace function public.get_payment_methods(
  p_badge_name text,
  p_year integer
)
returns table (
  bank_account_info   text,
  online_available    boolean,
  allow_bank_transfer boolean,
  allow_cheque        boolean
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
  v_gw record;
begin
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

  select g.* into v_gw
  from public.payment_gateway_settings g
  where g.provider = 'toyyibpay'
    and (
      (v_scope = 'negeri' and g.negeri_id is not distinct from v_negeri and g.daerah_id is null)
      or
      (v_scope = 'daerah' and g.daerah_id is not distinct from v_daerah and g.negeri_id is null)
    )
  limit 1;

  -- Satu baris SENTIASA dipulangkan. Ketiadaan gateway bermakna "tiada
  -- bayaran online", bukan "tiada kaedah bayaran langsung".
  return query select
    v_gw.bank_account_info,
    coalesce(v_gw.is_active and v_gw.allow_fpx
             and v_gw.category_code is not null
             and v_gw.secret_vault_id is not null, false),
    coalesce(v_gw.allow_bank_transfer, true),
    coalesce(v_gw.allow_cheque, true);
end;
$$;

grant execute on function public.get_payment_methods(text, integer) to authenticated;

comment on function public.get_payment_methods(text, integer) is
  'Kaedah bayaran yang skrin sekolah patut paparkan. Sentiasa satu baris — '
  'skop tanpa gateway tetap menawarkan pindahan bank dan cek.';


-- ============================================================
-- View berskop mesti disusun semula
-- ============================================================
-- Lajur disenaraikan satu per satu di sini, jadi menambah lajur pada jadual
-- asas TIDAK menjadikannya kelihatan. Tanpa langkah ini kad tetapan membaca
-- undefined bagi ketiga-tiga togol, dan setiap simpanan menetapkannya semula
-- kepada lalai — togol yang dimatikan akan hidup semula dengan sendirinya.

drop view if exists public.payment_gateway_settings_public;
create view public.payment_gateway_settings_public as
select
  id, negeri_id, daerah_id, provider,
  category_code, masked_key, bank_account_info,
  transaction_fee_flat, is_sandbox, is_active, verified_at,
  allow_fpx, allow_bank_transfer, allow_cheque,
  created_at, updated_at
from public.payment_gateway_settings
where case public.get_my_role()
        when 'developer'    then true
        when 'admin'        then true
        when 'negeri_admin' then negeri_id = public.get_my_negeri_id()
        when 'daerah_admin' then daerah_id = public.get_my_daerah_id()
        else false
      end;

grant select on public.payment_gateway_settings_public to authenticated;
