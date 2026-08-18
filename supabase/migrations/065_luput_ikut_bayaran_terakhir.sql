-- 065 — tandai_bayaran_luput menilai baris bayaran TERAKHIR
--
-- Rujuk migrasi 055, yang diperbetulkan di sini.
--
-- MASALAH
--   Ujian "masih hidup" dalam 055 bertanya: adakah WUJUD sebarang baris
--   payments bagi program ini yang 'paid' atau 'pending_review', atau
--   'pending' dengan bil yang belum luput? Kalau ada, baris itu dianggap
--   hidup dan dibiarkan.
--
--   Soalan itu salah bila sekolah membayar, kemudian menambah seorang lagi,
--   kemudian bil kedua mati tanpa dibayar. Baris 'paid' yang LAMA menjadikan
--   status 'pending' yang BAHARU kelihatan hidup — selama-lamanya.
--
--   Kes sebenar: SEK RAJA PEREMPUAN TAAYAH · Jaya · 2026 Siri 2.
--   RM1530 dibayar 17 Ogos bagi 18 peserta. Peserta ke-19 ditambah; dua bil
--   RM85 dijana 18 Ogos, kedua-duanya mati. Baris kekal 'pending' walaupun
--   fungsi itu berjalan setiap lima minit selama berjam-jam.
--
-- KENAPA 'paid' ADA DALAM UJIAN ITU
--   Ia melindungi kes bertentangan: bayaran berjaya tetapi kemas kini status
--   gagal, meninggalkan 'pending' dengan bayaran sebenar di belakangnya.
--   Menandanya 'expired' akan menyembunyikan wang yang sudah masuk.
--
--   Kedua-dua kes adalah nyata. Yang membezakannya bukan kewujudan baris
--   'paid', tetapi SUSUNANNYA: bayaran yang tersekat ialah baris TERAKHIR;
--   bayaran yang lama diikuti bil mati yang lebih baharu bukan.
--
-- PERATURAN BAHARU
--   Lihat baris payments terakhir sahaja bagi setiap sekolah x program x
--   tahun x siri:
--     - terakhir 'paid' atau 'pending_review'      -> biarkan
--     - terakhir 'pending' dan bil belum luput     -> biarkan
--     - selain itu                                 -> 'expired'
--
--   Baris 'pending' yang langsung tiada baris payments kekal tidak disentuh,
--   sama seperti 055. Itu keadaan berbeza yang masih tidak difahami.

create or replace function public.tandai_bayaran_luput()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  update public.school_badge_status sbs
     set payment_status = 'expired'
   where sbs.payment_status = 'pending'
     and exists (
       select 1 from public.payments p
        where p.school_id = sbs.school_id
          and p.badge_id  = sbs.badge_id
          and p.year      = sbs.year
          and p.siri      = sbs.siri
     )
     and not exists (
       -- Satu baris sahaja: yang terbaharu. `p.id` memutuskan seri supaya dua
       -- baris pada saat yang sama tidak memberi jawapan berbeza setiap kali
       -- fungsi ini dijalankan.
       select 1
         from (
           select p.status,
                  coalesce(pb.expires_at, p.expires_at) as luput
             from public.payments p
             left join public.payment_bills pb on pb.id = p.bill_id
            where p.school_id = sbs.school_id
              and p.badge_id  = sbs.badge_id
              and p.year      = sbs.year
              and p.siri      = sbs.siri
            order by p.created_at desc, p.id desc
            limit 1
         ) t
        where t.status in ('pending_review', 'paid')
           or (t.status = 'pending' and t.luput > now())
     );

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function public.tandai_bayaran_luput() is
  'Tanda payment_status = expired bagi baris pending yang baris bayaran '
  'TERAKHIRNYA sudah mati. Baris paid yang lebih lama tidak lagi menjadikan '
  'bil baharu yang mati kelihatan hidup (migrasi 065).';

revoke execute on function public.tandai_bayaran_luput() from public, anon;
grant execute on function public.tandai_bayaran_luput() to authenticated, service_role;
