-- ============================================================
-- MIGRATION 040: Bayaran peringkat siri — jadual payment_bills
-- ============================================================
-- Rujuk docs/rancangan-payment-online.md §13.
--
-- MASALAH
--   Bayaran berkunci pada (sekolah, program, tahun, siri). Sekolah yang
--   mendaftar Keris Emas dan Keris Perak dalam Siri 2 membayar dua kali,
--   menerima dua resit, dan menekan Hantar dua kali — sedangkan dari sudut
--   mereka ia satu pusingan pendaftaran.
--
-- KENAPA LAPISAN BIL, BUKAN badge_id NULLABLE
--   claim_siri_seats, siri_seats_taken, finalize_payment,
--   enforce_payment_before_approval dan school_badge_status.payment_status
--   SEMUANYA berkunci pada (sekolah, program, tahun, siri) hari ini.
--   Menjadikan payments peringkat bil akan memaksa kelima-limanya berubah
--   serentak, termasuk pencetus kelulusan yang baru dua kali dibetulkan.
--
--   Sebaliknya: payment_bills memiliki WANG dan GATEWAY; payments kekal
--   sebagai baris PROGRAM. Tiada satu pun daripada lima perkara di atas
--   perlu disentuh.
--
-- KENAPA BACKFILL 1:1
--   Setiap bayaran mesti mempunyai bil, termasuk yang sedia ada. Itu
--   meninggalkan SATU laluan kod. Membenarkan bill_id null bermakna setiap
--   pembaca perlu menangani "bil atau baris sendiri" selama-lamanya, dan
--   laluan bercabang seperti itu reput.
--
-- APA YANG MIGRASI INI TIDAK LAKUKAN
--   Ia tidak mengubah kelakuan. Selepas ia berjalan, setiap bil mempunyai
--   tepat satu baris payments, sama seperti sebelum ini. Edge Function yang
--   mencipta bil berbilang program datang kemudian.
-- ============================================================


-- ============================================================
-- 1. Jadual bil
-- ============================================================

