-- ============================================================
-- MIGRATION 020: Polisi Retensi Data (PDPA Compliance)
-- ============================================================
-- Data disimpan selama tempoh keahlian aktif + 7 tahun
-- selepas tarikh akhir aktiviti/submission, kemudian dipadam.
-- ============================================================

-- Fungsi auto-delete rekod lama (> 7 tahun)
CREATE OR REPLACE FUNCTION cleanup_expired_records()
RETURNS void AS $$
BEGIN
  -- Padam submission_people yang submissionnya > 7 tahun
  DELETE FROM public.submission_people
  WHERE submission_id IN (
    SELECT id FROM public.submissions
    WHERE created_at < NOW() - INTERVAL '7 years'
  );

  -- Padam submissions > 7 tahun
  DELETE FROM public.submissions
  WHERE created_at < NOW() - INTERVAL '7 years';

  -- Padam course_registrations untuk kursus > 7 tahun
  DELETE FROM public.course_registrations
  WHERE course_id IN (
    SELECT id FROM public.courses
    WHERE end_date < CURRENT_DATE - INTERVAL '7 years'
  );

  -- Padam courses > 7 tahun
  DELETE FROM public.courses
  WHERE end_date < CURRENT_DATE - INTERVAL '7 years';

  -- Padam feedbacks > 7 tahun
  DELETE FROM public.feedbacks
  WHERE created_at < NOW() - INTERVAL '7 years';

  -- Padam notifications > 3 tahun
  DELETE FROM public.notifications
  WHERE created_at < NOW() - INTERVAL '3 years';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Jadualkan pembersihan automatik setiap bulan (pg_cron extension jika ada)
-- Jika pg_cron tidak tersedia, jalankan manual atau guna Supabase Edge Function cron
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('cleanup_expired_data', '0 3 1 * *', 'SELECT cleanup_expired_records()');
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;
