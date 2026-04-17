-- Table des listes partagées (accessibles à tous)
CREATE TABLE public.dictation_lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  words JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dictation_lists ENABLE ROW LEVEL SECURITY;

-- Accès public total (listes partagées sans compte)
CREATE POLICY "Anyone can view lists"
  ON public.dictation_lists FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create lists"
  ON public.dictation_lists FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update lists"
  ON public.dictation_lists FOR UPDATE
  USING (true);

CREATE POLICY "Anyone can delete lists"
  ON public.dictation_lists FOR DELETE
  USING (true);

-- Trigger pour updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_dictation_lists_updated_at
  BEFORE UPDATE ON public.dictation_lists
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime pour synchro entre ordinateurs
ALTER PUBLICATION supabase_realtime ADD TABLE public.dictation_lists;