import { CloudRain, Wind, Droplets, Gauge, Cloud, CloudLightning, CloudDrizzle } from "lucide-react";
import { Panel, PageHeader } from "@/components/mission/Panel";
import { EmptyState } from "@/components/mission/EmptyState";
import { useOpenMeteo, useRainModelComparison } from "@/hooks/useOpenMeteo";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";

const tt = {
  contentStyle: { background: "hsl(var(--surface-2))", border: "1px solid hsl(var(--primary) / 0.4)", borderRadius: 4, fontFamily: "JetBrains Mono", fontSize: 11 },
  labelStyle: { color: "hsl(var(--muted-foreground))" },
};

export default function Weather() {
  const { current, forecast: openWeatherForecast, loading: weatherLoading, error: weatherError } = useOpenMeteo();
  const { models, loading: modelsLoading, error: modelsError } = useRainModelComparison();
  const apiUpcoming = openWeatherForecast.filter(f => new Date(f.forecast_for).getTime() >= Date.now());
  const chartForecasts = apiUpcoming.slice(0, 24);
  const totals = [1, 3, 6, 12, 24].map(hours => ({ hours, value: apiUpcoming.slice(0, hours).length === hours ? apiUpcoming.slice(0, hours).reduce((sum, f) => sum + f.rain_mm, 0) : null }));
  const next24 = chartForecasts.map((f, i) => ({
    hour: i + 1,
    rain_mm: f.rain_mm ?? 0,
    label: new Date(f.forecast_for).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }),
  }));

  const byDay = new Map<string, { day: string; rain_mm: number; rain_chance: number; temps: number[]; condition: string | null }>();
  apiUpcoming.forEach(f => {
    const d = new Date(f.forecast_for);
    const key = d.toISOString().slice(0, 10);
    if (!byDay.has(key)) {
      byDay.set(key, {
        day: d.toLocaleDateString("en-PH", { weekday: "short" }),
        rain_mm: 0,
        rain_chance: 0,
        temps: [],
        condition: f.condition,
      });
    }
    const day = byDay.get(key)!;
    day.rain_mm += f.rain_mm ?? 0;
    day.rain_chance = Math.max(day.rain_chance, f.rain_chance ?? 0);
    if (f.temp_c != null) day.temps.push(f.temp_c);
  });
  const outlookDays = Array.from(byDay.values()).slice(0, 7);

  return (
    <div className="space-y-6">
      <PageHeader
        code="04"
        title="Weather Forecast & AI Flood Prediction"
        subtitle="Current weather and hourly precipitation forecasts from Open-Meteo for Pililla, Rizal."
      />

      <p className="text-xs text-muted-foreground">Weather source: Open-Meteo · Forecasts are model estimates, not measured rainfall.</p>
      <Panel label="CURRENT WEATHER · OPEN-METEO" title="Pililla, Rizal">
        {weatherLoading ? (
          <EmptyState icon={<CloudRain className="h-5 w-5" />} title="Loading live weather" />
        ) : weatherError ? (
          <EmptyState icon={<CloudRain className="h-5 w-5" />} title="Weather feed unavailable" description={weatherError} />
        ) : current ? (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-primary/15">
              <div>
                <div className="mono-label">CURRENT CONDITIONS</div>
                <div className="display-font text-4xl font-bold text-primary mt-2">{Math.round(current.main.temp)}°C</div>
                <div className="text-sm text-muted-foreground capitalize mt-1">{current.weather[0]?.description ?? "Unknown"}</div>
              </div>
              <div className="text-right mono-font text-xs text-muted-foreground">
                <div>FEELS LIKE {Math.round(current.main.feels_like)}°C</div>
                <div className="mt-2">UPDATED {new Date(current.dt * 1000).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-5">
              <WeatherMetric icon={<Droplets className="h-4 w-4" />} label="HUMIDITY" value={`${current.main.humidity}%`} />
              <WeatherMetric icon={<Wind className="h-4 w-4" />} label="WIND" value={`${(current.wind.speed * 3.6).toFixed(1)} km/h`} />
              <WeatherMetric icon={<Gauge className="h-4 w-4" />} label="PRESSURE" value={`${current.main.pressure} hPa`} />
              <WeatherMetric icon={<CloudRain className="h-4 w-4" />} label="RAIN (1H)" value={`${(current.rain?.["1h"] ?? 0).toFixed(1)} mm`} />
            </div>
          </div>
        ) : null}
      </Panel>

      <Panel label="RAINFALL ACCUMULATION" title="Predicted Rainfall Totals">
        <p className="mb-4 text-xs text-muted-foreground">Accumulated precipitation starting from the next forecast hour. These are model estimates, not measured rainfall or verified flood thresholds.</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {totals.map(item => <div key={item.hours} className="rounded-lg border border-primary/15 bg-surface-2/60 p-3 transition-colors duration-200 hover:border-primary/40">
            <div className="mono-label">{item.hours}H TOTAL</div>
            <div className="mono-font text-xl font-bold text-primary mt-2">{item.value == null ? "—" : item.value.toFixed(1)} <span className="text-xs">mm</span></div>
          </div>)}
        </div>
      </Panel>

      <Panel label="MULTI-MODEL COMPARISON" title="Rainfall Forecast Agreement">
        <p className="mb-4 text-xs text-muted-foreground">Open-Meteo Best Match, ECMWF, and NOAA GFS. These are independent forecast configurations, not independent observations. Disagreement signals model spread, not a calibrated confidence percentage.</p>
        {modelsLoading && !models.length ? <div className="mono-font text-sm text-muted-foreground animate-pulse">Loading forecast models…</div> : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {models.map(m => <div key={m.model} className="rounded-lg bg-surface-2/60 border border-primary/15 p-4">
              <div className="font-semibold text-sm">{m.model}</div>
              <div className="mt-3 text-sm mono-font text-primary">24h: {m.rainfall24h == null ? "Unavailable" : m.rainfall24h.toFixed(1) + " mm"}</div>
              <div className="mt-1 text-xs text-muted-foreground mono-font">72h: {m.rainfall72h == null ? "Unavailable" : m.rainfall72h.toFixed(1) + " mm"}</div>
            </div>)}
          </div>
        )}
        {modelsError && <p className="mt-3 text-xs text-risk-moderate">{modelsError}</p>}
        {(() => {
          const valid = models.map(m => m.rainfall24h).filter((v): v is number => v != null);
          if (valid.length < 2) return <p className="mt-3 text-xs text-muted-foreground">At least two models are needed to compare estimates.</p>;
          const min = Math.min(...valid), max = Math.max(...valid);
          return <p className="mt-3 text-sm text-muted-foreground">24-hour model range: <strong className="text-foreground">{min.toFixed(1)}–{max.toFixed(1)} mm</strong>. This range is not an official uncertainty interval.</p>;
        })()}
      </Panel>

      <Panel label="NEXT 24 HOURS · HOURLY FORECAST" title="Rainfall Outlook">
        {weatherLoading ? null : next24.length === 0 ? (
          <EmptyState
            icon={<CloudRain className="h-5 w-5" />}
            title="No forecast data"
            description="The rainfall outlook will appear when forecast data is available."
          />
        ) : (
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={next24} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--primary) / 0.15)" />
                <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "JetBrains Mono" }} stroke="hsl(var(--primary) / 0.3)" />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "JetBrains Mono" }} stroke="hsl(var(--primary) / 0.3)" />
                <Tooltip {...tt} />
                <Bar dataKey="rain_mm" name="Forecast rain (mm)">
                  {next24.map((_, i) => (
                    <Cell key={i} fill={next24[i].rain_mm > 25 ? "hsl(var(--risk-high))" : next24[i].rain_mm > 15 ? "hsl(var(--risk-moderate))" : "hsl(var(--primary))"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      <Panel label="EXTENDED OUTLOOK" title="7-Day Open-Meteo Forecast">
        {outlookDays.length === 0 ? (
          <EmptyState title="No extended forecast" description="Open-Meteo forecast data is unavailable." />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {outlookDays.map((d, i) => {
              const high = d.temps.length ? Math.round(Math.max(...d.temps)) : null;
              const low = d.temps.length ? Math.round(Math.min(...d.temps)) : null;
              const Icon = d.rain_mm > 40 ? CloudLightning : d.rain_mm > 20 ? CloudRain : d.rain_mm > 10 ? CloudDrizzle : Cloud;
              return (
                <div key={i} className="p-4 rounded bg-surface-2/60 border border-primary/15 text-center transition-[border-color,transform] duration-200 hover:border-primary/40 hover:-translate-y-0.5 motion-reduce:transition-none">
                  <div className="mono-label mb-2">{d.day.toUpperCase()}</div>
                  <Icon className="h-8 w-8 mx-auto text-primary" />
                  <div className="mt-2">
                    <span className="font-bold">{high ?? "—"}°</span><span className="text-muted-foreground text-xs"> / {low ?? "—"}°</span>
                  </div>
                  <div className="mono-font text-xs text-primary mt-1">{d.rain_mm.toFixed(0)} mm</div>
                  <div className="mono-label">{d.rain_chance}% peak hourly chance</div>
                  <div className="mt-2 text-[10px] text-muted-foreground">{i <= 2 ? "Near-term outlook" : i <= 4 ? "Increasing uncertainty" : "Long-range outlook"}</div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

function WeatherMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 text-primary/80 mb-1">{icon}<span className="mono-label">{label}</span></div>
      <div className="mono-font text-sm font-semibold">{value}</div>
    </div>
  );
}
