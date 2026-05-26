-- Table: telegram_groups
-- Simpan mapping Telegram group/chat kepada role dan scope admin
CREATE TABLE IF NOT EXISTS public.telegram_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('developer', 'negeri_admin', 'daerah_admin')),
  negeri_id UUID REFERENCES public.negeri(id) ON DELETE SET NULL,
  daerah_id UUID REFERENCES public.daerah(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index untuk carian cepat by chat_id
CREATE INDEX IF NOT EXISTS idx_telegram_groups_chat_id ON public.telegram_groups(chat_id);
CREATE INDEX IF NOT EXISTS idx_telegram_groups_negeri_id ON public.telegram_groups(negeri_id);
CREATE INDEX IF NOT EXISTS idx_telegram_groups_daerah_id ON public.telegram_groups(daerah_id);

-- RLS
ALTER TABLE public.telegram_groups ENABLE ROW LEVEL SECURITY;

-- Service role boleh buat semua (untuk Edge Function)
CREATE POLICY "Service role full access telegram_groups"
  ON public.telegram_groups FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Tambah kolum negeri_id dan daerah_id dalam feedbacks untuk routing
ALTER TABLE public.feedbacks
  ADD COLUMN IF NOT EXISTS negeri_id UUID REFERENCES public.negeri(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS daerah_id UUID REFERENCES public.daerah(id) ON DELETE SET NULL;

-- Index untuk routing feedback
CREATE INDEX IF NOT EXISTS idx_feedbacks_negeri_id ON public.feedbacks(negeri_id);
CREATE INDEX IF NOT EXISTS idx_feedbacks_daerah_id ON public.feedbacks(daerah_id);

-- Tambah kolum telegram_group_chat_id dalam feedbacks
-- untuk track mesej mana yang dihantar ke group mana
CREATE TABLE IF NOT EXISTS public.feedback_telegram_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id UUID NOT NULL REFERENCES public.feedbacks(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  telegram_message_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_telegram_messages_feedback_id ON public.feedback_telegram_messages(feedback_id);
CREATE INDEX IF NOT EXISTS idx_feedback_telegram_messages_telegram_message_id ON public.feedback_telegram_messages(telegram_message_id);

-- RLS untuk feedback_telegram_messages
ALTER TABLE public.feedback_telegram_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access feedback_telegram_messages"
  ON public.feedback_telegram_messages FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Insert developer group (chat_id kena update manual)
-- UPDATE telegram_groups SET chat_id = 'YOUR_CHAT_ID' WHERE role = 'developer';
INSERT INTO public.telegram_groups (chat_id, role, label)
VALUES ('39114512', 'developer', 'Developer - Semua Akses')
ON CONFLICT (chat_id) DO NOTHING;

-- broadcast_sessions - pastikan ada row untuk admin_session
INSERT INTO public.broadcast_sessions (id, step, scope)
VALUES ('admin_session', null, null)
ON CONFLICT (id) DO NOTHING;