create table if not exists public.payment_bills (
  id uuid primary key default gen_random_uuid(),

  -- Kunci logik: satu bil menampung SATU siri bagi satu sekolah.
  school_id uuid not null references public.schools(id) on delete cascade,
  year integer not null,
  siri smallint not null default 1 check (siri >= 1),

  -- amount = hasil tambah yuran baris program (inilah yang penganjur terima).
  -- total_amount = yang sekolah bayar, termasuk caj gateway.
  amount numeric(10,2) not null default 0 check (amount >= 0),
  transaction_fee numeric(10,2) not null default 0 check (transaction_fee >= 0),
  total_amount numeric(10,2) not null default 0 check (total_amount >= 0),

  method text not null default 'toyyibpay'
    check (method in ('toyyibpay', 'bank_transfer', 'cheque', 'cash', 'lain')),
  status text not null default 'pending'
    check (status in ('pending', 'pending_review', 'paid', 'rejected', 'failed', 'cancelled')),

  reference_number text,
  external_bill_code text,
  bill_url text,
  gateway_settings_id uuid references public.payment_gateway_settings(id) on delete set null,
  expires_at timestamptz,

  paid_at timestamptz,
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  rejected_reason text,
  notes text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.payment_bills is
  'Satu bil = satu sekolah × tahun × siri, merangkumi semua program dalam '
  'siri itu. Memiliki wang dan gateway; payments memiliki program.';

comment on column public.payment_bills.amount is
  'Hasil tambah amount baris payments milik bil ini. Bukan termasuk caj gateway.';


-- ============================================================
-- 2. Pautan dari baris program
-- ============================================================

alter table public.payments
  add column if not exists bill_id uuid references public.payment_bills(id) on delete cascade;

create index if not exists idx_payments_bill on public.payments(bill_id);


-- ============================================================
-- 3. Backfill 1:1
-- ============================================================
-- Setiap bayaran sedia ada menjadi bil sendiri. Medan wang dan gateway
-- disalin apa adanya — tiada pengiraan semula, tiada tafsiran.

with baharu as (
  insert into public.payment_bills (
    school_id, year, siri,
    amount, transaction_fee, total_amount,
    method, status,
    reference_number, external_bill_code, bill_url,
    gateway_settings_id, expires_at,
    paid_at, confirmed_by, confirmed_at, rejected_reason, notes,
    created_at, updated_at
  )
  select
    p.school_id, p.year, p.siri,
    p.amount, p.transaction_fee, p.total_amount,
    p.method, p.status,
    p.reference_number, p.external_bill_code, p.bill_url,
    p.gateway_settings_id, p.expires_at,
    p.paid_at, p.confirmed_by, p.confirmed_at, p.rejected_reason, p.notes,
    p.created_at, p.updated_at
  from public.payments p
  where p.bill_id is null
  returning id, external_bill_code, school_id, year, siri, created_at
)
update public.payments p
   set bill_id = b.id
  from baharu b
 where p.bill_id is null
   and p.school_id = b.school_id
   and p.year = b.year
   and p.siri = b.siri
   and p.created_at = b.created_at
   and p.external_bill_code is not distinct from b.external_bill_code;

-- Jaring keselamatan: sebarang baris yang terlepas padanan di atas (cth dua
-- bayaran dengan created_at yang sama tepat dan kod bil null) mendapat bilnya
-- sendiri satu per satu. Diam-diam meninggalkan bill_id null akan
-- menggagalkan `set not null` di bawah dengan mesej yang tidak menjelaskan
-- apa-apa.
do $$
declare
  r record;
  v_id uuid;
begin
  for r in select * from public.payments where bill_id is null loop
    insert into public.payment_bills (
      school_id, year, siri, amount, transaction_fee, total_amount,
      method, status, reference_number, external_bill_code, bill_url,
      gateway_settings_id, expires_at, paid_at, confirmed_by, confirmed_at,
      rejected_reason, notes, created_at, updated_at
    ) values (
      r.school_id, r.year, r.siri, r.amount, r.transaction_fee, r.total_amount,
      r.method, r.status, r.reference_number, r.external_bill_code, r.bill_url,
      r.gateway_settings_id, r.expires_at, r.paid_at, r.confirmed_by, r.confirmed_at,
      r.rejected_reason, r.notes, r.created_at, r.updated_at
    ) returning id into v_id;
    update public.payments set bill_id = v_id where id = r.id;
  end loop;
end $$;

alter table public.payments alter column bill_id set not null;


-- ============================================================
-- 4. Indeks
-- ============================================================

-- Satu bil TERBUKA per sekolah × tahun × siri. Bil yang sudah selesai jatuh
-- di luar indeks ini dengan sengaja — itulah yang membenarkan bil kedua bagi
-- program yang dilangkau kerana tempat penuh (§13.11).
create unique index if not exists uq_bills_terbuka
  on public.payment_bills(school_id, year, siri)
  where status in ('pending', 'pending_review');

-- Idempoten webhook: satu billCode = satu bil.
create unique index if not exists uq_bills_bill_code
  on public.payment_bills(external_bill_code)
  where external_bill_code is not null;

-- Kod bil kini hidup pada bil. Indeks lama pada payments akan menolak dua
-- baris program yang berkongsi satu bil ToyyibPay — iaitu tepat apa yang
-- kita hendak benarkan.
drop index if exists public.uq_payments_bill_code;

create index if not exists idx_bills_status on public.payment_bills(status);
create index if not exists idx_bills_sekolah on public.payment_bills(school_id, year, siri);

drop trigger if exists set_updated_at on public.payment_bills;
create trigger set_updated_at before update on public.payment_bills
  for each row execute function public.handle_updated_at();


-- ============================================================
-- 5. RLS
-- ============================================================
-- Mencerminkan payments_select (migrasi 028). Tiada polisi tulis dengan
-- sengaja — hanya Edge Function service_role mencipta atau mengubah bil.

alter table public.payment_bills enable row level security;

drop policy if exists "payment_bills_select" on public.payment_bills;
create policy "payment_bills_select" on public.payment_bills
  for select to authenticated using (
    case public.get_my_role()
      when 'developer' then true
      when 'admin' then true
      when 'negeri_admin' then school_id in (
        select id from public.schools where negeri_id = public.get_my_negeri_id()
      )
      when 'daerah_admin' then school_id in (
        select id from public.schools where daerah_id = public.get_my_daerah_id()
      )
      when 'school_user' then school_id = public.get_my_school_id()
      else false
    end
  );


-- ============================================================
-- 6. finalize_bill
-- ============================================================
-- Urutan selepas satu BIL disahkan: setiap baris program diselesaikan
-- menggunakan finalize_payment sedia ada, yang sudah melakukan perkara yang
-- betul per program — tuntut tempat, hantar pendaftaran, kemas kini status.
--
-- Satu program boleh gagal mendapat tempat sementara yang lain berjaya. Itu
-- bukan ralat: duit sudah diterima untuk kesemuanya, dan program tanpa
-- tempat ditanda 'no_seat' untuk tindakan admin, sama seperti hari ini.

create or replace function public.finalize_bill(
  p_bill_id uuid,
  p_new_status text default 'paid'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_bil public.payment_bills%rowtype;
  r record;
  v_hasil jsonb;
  v_item jsonb := '[]'::jsonb;
  v_dapat integer := 0;
  v_tiada integer := 0;
begin
  select * into v_bil from public.payment_bills where id = p_bill_id;
  if not found then
    return jsonb_build_object('ok', false, 'sebab', 'bil_tidak_dijumpai');
  end if;

  for r in
    select p.id, b.name as badge_name
    from public.payments p
    join public.badges b on b.id = p.badge_id
    where p.bill_id = p_bill_id
    order by b.name
  loop
    v_hasil := public.finalize_payment(r.id, p_new_status);
    if coalesce((v_hasil ->> 'ok')::boolean, false) then
      v_dapat := v_dapat + 1;
    else
      v_tiada := v_tiada + 1;
    end if;
    v_item := v_item || jsonb_build_object(
      'paymentId', r.id, 'program', r.badge_name, 'hasil', v_hasil
    );
  end loop;

  update public.payment_bills
     set status       = p_new_status,
         paid_at      = coalesce(paid_at, case when p_new_status = 'paid' then now() end),
         confirmed_at = case when p_new_status = 'paid' then now() else confirmed_at end
   where id = p_bill_id;

  return jsonb_build_object(
    'ok', v_dapat > 0,
    'dapatTempat', v_dapat,
    'tiadaTempat', v_tiada,
    'item', v_item
  );
end;
$$;

-- service_role sahaja: fungsi ini menandakan wang sebagai diterima.
revoke execute on function public.finalize_bill(uuid, text) from public, anon, authenticated;
grant execute on function public.finalize_bill(uuid, text) to service_role;

comment on function public.finalize_bill(uuid, text) is
  'Selesaikan satu bil: setiap baris program melalui finalize_payment, '
  'kemudian status bil dikemas kini. Sebahagian program boleh berakhir '
  'tanpa tempat sementara yang lain berjaya — itu keadaan sah, bukan ralat.';
