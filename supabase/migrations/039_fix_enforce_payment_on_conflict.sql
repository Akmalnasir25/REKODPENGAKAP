-- ============================================================
-- MIGRATION 039: enforce_payment_before_approval di bawah ON CONFLICT
-- ============================================================
-- Rujuk docs/rancangan-payment-online.md §5.3.
--
-- PEPIJAT YANG DIBETULKAN
--   Admin mengesahkan bayaran manual, butang Sahkan hidup, tetapi menekannya
--   tidak melakukan apa-apa. Pendaftaran tidak pernah masuk ke statistik.
--
--   PostgreSQL menembak pencetus BEFORE INSERT bagi SETIAP baris yang
--   dicadangkan dalam INSERT ... ON CONFLICT DO UPDATE — sebelum konflik
--   dikesan, dan walaupun baris itu akhirnya dikemas kini, bukan disisipkan.
--
--   approveSchoolBadge menggunakan upsert dan tidak menyertakan
--   payment_status dalam muatannya (memang tidak sepatutnya — ia mengesahkan
--   pendaftaran, bukan mengubah bayaran). Jadi baris cadangan itu membawa
--   nilai LALAI lajur, 'not_required'. Pencetus melihat 'not_required',
--   menyimpulkan yuran belum dibayar, dan membuang ralat — sedangkan baris
--   sebenar dalam jadual berkata 'paid'.
--
--   Ia gagal senyap kerana approveSchoolBadge tidak memeriksa `error` yang
--   dipulangkan upsert. Itu dibetulkan berasingan di sisi klien.
--
-- KENAPA MEMBETULKAN PENCETUS, BUKAN HANYA PEMANGGIL ITU
--   Perangkap yang sama mengenai setiap upsert yang membawa status
--   'approved'. Kemas kini pukal kawalan edit mengekalkan status sedia ada
--   bagi setiap sekolah, jadi satu sekolah yang sudah approved akan
--   menggagalkan keseluruhan operasi untuk semua orang. Membetulkan satu
--   pemanggil hanya menyembunyikan perangkap itu sehingga pemanggil
--   seterusnya terjatuh ke dalamnya.
--
-- APA YANG TIDAK BERUBAH
--   INSERT tulen dengan status 'approved' dan tiada baris sedia ada masih
--   ditolak. Mencipta pendaftaran terus sebagai diluluskan, tanpa sebarang
--   bayaran wujud, tetap salah.
-- ============================================================

create or replace function public.enforce_payment_before_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ps_id        uuid;
  v_required     boolean;
  v_bayar        text;
  v_status_sedia text;
  v_bayar_sedia  text;
begin
  if new.status is distinct from 'approved' then
    return new;
  end if;

  -- Sudah approved sebelum ini: bukan peralihan baharu, biarkan.
  -- IF bersarang, bukan `tg_op = 'UPDATE' and old.status = ...` — PL/pgSQL
  -- tidak menjamin penilaian litar-pintas, dan merujuk OLD semasa INSERT
  -- akan membuang ralat "record old is not assigned yet".
  if tg_op = 'UPDATE' then
    if old.status = 'approved' then
      return new;
    end if;
  end if;

  v_bayar := new.payment_status;

  -- Laluan ON CONFLICT: kita dipanggil sebagai INSERT, tetapi baris sudah
  -- wujud dan pernyataan ini sebenarnya akan mengemas kininya. Nilai yang
  -- BERMAKNA ialah nilai yang tersimpan, bukan lalai lajur yang dibawa oleh
  -- muatan yang tidak menyebut payment_status langsung.
  if tg_op = 'INSERT' then
    select sbs.status, sbs.payment_status
      into v_status_sedia, v_bayar_sedia
    from public.school_badge_status sbs
    where sbs.school_id = new.school_id
      and sbs.badge_id  = new.badge_id
      and sbs.year      = new.year
      and sbs.siri      = new.siri;

    if found then
      if v_status_sedia = 'approved' then
        return new;
      end if;
      -- Bayaran yang tersimpan mengatasi lalai muatan. Ia tidak boleh
      -- mengatasi arah bertentangan: muatan yang secara eksplisit menetapkan
      -- 'paid' pada baris yang belum dibayar masih diperiksa di bawah.
      if v_bayar_sedia = 'paid' then
        v_bayar := 'paid';
      end if;
    end if;
  end if;

  v_ps_id := public.resolve_program_setting(new.school_id, new.badge_id, new.year);
  if v_ps_id is null then
    return new;   -- program tanpa tetapan: tiada bayaran diwajibkan
  end if;

  select coalesce(ps.payment_online_required, false)
    into v_required
  from public.program_settings ps
  where ps.id = v_ps_id;

  if coalesce(v_required, false) and coalesce(v_bayar, 'not_required') <> 'paid' then
    raise exception
      'Pendaftaran ini belum dibayar (status: %). Program mewajibkan bayaran sebelum pengesahan.',
      coalesce(v_bayar, 'not_required')
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.enforce_payment_before_approval() is
  'Menyekat kelulusan sehingga bayaran selesai. Sedar bahawa PostgreSQL '
  'menembak pencetus BEFORE INSERT bagi baris ON CONFLICT sebelum konflik '
  'dikesan, jadi ia membaca payment_status yang TERSIMPAN dan bukan lalai '
  'lajur yang dibawa oleh muatan upsert.';
