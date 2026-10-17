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
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    let requestNumber = 0;
    const refresh = async () => {
      const request = ++requestNumber;
      try {
        const { data, error } = await supabase.from("live_sensor_readings" as any)
          .select("station_id,water_level_m,wind_speed,updated_at")
          .order("updated_at", { ascending: false })
          .limit(1);
        if (!active || request !== requestNumber) return;
        if (error) throw error;
        setReading((data?.[0] as LiveReading | undefined) ?? null);
        setError(null);
      } catch (e) {
        if (active && request === requestNumber) setError(e instanceof Error ? e.message : String(e));
      }
    };
    void refresh();

    // React immediately to new Supabase updates when Realtime replication is enabled.
    // Keep 5-second polling as a fallback if Realtime is not configured/available.
    const channel = supabase.channel("dashboard-live-sensor-" + Math.random().toString(36).slice(2))
      .on("postgres_changes", { event: "*", schema: "public", table: "live_sensor_readings" }, () => {
        void refresh();
      })
      .subscribe();

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 5000);
    // Update freshness even when no database event arrives (sensor device offline).
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      clearInterval(timer);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", visible);
      void supabase.removeChannel(channel);
    };
  }, []);

  const age = reading ? now - Date.parse(reading.updated_at) : Infinity;
  const fresh = !!reading && Number.isFinite(age) && age >= -10000 && age < 90000;
  return { reading: fresh ? reading : null, error, lastUpdated: reading?.updated_at ?? null };
}
