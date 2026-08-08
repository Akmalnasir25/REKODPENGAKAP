-- ============================================================
-- MIGRATION 030: Lampiran untuk Bukti Pembayaran
-- ============================================================
-- Rujuk docs/rancangan-payment-online.md §3.6.
--
-- Jadual `attachments` wujud sejak 001_schema.sql tetapi tidak pernah
-- digunakan. Migrasi ini menyediakannya untuk bukti bayaran manual (resit
-- pindahan bank, gambar cek).
--
-- PEMBETULAN KEPADA ANGGAPAN TERDAHULU
--   Draf rancangan menyatakan polisi `attachments_select` sedia ada ialah
--   lubang keselamatan, kerana subkueri `submission_id in (select id from
--   submissions)` kelihatan tidak berskop.
--
--   Itu SALAH. PostgreSQL mengenakan RLS secara rekursif pada jadual yang
--   dirujuk di dalam ungkapan polisi, jadi subkueri itu sudah pun ditapis
--   oleh `submissions_select`. Sekolah hanya nampak lampiran sendiri.
--
--   Yang benar: perlindungan itu TIDAK LANGSUNG. Ia bergantung sepenuhnya
--   pada polisi jadual lain kekal betul, dan penilaian RLS bersarang mahal.
--   Migrasi ini menjadikannya eksplisit melalui fungsi SECURITY DEFINER —
--   untuk kejelasan dan prestasi, bukan untuk menampal lubang.
-- ============================================================


-- ============================================================
-- 1. Lajur baharu
-- ============================================================

alter table public.attachments
  add column if not exists category text not null default 'lain'
    check (category in ('payment_proof', 'sijil', 'ic', 'lain'));

alter table public.attachments
  add column if not exists payment_id uuid references public.payments(id) on delete cascade;

create index if not exists idx_attachments_payment on public.attachments(payment_id);
create index if not exists idx_attachments_category on public.attachments(category);

comment on column public.attachments.category is
  'Membezakan kegunaan lampiran. payment_proof = resit/cek untuk bayaran manual.';


-- ============================================================
-- 2. can_access_submission — kebenaran eksplisit, tanpa RLS bersarang
-- ============================================================
-- SECURITY DEFINER supaya ia membaca `submissions` tanpa mencetuskan polisi
-- RLS jadual itu. Ini memberi dua perkara: peraturan akses yang boleh dibaca
-- terus di satu tempat, dan penilaian yang tidak berkembang menjadi rantaian
-- polisi bersarang setiap kali satu baris lampiran disemak.

create or replace function public.can_access_submission(p_submission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.submissions s
    join public.schools sc on sc.id = s.school_id
    where s.id = p_submission_id
      and case public.get_my_role()
            when 'developer'    then true
            when 'admin'        then true
            when 'negeri_admin' then sc.negeri_id = public.get_my_negeri_id()
            when 'daerah_admin' then sc.daerah_id = public.get_my_daerah_id()
            when 'school_user'  then s.school_id  = public.get_my_school_id()
            else false
          end
  );
$$;

grant execute on function public.can_access_submission(uuid) to authenticated;


-- ============================================================
-- 3. Polisi lampiran
-- ============================================================

drop policy if exists "attachments_select" on public.attachments;
create policy "attachments_select" on public.attachments
  for select to authenticated using (
    public.can_access_submission(submission_id)
  );

drop policy if exists "attachments_insert" on public.attachments;
create policy "attachments_insert" on public.attachments
  for insert to authenticated with check (
    public.is_admin_or_above()
    or (
      -- Sekolah memuat naik hanya kepada submission sendiri
      submission_id in (
        select id from public.submissions where school_id = public.get_my_school_id()
      )
    )
  );

-- Sekolah boleh membuang bukti yang tersalah muat naik, TETAPI hanya selagi
-- bukti itu masih menunggu semakan. Selepas admin mengesahkan bayaran, bukti
-- menjadi rekod kewangan dan hanya admin boleh membuangnya.
drop policy if exists "attachments_delete" on public.attachments;
create policy "attachments_delete" on public.attachments
  for delete to authenticated using (
    public.is_admin_or_above()
    or (
      category = 'payment_proof'
      and public.can_access_submission(submission_id)
      and exists (
        select 1 from public.payments p
        where p.id = attachments.payment_id
          and p.status = 'pending_review'
      )
    )
  );

-- Tiada polisi UPDATE dengan sengaja: lampiran ialah rekod tidak boleh ubah.
-- Untuk menggantikan bukti, buang dan muat naik semula — supaya jejak audit
-- menunjukkan apa yang sebenarnya berlaku.


-- ============================================================
-- 4. Integriti: bukti bayaran mesti terikat pada bayaran
-- ============================================================
-- Tanpa ini, baris payment_proof yatim boleh wujud dan tidak akan pernah
-- muncul dalam giliran semakan admin.

alter table public.attachments
  drop constraint if exists attachments_payment_proof_check;

alter table public.attachments
  add constraint attachments_payment_proof_check
  check (category <> 'payment_proof' or payment_id is not null);
