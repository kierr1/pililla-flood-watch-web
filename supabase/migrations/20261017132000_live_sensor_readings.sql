-- A single latest-reading row per Pi station: no 20-second history accumulation.
CREATE TABLE IF NOT EXISTS public.live_sensor_readings (
  station_id uuid PRIMARY KEY,
  water_level_m numeric,
  wind_speed numeric,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.live_sensor_readings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public reads live sensor status" ON public.live_sensor_readings;
CREATE POLICY "Public reads live sensor status" ON public.live_sensor_readings
  FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.live_sensor_readings TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.live_sensor_readings FROM anon, authenticated;
NOTIFY pgrst, 'reload schema';
