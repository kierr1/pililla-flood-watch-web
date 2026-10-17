-- Latest device health reported by the Raspberry Pi.
-- Only a trusted backend using the Supabase service-role key may write.
CREATE TABLE IF NOT EXISTS public.device_health (
  device_id text PRIMARY KEY CHECK (device_id IN ('wind','water_level','camera')),
  connected boolean NOT NULL DEFAULT false,
  checked_at timestamptz NOT NULL DEFAULT now(),
  detail text
);
ALTER TABLE public.device_health ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read device health" ON public.device_health;
CREATE POLICY "Public can read device health" ON public.device_health
  FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.device_health TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.device_health FROM anon, authenticated;
