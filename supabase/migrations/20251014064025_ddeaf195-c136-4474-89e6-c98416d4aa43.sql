-- Password history tracking (hashed)
CREATE TABLE public.password_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_password_history_user ON public.password_history(user_id);

-- Failed login attempts tracking (rate limiting)
CREATE TABLE public.login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL,
  attempt_time TIMESTAMPTZ DEFAULT now(),
  success BOOLEAN DEFAULT false
);

CREATE INDEX idx_login_attempts_identifier ON public.login_attempts(identifier, attempt_time);

-- RLS policies
ALTER TABLE public.password_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- Only allow users to read their own password history
CREATE POLICY "Users can read own password history"
  ON public.password_history FOR SELECT
  USING (auth.uid() = user_id);

-- System can insert password history
CREATE POLICY "System can insert password history"
  ON public.password_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins can view login attempts
CREATE POLICY "Admins can view login attempts"
  ON public.login_attempts FOR SELECT
  USING (has_role(auth.uid(), 'admin'::public.app_role));

-- System can insert login attempts
CREATE POLICY "System can insert login attempts"
  ON public.login_attempts FOR INSERT
  WITH CHECK (true);