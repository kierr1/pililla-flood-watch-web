import { useEffect, useState } from "react";
import { PILILLA_CENTER } from "@/data/pililla";

export interface ForecastPoint {
  forecast_for: string;
  rain_mm: number;
  rain_chance: number;
  temp_c: number;
  wind_kph: number;
  condition: string;
}
export interface WeatherNow {
  dt: number;
  main: { temp: number; feels_like: number; humidity: number; pressure: number };
  weather: { description: string }[];
  wind: { speed: number }; // metres per second, for existing display
  rain: { "1h": number };
}
interface ForecastResponse {
  current?: {
    time: string; temperature_2m: number; apparent_temperature: number;
    relative_humidity_2m: number; surface_pressure: number;
    wind_speed_10m: number; precipitation: number; weather_code: number;
  };
  hourly?: {
    time: string[]; temperature_2m: number[]; precipitation: number[];
    precipitation_probability: number[]; wind_speed_10m: number[];
    weather_code: number[];
  };
}
function description(code: number): string {
  if (code === 0) return "Clear sky";
  if (code <= 3) return "Partly cloudy";
  if (code <= 48) return "Fog";
  if (code <= 57) return "Drizzle";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Rain showers";
  if (code <= 86) return "Snow showers";
  if (code <= 99) return "Thunderstorm";
  return "Unknown";
}
let cached: { time: number; current: WeatherNow; points: ForecastPoint[] } | null = null;
let pending: Promise<{ current: WeatherNow; points: ForecastPoint[] }> | null = null;

async function requestForecast(): Promise<{ current: WeatherNow; points: ForecastPoint[] }> {
  if (cached && Date.now() - cached.time < 10 * 60 * 1000) return cached;
  if (pending) return pending;
  const [longitude, latitude] = PILILLA_CENTER;
  const params = new URLSearchParams({
    latitude: String(latitude), longitude: String(longitude),
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,surface_pressure,wind_speed_10m,precipitation,weather_code",
    hourly: "temperature_2m,precipitation,precipitation_probability,wind_speed_10m,weather_code",
    forecast_days: "7", timezone: "UTC", wind_speed_unit: "kmh",
  });
  pending = (async () => {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!response.ok) throw new Error(`Open-Meteo weather request failed (${response.status}).`);
    const result = await response.json() as ForecastResponse;
    if (!result.current || !result.hourly?.time?.length) throw new Error("Open-Meteo returned incomplete weather data.");
    const c = result.current;
    const current: WeatherNow = {
      dt: Date.parse(c.time + "Z") / 1000,
      main: { temp: c.temperature_2m, feels_like: c.apparent_temperature,
        humidity: c.relative_humidity_2m, pressure: c.surface_pressure },
      weather: [{ description: description(c.weather_code) }],
      wind: { speed: c.wind_speed_10m / 3.6 },
      rain: { "1h": c.precipitation },
    };
    const h = result.hourly;
    const points = h.time.map((time, i) => ({
      forecast_for: time + "Z",
      rain_mm: h.precipitation[i] ?? 0,
      rain_chance: h.precipitation_probability[i] ?? 0,
      temp_c: h.temperature_2m[i] ?? 0,
      wind_kph: h.wind_speed_10m[i] ?? 0,
      condition: description(h.weather_code[i]),
    }));
    cached = { time: Date.now(), current, points };
    return { current, points };
  })();
  try { return await pending; } finally { pending = null; }
}

export interface RainModelComparison {
  model: string;
  rainfall24h: number | null;
  rainfall72h: number | null;
}
let comparisonCache: { at: number; values: RainModelComparison[] } | null = null;
export function useRainModelComparison() {
  const [models, setModels] = useState<RainModelComparison[]>(comparisonCache?.values ?? []);
  const [loading, setLoading] = useState(!comparisonCache);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (comparisonCache && Date.now() - comparisonCache.at < 30 * 60 * 1000) {
      setModels(comparisonCache.values); setLoading(false); return;
    }
    const controller = new AbortController();
    const [longitude, latitude] = PILILLA_CENTER;
    const names = [{ id: "best_match", name: "Best Match" }, { id: "ecmwf_ifs025", name: "ECMWF IFS 0.25°" }, { id: "gfs_seamless", name: "NOAA GFS" }];
    Promise.all(names.map(async m => {
      const q = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), hourly: "precipitation", models: m.id, forecast_days: "4", timezone: "UTC" });
      try {
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`, { signal: controller.signal });
        if (!response.ok) throw Error(`HTTP ${response.status}`);
        const result = await response.json() as { hourly?: { time?: string[]; precipitation?: (number | null)[] } };
        const rows = (result.hourly?.time ?? []).map((t, i) => ({ t: Date.parse(t + "Z"), v: result.hourly?.precipitation?.[i] }));
        const now = Date.now();
        const total = (hours: number) => {
          const matching = rows.filter(p => p.t >= now && p.t < now + hours * 3600000 && typeof p.v === "number" && Number.isFinite(p.v));
          return matching.length >= hours - 1 ? matching.reduce((sum, p) => sum + (p.v as number), 0) : null;
        };
        return { model: m.name, rainfall24h: total(24), rainfall72h: total(72) };
      } catch (e) {
        if (controller.signal.aborted) throw e;
        return { model: m.name, rainfall24h: null, rainfall72h: null };
      }
    })).then(values => {
      if (controller.signal.aborted) return;
      setModels(values); comparisonCache = { at: Date.now(), values };
      if (values.every(v => v.rainfall24h == null)) setError("Model comparison unavailable.");
      else setError(null);
    }).catch(e => { if (!controller.signal.aborted) setError(String(e)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  return { models, loading, error };
}

export function useOpenMeteo() {
  const [current, setCurrent] = useState<WeatherNow | null>(cached?.current ?? null);
  const [forecast, setForecast] = useState<ForecastPoint[]>(cached?.points ?? []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    requestForecast().then(data => {
      if (!active) return;
      setCurrent(data.current); setForecast(data.points); setError(null);
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : "Weather unavailable"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const upcoming = forecast.filter(p => new Date(p.forecast_for).getTime() >= Date.now());
  const next24 = upcoming.slice(0, 24);
  const averageRainfall = next24.length
    ? next24.reduce((sum, p) => sum + p.rain_mm, 0) / next24.length
    : null;
  return { current, forecast, loading, error, averageRainfall };
}
