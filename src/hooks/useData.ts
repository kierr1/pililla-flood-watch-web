import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Barangay {
  id: string;
  name: string;
  population: number | null;
  elevation_m: number | null;
  lat: number | null;
  lng: number | null;
}
export interface SensorStation {
  id: string;
  name: string;
  type: string | null;
  status: string | null;
  lat: number | null;
  lng: number | null;
}
export interface FloodReading {
  id: string;
  station_id: string | null;
  rainfall_mm: number | null;
  water_level_m: number | null;
  soil_moisture_percent: number | null;
  wind_speed: number | null;
  recorded_at: string;
  image_url:string;
}
export interface EvacuationCenter {
  id: string;
  name: string;
  capacity: number | null;
  occupancy: number | null;
  status: string | null;
  lat: number | null;
  lng: number | null;
}
export interface Alert {
  id: string;
  level: string;
  title: string;
  area: string | null;
  message: string | null;
  issued_at: string;
}
export interface WeatherForecast {
  id: string;
  forecast_for: string;
  rain_mm: number | null;
  rain_chance: number | null;
  temp_c: number | null;
  wind_kph: number | null;
  condition: string | null;
}

function useTable<T>(table: string, orderBy?: { column: string; ascending?: boolean }, refreshMs?: number) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        let q = supabase.from(table as any).select("*");
        if (orderBy) q = q.order(orderBy.column, { ascending: orderBy.ascending ?? true });
        const { data: rows, error: err } = await q;
        if (!active) return;
        if (err) throw err;
        setData((rows as T[]) ?? []);
        setError(null);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (active) setLoading(false);
      }
    };
    void refresh();
    const channel = table === "alerts"
      ? supabase.channel("alerts-live-" + Math.random().toString(36).slice(2))
          .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, () => void refresh())
          .subscribe()
      : null;
    const timer = refreshMs ? setInterval(() => {
      if (table === "alerts" || document.visibilityState === "visible") void refresh();
    }, refreshMs) : null;
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      if (timer) clearInterval(timer);
      if (channel) void supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, refreshMs]);

  return { data, loading, error };
}

export const useBarangays         = () => useTable<Barangay>("barangays", { column: "name" });
export const useSensorStations    = () => useTable<SensorStation>("sensor_stations", { column: "name" });
export const useEvacuationCenters = () => useTable<EvacuationCenter>("evacuation_centers", { column: "name" });
export const useAlerts            = () => useTable<Alert>("alerts", { column: "issued_at", ascending: false }, 5000);
export const useWeatherForecasts  = () => useTable<WeatherForecast>("weather_forecasts", { column: "forecast_for" });
export const useFloodReadings     = () => useTable<FloodReading>("flood_readings", { column: "recorded_at", ascending: false }, 15000);


/** OpenWeather 5-day / 3-hour forecast, shared with the Weather & Forecast screen.
 * Returns mean predicted rainfall (mm per 3-hour period) for the next 24 hours.
 * This is forecast precipitation, not measured rainfall.
 */
export function useOpenWeatherRainfall() {
  const [rainfall, setRainfall] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const key = import.meta.env.OPENWEATHER_API_KEY?.trim();
    if (!key) { setError("OpenWeather key not configured"); return; }
    const controller = new AbortController();
    // Pililla municipal center coordinates
    import("@/data/pililla").then(({ PILILLA_CENTER }) => {
      if (controller.signal.aborted) return;
      const [lon, lat] = PILILLA_CENTER;
      const params = new URLSearchParams({ lat: String(lat), lon: String(lon), appid: key, units: "metric" });
      return fetch(`https://api.openweathermap.org/data/2.5/forecast?${params}`, { signal: controller.signal })
        .then(res => { if (!res.ok) throw new Error(`OpenWeather request failed (${res.status})`); return res.json(); })
        .then((data: { list?: { dt: number; rain?: { "3h"?: number } }[] }) => {
          if (controller.signal.aborted) return;
          const now = Date.now() / 1000;
          const next = (data.list ?? []).filter(p => p.dt >= now).slice(0, 8);
          if (!next.length) throw new Error("No forecast rainfall data");
          const total = next.reduce((sum, p) => sum + (p.rain?.["3h"] ?? 0), 0);
          setRainfall(total / next.length);
          setError(null);
        });
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Forecast unavailable"); });
    return () => controller.abort();
  }, []);
  return { rainfall, error };
}
