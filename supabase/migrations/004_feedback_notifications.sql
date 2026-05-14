-- Table: feedbacks
-- Simpan semua feedback/aduan dari user/admin
CREATE TABLE IF NOT EXISTS public.feedbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_name TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  role TEXT NOT NULL,
  school_name TEXT,
  message TEXT NOT NULL,
  telegram_message_id BIGINT, -- ID mesej dalam Telegram (untuk link reply)
  status TEXT NOT NULL DEFAULT 'open', -- open | resolved
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: notifications
-- Simpan reply dari admin kepada user
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id UUID REFERENCES public.feedbacks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Maklum Balas Aduan',
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: feedbacks
ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;

-- User boleh insert feedback sendiri
CREATE POLICY "Users can insert own feedback"
  ON public.feedbacks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- User boleh baca feedback sendiri
CREATE POLICY "Users can read own feedback"
  ON public.feedbacks FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role boleh buat semua (untuk Edge Function)
CREATE POLICY "Service role full access feedbacks"
  ON public.feedbacks FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS: notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- User boleh baca notification sendiri
CREATE POLICY "Users can read own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- User boleh update (mark as read) notification sendiri
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role boleh buat semua (untuk Edge Function)
CREATE POLICY "Service role full access notifications"
  ON public.notifications FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Index untuk performance
CREATE INDEX IF NOT EXISTS idx_feedbacks_user_id ON public.feedbacks(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_feedbacks_telegram_message_id ON public.feedbacks(telegram_message_id);
