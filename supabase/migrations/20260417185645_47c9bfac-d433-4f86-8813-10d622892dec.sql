CREATE TABLE public.dictation_sessions (
  id TEXT PRIMARY KEY,
  date TIMESTAMPTZ NOT NULL DEFAULT now(),
  level INTEGER NOT NULL,
  list_id TEXT NOT NULL,
  list_name TEXT NOT NULL,
  results JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_score NUMERIC NOT NULL DEFAULT 0,
  max_score NUMERIC NOT NULL DEFAULT 0,
  percentage NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dictation_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view sessions"
  ON public.dictation_sessions FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create sessions"
  ON public.dictation_sessions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can delete sessions"
  ON public.dictation_sessions FOR DELETE
  USING (true);

CREATE INDEX idx_dictation_sessions_date ON public.dictation_sessions(date DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.dictation_sessions;