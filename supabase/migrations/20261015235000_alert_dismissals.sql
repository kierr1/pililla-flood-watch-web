CREATE TABLE public.alert_dismissals (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_id UUID NOT NULL REFERENCES public.alerts(id) ON DELETE CASCADE,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, alert_id)
);

ALTER TABLE public.alert_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own alert dismissals"
  ON public.alert_dismissals
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users dismiss own alerts"
  ON public.alert_dismissals
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
