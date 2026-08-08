-- ============================================================
-- MIGRATION 028: Skema Bayaran Online (jadual & lajur sahaja)
-- ============================================================
-- Rujuk docs/rancangan-payment-online.md §3.
--
-- SKOP MIGRASI INI: penambahan tulen sahaja.
--   Tiga jadual baharu, dua lajur tambahan, RLS untuk jadual baharu.
--   TIADA fungsi, trigger, atau perubahan pada polisi sedia ada — semua itu
--   datang dalam migrasi berikutnya supaya sempadan semakan kekal jelas.
--
--   Kesan pada sistem sedia ada: SIFAR. Tiada kod merujuk jadual ini lagi,
--   dan kedua-dua lajur baharu mempunyai default yang mengekalkan tingkah
--   laku semasa (`not_required` dan `false`).
--
-- PRASYARAT: migrasi 027 (school_badge_status.siri) mesti sudah dijalankan —
-- bayaran dikunci pada (sekolah, program, tahun, SIRI).
-- ============================================================


-- ============================================================
-- 1. payment_gateway_settings — akaun gateway per skop
-- ============================================================
-- Setiap negeri/daerah kutip ke akaun ToyyibPay sendiri; duit masuk terus ke
-- penganjur yang menetapkan yuran. Mencerminkan corak skop program_settings.
--
-- KUNCI RAHSIA TIDAK DISIMPAN DI SINI. Hanya rujukan Supabase Vault disimpan;
-- nilai sebenar tidak pernah wujud dalam lajur biasa, backup, atau log.

create table if not exists public.payment_gateway_settings (
  id uuid primary key default gen_random_uuid(),
  negeri_id uuid references public.negeri(id) on delete cascade,
  daerah_id uuid references public.daerah(id) on delete cascade,
  provider text not null default 'toyyibpay' check (provider in ('toyyibpay')),

  category_code text,
  secret_vault_id uuid,            -- rujukan vault.secrets, bukan kunci itu sendiri
  masked_key text,                 -- 4 aksara terakhir, untuk paparan UI sahaja
  bank_account_info text,          -- arahan bayaran manual (pindahan bank / cek)
  transaction_fee_flat numeric(10,2) default 1.00,  -- caj FPX; boleh ubah tanpa deploy

  is_sandbox boolean not null default true,   -- selamat secara lalai
  is_active boolean not null default false,   -- hanya aktif selepas ujian sambungan
  verified_at timestamptz,

  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- Tepat satu skop mesti diisi
  constraint payment_gateway_scope_check check (
    (negeri_id is not null and daerah_id is null) or
    (negeri_id is null and daerah_id is not null)
  )
);

