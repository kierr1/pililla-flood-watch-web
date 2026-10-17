import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type LiveReading = {
  station_id: string;
  water_level_m: number | null;
  wind_speed: number | null;
  updated_at: string;
};

export function useLiveSensorReading() {
  const [reading, setReading] = useState<LiveReading | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const { data, error } = await supabase.from("live_sensor_readings" as any)
          .select("station_id,water_level_m,wind_speed,updated_at")
          .order("updated_at", { ascending: false })
          .limit(1);
        if (!active) return;
        if (error) throw error;
        setReading((data?.[0] as LiveReading | undefined) ?? null);
        setError(null);
      } catch (e) {
        if (active) { setReading(null); setError(e instanceof Error ? e.message : String(e)); }
      }
    };
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 5000);
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { active = false; clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, []);
  const fresh = !!reading && Date.now() - new Date(reading.updated_at).getTime() < 90000;
  return { reading: fresh ? reading : null, error, lastUpdated: reading?.updated_at ?? null };
}
