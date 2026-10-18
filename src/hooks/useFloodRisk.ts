import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { predictFlood } from "@/lib/floodModel";
import { distanceKm, type RiskLevel } from "@/data/pililla";
import type { Barangay, SensorStation, FloodReading, WeatherForecast } from "./useData";

export interface BarangayRisk extends Barangay {
  risk_score: number;
  risk_level: RiskLevel;
  confidence: number;
  rainfall_mm: number;
  water_level_m: number;
  nearest_sensor_id: string | null;
  updated_at: string;
}

interface State {
  barangays: BarangayRisk[];
  loading: boolean;
  lastEventAt: string | null;
}

/**
 * Realtime flood-risk heatmap source.
 * - Fetches barangays, sensors, latest flood_readings, upcoming weather_forecasts
 * - Computes per-barangay risk via the nearest sensor + forecast horizon
 * - Subscribes to flood_readings, weather_forecasts, barangays changes and recomputes
 */
export function useFloodRisk(): State {
  const [barangays, setBarangays] = useState<Barangay[]>([]);
  const [sensors, setSensors] = useState<SensorStation[]>([]);
  const [readings, setReadings] = useState<FloodReading[]>([]);
  const [forecasts, setForecasts] = useState<WeatherForecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const mounted = useRef(true);

  // Refetch readings + forecasts (lightweight, used by realtime listeners as a fallback)
  const refetchReadings = useCallback(async () => {
    const { data } = await supabase
      .from("flood_readings")
      .select("*")
      .order("recorded_at", { ascending: false })
      .limit(500);
    if (mounted.current) setReadings((data as FloodReading[]) ?? []);
  }, []);

  const refetchForecasts = useCallback(async () => {
    const { data } = await supabase
      .from("weather_forecasts")
      .select("*")
      .gte("forecast_for", new Date(Date.now() - 3600_000).toISOString())
      .order("forecast_for", { ascending: true })
      .limit(48);
    if (mounted.current) setForecasts((data as WeatherForecast[]) ?? []);
  }, []);

  const refetchBarangays = useCallback(async () => {
    const { data } = await supabase.from("barangays").select("*").order("name");
    if (mounted.current) setBarangays((data as Barangay[]) ?? []);
  }, []);

  // Initial load
  useEffect(() => {
    mounted.current = true;
    (async () => {
      const [b, s] = await Promise.all([
        supabase.from("barangays").select("*").order("name"),
        supabase.from("sensor_stations").select("*").order("name"),
      ]);
      if (!mounted.current) return;
      setBarangays((b.data as Barangay[]) ?? []);
      setSensors((s.data as SensorStation[]) ?? []);
      await Promise.all([refetchReadings(), refetchForecasts()]);
      if (mounted.current) setLoading(false);
    })();
    return () => { mounted.current = false; };
  }, [refetchReadings, refetchForecasts]);

  // Realtime subscriptions
  useEffect(() => {
    const channel = supabase
      .channel("flood-risk-stream")
      .on("postgres_changes", { event: "*", schema: "public", table: "flood_readings" }, (payload) => {
        setLastEventAt(new Date().toISOString());
        const row = (payload.new ?? payload.old) as FloodReading | undefined;
        if (payload.eventType === "INSERT" && payload.new) {
          setReadings((prev) => [payload.new as FloodReading, ...prev].slice(0, 500));
        } else if (payload.eventType === "UPDATE" && payload.new) {
          setReadings((prev) => prev.map((r) => (r.id === (payload.new as FloodReading).id ? (payload.new as FloodReading) : r)));
        } else if (payload.eventType === "DELETE" && row) {
          setReadings((prev) => prev.filter((r) => r.id !== row.id));
        } else {
          refetchReadings();
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "weather_forecasts" }, () => {
        setLastEventAt(new Date().toISOString());
        refetchForecasts();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "barangays" }, () => {
        setLastEventAt(new Date().toISOString());
        refetchBarangays();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [refetchReadings, refetchForecasts, refetchBarangays]);

  // Compute risk per barangay
  const enriched: BarangayRisk[] = useMemo(() => barangays.map((b) => {
    // Find nearest sensor to barangay (by lat/lng); fall back to any sensor with a recent reading
    let nearestSensorId: string | null = null;
    if (b.lat != null && b.lng != null) {
      let best = Infinity;
      for (const s of sensors) {
        if (s.lat == null || s.lng == null) continue;
        const d = distanceKm([Number(b.lng), Number(b.lat)], [Number(s.lng), Number(s.lat)]);
        if (d < best) { best = d; nearestSensorId = s.id; }
      }
    }

    // Latest reading for that sensor
    const latest = nearestSensorId
      ? readings.find((r) => r.station_id === nearestSensorId)
      : readings[0]; // global fallback

    // Nearest upcoming forecast (next hour-ish)
    const nextForecast = forecasts[0];

    const rainfall = Number(latest?.rainfall_mm ?? nextForecast?.rain_mm ?? 0);
    const water = Number(latest?.water_level_m ?? 0);
    const soil = Number(latest?.soil_moisture_percent ?? 40);

    const prediction = predictFlood({
      rainfall_mm: rainfall,
      water_level_m: water,
      soil_moisture_percent: soil,
      elevation_m: Number(b.elevation_m ?? 15),
      river_distance_m: 400, // unknown — neutral default
      drainage_capacity_percent: 60,
      slope_degree: 5,
      satellite_ndwi: 0,
      road_condition_score: 70,
      population_density_per_km2: Number(b.population ?? 0) / 5,
    });

    return {
      ...b,
      risk_score: prediction.risk_score,
      risk_level: prediction.risk_level,
      confidence: prediction.confidence,
      rainfall_mm: rainfall,
      water_level_m: water,
      nearest_sensor_id: nearestSensorId,
      updated_at: latest?.recorded_at ?? new Date().toISOString(),
    };
  }), [barangays, sensors, readings, forecasts]);

  return { barangays: enriched, loading, lastEventAt };
}