-- Satu akaun per skop per provider. COALESCE supaya unique berfungsi walaupun
-- salah satu id adalah null (corak sama seperti uq_program_settings).
create unique index if not exists uq_payment_gateway_scope
  on public.payment_gateway_settings (
    provider,
    coalesce(negeri_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(daerah_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

comment on column public.payment_gateway_settings.secret_vault_id is
  'Rujukan kepada vault.secrets. userSecretKey TIDAK PERNAH disimpan dalam '
  'lajur biasa — ia masuk terus dari pemilik akaun ke Vault.';


-- ============================================================
-- 2. program_siri_settings — had tempat & tarikh tutup per program x siri
-- ============================================================
-- Merujuk program_settings, jadi badge + skop + tahun diwarisi automatik.
-- Satu siri boleh mengandungi beberapa program dengan had berbeza; had melekat
-- pada program x siri, bukan pada siri sahaja.

create table if not exists public.program_siri_settings (
  id uuid primary key default gen_random_uuid(),
  program_setting_id uuid not null references public.program_settings(id) on delete cascade,
  siri smallint not null default 1 check (siri >= 1),

  max_peserta integer check (max_peserta is null or max_peserta > 0),  -- NULL = tiada had
  payment_deadline timestamptz,                                        -- NULL = ikut badges.deadline

  is_closed boolean not null default false,   -- tutup manual, walaupun belum penuh
  closed_at timestamptz,
  closed_by uuid references auth.users(id),

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique (program_setting_id, siri)
);

create index if not exists idx_pss_program_setting
  on public.program_siri_settings(program_setting_id);

comment on column public.program_siri_settings.max_peserta is
  'NULL = tiada had. Had hanya berkuat kuasa bagi program yang ada yuran, '
  'kerana tempat dituntut ketika bayaran disahkan.';


-- ============================================================
-- 3. payments — satu rekod per percubaan bayaran
-- ============================================================
-- Dikunci pada (sekolah, program, tahun, siri) — kunci SAMA dengan
-- school_badge_status. Bukan pada submission_id: setiap kali sekolah tekan
-- Hantar satu baris submissions BAHARU dicipta, jadi bil yang diikat pada
-- submission akan menjadi yatim selepas kitaran buka-semula.

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),

  -- Kunci logik
  school_id uuid not null references public.schools(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  year integer not null,
  siri smallint not null default 1 check (siri >= 1),

  -- Rujukan audit sahaja, BUKAN kunci padanan
  submission_id uuid references public.submissions(id) on delete set null,

  -- Jumlah. amount = yuran (inilah yang penganjur terima).
  -- total_amount = yang sekolah bayar, termasuk caj gateway.
  amount numeric(10,2) not null default 0 check (amount >= 0),
  transaction_fee numeric(10,2) not null default 0 check (transaction_fee >= 0),
  total_amount numeric(10,2) not null default 0 check (total_amount >= 0),

  -- Snapshot bilangan masa bil dicipta — untuk banding bila bilangan berubah
  snapshot_peserta integer not null default 0,
  snapshot_pemimpin integer not null default 0,
  snapshot_penolong integer not null default 0,

  method text not null default 'toyyibpay'
    check (method in ('toyyibpay', 'bank_transfer', 'cheque', 'cash', 'lain')),
  status text not null default 'pending'
    check (status in ('pending', 'pending_review', 'paid', 'rejected', 'failed', 'cancelled')),

  -- 'no_seat' = duit diterima tetapi tempat sudah habis; perlu tindakan admin
  seat_status text not null default 'ok' check (seat_status in ('ok', 'no_seat')),

  reference_number text,           -- no. cek / rujukan transaksi / slip bank
  external_bill_code text,         -- billCode ToyyibPay
  bill_url text,
  gateway_settings_id uuid references public.payment_gateway_settings(id) on delete set null,
  expires_at timestamptz,          -- bil tidak disentuh luput selepas ini

  paid_at timestamptz,
  confirmed_by uuid references auth.users(id),   -- kosong jika auto (webhook)
  confirmed_at timestamptz,
  rejected_reason text,
  notes text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_payments_key
  on public.payments(school_id, badge_id, year, siri);
create index if not exists idx_payments_status on public.payments(status);
create index if not exists idx_payments_seat_status
  on public.payments(seat_status) where seat_status = 'no_seat';

-- Halang dua bil terbuka serentak bagi siri yang sama. Bayaran selesai
-- (paid/rejected/cancelled/failed) dikecualikan supaya sejarah penuh kekal.
create unique index if not exists uq_payments_bil_terbuka
  on public.payments(school_id, badge_id, year, siri)
  where status in ('pending', 'pending_review');

-- Bantu idempoten webhook: satu billCode = satu rekod
create unique index if not exists uq_payments_bill_code
  on public.payments(external_bill_code)
  where external_bill_code is not null;

comment on column public.payments.amount is
  'Yuran sahaja — jumlah yang penganjur terima. Caj gateway berasingan.';
comment on column public.payments.total_amount is
  'amount + transaction_fee. INILAH yang dihantar ke ToyyibPay sebagai '
  'billAmount dan yang mesti dibandingkan semasa double-check getBillTransactions.';


-- ============================================================
-- 4. Lajur pada jadual sedia ada
-- ============================================================
-- Kedua-duanya mempunyai default yang mengekalkan tingkah laku semasa, jadi
-- program sedia ada tidak terjejas langsung.

alter table public.school_badge_status
  add column if not exists payment_status text not null default 'not_required'
    check (payment_status in ('not_required', 'pending', 'pending_review', 'paid', 'rejected'));

alter table public.program_settings
  add column if not exists payment_online_required boolean not null default false;

create index if not exists idx_sbs_payment_status
  on public.school_badge_status(payment_status)
  where payment_status <> 'not_required';

comment on column public.program_settings.payment_online_required is
  'Berasingan daripada payment_enabled. payment_enabled kekal sebagai paparan '
  'caj informational; togol ini mengaktifkan pintu bayaran sebenar.';


-- ============================================================
-- 5. Trigger updated_at
-- ============================================================

drop trigger if exists set_updated_at on public.payments;
create trigger set_updated_at before update on public.payments
  for each row execute function public.handle_updated_at();

drop trigger if exists set_updated_at on public.program_siri_settings;
create trigger set_updated_at before update on public.program_siri_settings
  for each row execute function public.handle_updated_at();

drop trigger if exists set_updated_at on public.payment_gateway_settings;
create trigger set_updated_at before update on public.payment_gateway_settings
  for each row execute function public.handle_updated_at();


-- ============================================================
-- 6. RLS — payments
-- ============================================================
-- Jadual duit. Sekolah & admin boleh BACA mengikut skop; tiada seorang pun
-- boleh menulis melalui client. Semua tulisan melalui Edge Function service
-- role, yang memintas RLS. Ini menjadikan status bayaran mustahil dipalsukan
-- dari browser.

alter table public.payments enable row level security;

drop policy if exists "payments_select" on public.payments;
create policy "payments_select" on public.payments
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

-- SENGAJA TIADA polisi insert/update/delete untuk `authenticated`.
-- Tanpa polisi, RLS menolak semua tulisan. Jangan tambah tanpa membaca §3.1.


-- ============================================================
-- 7. RLS — program_siri_settings
-- ============================================================
-- Baca untuk semua (sekolah perlu nampak baki tempat & tarikh tutup),
-- tulis untuk admin sahaja — corak sama seperti program_settings.

alter table public.program_siri_settings enable row level security;

drop policy if exists "pss_select" on public.program_siri_settings;
create policy "pss_select" on public.program_siri_settings
  for select using (true);

drop policy if exists "pss_insert" on public.program_siri_settings;
create policy "pss_insert" on public.program_siri_settings
  for insert to authenticated with check (public.is_admin_or_above());

drop policy if exists "pss_update" on public.program_siri_settings;
create policy "pss_update" on public.program_siri_settings
  for update to authenticated using (public.is_admin_or_above());

drop policy if exists "pss_delete" on public.program_siri_settings;
create policy "pss_delete" on public.program_siri_settings
  for delete to authenticated using (public.is_admin_or_above());


-- ============================================================
-- 8. RLS — payment_gateway_settings (deny-all)
-- ============================================================
-- Walaupun kunci sebenar ada dalam Vault, jadual ini masih memegang
-- category_code dan rujukan vault. Tiada polisi langsung = tiada akses melalui
-- client, walau apa pun peranan. Admin membaca melalui view di bawah; tulisan
-- melalui Edge Function service role selepas kunci disahkan dengan ToyyibPay.

alter table public.payment_gateway_settings enable row level security;
-- (tiada polisi — sengaja)

-- View untuk UI admin: lajur bukan-rahsia sahaja, TANPA secret_vault_id.
--
-- Sengaja BUKAN security_invoker. View biasa berjalan dengan hak pemiliknya,
-- jadi ia boleh membaca jadual asas yang deny-all — itulah gunanya. Kawalan
-- akses dipindahkan ke dalam view sendiri melalui klausa WHERE di bawah,
-- yang turut mengehadkan admin kepada skop masing-masing.
drop view if exists public.payment_gateway_settings_public;
create view public.payment_gateway_settings_public as
select
  id, negeri_id, daerah_id, provider,
  category_code, masked_key, bank_account_info,
  transaction_fee_flat, is_sandbox, is_active, verified_at,
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

comment on view public.payment_gateway_settings_public is
  'Tetapan gateway tanpa secret_vault_id, ditapis mengikut skop admin. '
  'Jadual asas deny-all; view ini satu-satunya laluan baca dari client. '
  'Semua TULISAN tetap melalui Edge Function service role.';
