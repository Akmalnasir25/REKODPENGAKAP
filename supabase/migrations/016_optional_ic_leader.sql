-- ============================================================
-- MIGRATION 016: Buang requirement IC masa daftar pemimpin
-- ============================================================
-- Tujuan:
-- - IC tidak wajib semasa pendaftaran akaun pemimpin
-- - IC boleh diisi/edit selepas daftar (dalam profil)
-- - Multiple NULL dibenarkan dalam unique constraint
-- ============================================================

-- Tukar ic_number jadi nullable
ALTER TABLE public.leader_accounts
  ALTER COLUMN ic_number DROP NOT NULL;

-- Drop existing unique constraint kalau ada, dan ganti
-- dengan partial unique (NULL ditolak dari unique check)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leader_accounts_ic_number_key'
      AND conrelid = 'public.leader_accounts'::regclass
  ) THEN
    ALTER TABLE public.leader_accounts
      DROP CONSTRAINT leader_accounts_ic_number_key;
  END IF;
END $$;

-- Cipta partial unique index - hanya enforce uniqueness untuk IC bukan NULL
CREATE UNIQUE INDEX IF NOT EXISTS uq_leader_ic_number
  ON public.leader_accounts(ic_number)
  WHERE ic_number IS NOT NULL;
