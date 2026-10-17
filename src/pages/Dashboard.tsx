import { CloudRain, Wind, Droplets, Shield, AlertTriangle, Map as MapIcon, Inbox } from "lucide-react";
import { Link } from "react-router-dom";
import { Panel, MissionCard, RiskBadge, PageHeader } from "@/components/mission/Panel";
import { EmptyState } from "@/components/mission/EmptyState";
import {
  useBarangays, useSensorStations, useEvacuationCenters, useAlerts, useFloodReadings,
} from "@/hooks/useData";
import { useOpenMeteo } from "@/hooks/useOpenMeteo";
import { useLiveSensorReading } from "@/hooks/useLiveSensorReading";
import { predictFlood, type FloodFeatures } from "@/lib/floodModel";
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

const chartTooltip = {
  contentStyle: {
    background: "hsl(var(--surface-2))",
    border: "1px solid hsl(var(--primary) / 0.4)",
    borderRadius: 4, fontFamily: "JetBrains Mono", fontSize: 11,
  },
  labelStyle: { color: "hsl(var(--muted-foreground))" },
};

const RISK_RANK: Record<string, number> = { critical: 4, high: 3, moderate: 2, low: 1 };

// Provisional site-specific trigger bands; not official flood warnings.
// Water level means height above the local datum, not ultrasonic air gap.
type SensorRisk = "low" | "moderate" | "high" | "critical";
function sensorFloodAlert(water: number | null | undefined, wind: number | null | undefined): SensorRisk | null {
  if (water == null && wind == null) return null;
  const waterRank = water == null ? 0 : water >= 1.20 ? 4 : water >= 0.75 ? 3 : water >= 0.30 ? 2 : 1;
  // Wind bands (m/s) are provisional operational thresholds, not calibrated forecasts.
  const windRank = wind == null ? 0 : wind >= 24.5 ? 4 : wind >= 17.2 ? 3 : wind >= 10.8 ? 2 : 1;
  return (["low", "moderate", "high", "critical"] as const)[Math.max(waterRank, windRank) - 1];
}

export default function Dashboard() {
  const { data: barangays } = useBarangays();
  const { data: sensors } = useSensorStations();
  const { data: centers } = useEvacuationCenters();
  const { data: alerts } = useAlerts();
  const { data: readings } = useFloodReadings();
  const { reading: liveReading, lastUpdated: liveUpdated, error: liveError } = useLiveSensorReading();
  const { averageRainfall: forecastRainfall, error: weatherRainError } = useOpenMeteo();

  const recent = readings.slice(0, 24);
  const avg = (arr: (number | null | undefined)[]) => {
    const v = arr.filter((x): x is number => typeof x === "number");
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  };

  const features: FloodFeatures = {
    rainfall_mm: avg(recent.map(r => r.rainfall_mm)),
    water_level_m: avg(recent.map(r => r.water_level_m)),
    wind_speed: avg(recent.map(r => r.wind_speed)),
    soil_moisture_percent: avg(recent.map(r => r.soil_moisture_percent)),
    elevation_m: avg(barangays.map(b => b.elevation_m)) || 10,
    river_distance_m: 280,
    drainage_capacity_percent: 55,
    slope_degree: 4,
    satellite_ndwi: 0.42,
    road_condition_score: 68,
    population_density_per_km2: 3400,
  };
  const hasReadings = recent.length > 0;
  const pred = hasReadings ? predictFlood(features) : null;

  const trend = [...recent].reverse().map(r => ({
    time: new Date(r.recorded_at).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: false }),
    wind_speed: r.wind_speed ?? 0,
    water_level: r.water_level_m ?? 0,
  }));

  const safeRoutes = centers.length;
  const seatsOpen = centers.reduce((a, c) => a + Math.max(0, (c.capacity ?? 0) - (c.occupancy ?? 0)), 0);
  const criticalAlerts = alerts.filter(a => a.level === "critical").length;
  const highAlerts = alerts.filter(a => a.level === "high").length;

  const freshLive = !!liveReading && Number.isFinite(Date.parse(liveReading.updated_at)) && (Date.now() - Date.parse(liveReading.updated_at)) < 90000 && (Date.now() - Date.parse(liveReading.updated_at)) > -10000;
  const sensorRisk = freshLive ? sensorFloodAlert(liveReading?.water_level_m, liveReading?.wind_speed) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        code="01"
        title="Real-Time Flood Detection Dashboard"
        subtitle="Live telemetry from sensor stations and ML risk inference for Pililla municipality."
        action={
          <Link
            to="/evacuation"
            className="inline-flex items-center gap-2 px-5 py-3 rounded bg-gradient-primary text-primary-foreground font-bold text-sm shadow-glow hover:scale-105 transition-transform"
          >
            <Shield className="h-4 w-4" /> FIND SAFEST ROUTE NOW
          </Link>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MissionCard
          label="FLOOD RISK ALERT"
          value={sensorRisk ? sensorRisk.toUpperCase() : "—"}
          tone={sensorRisk ?? "default"}
          icon={<AlertTriangle className="h-5 w-5" />}
          sub={sensorRisk ? <span className="mono-font">Live wind + water triggers · provisional</span> : <span className="mono-label">Awaiting fresh sensor data</span>}
        />
        <MissionCard
          label="ACTIVE ALERTS"
          value={alerts.length}
          tone={criticalAlerts ? "critical" : highAlerts ? "high" : "moderate"}
          icon={<AlertTriangle className="h-5 w-5" />}
          sub={<span className="mono-font">{criticalAlerts} critical · {highAlerts} high</span>}
        />
        <MissionCard
          label="SAFE ROUTES AVAILABLE"
          value={safeRoutes}
          tone="low"
          icon={<MapIcon className="h-5 w-5" />}
          sub={<span className="mono-font">{seatsOpen.toLocaleString()} seats open</span>}
        />
        <MissionCard
          label="MONITORED BARANGAYS"
          value={barangays.length}
          tone="moderate"
          icon={<MapIcon className="h-5 w-5" />}
          sub={<span className="mono-font">{sensors.length} sensors</span>}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Telemetry icon={<CloudRain className="h-4 w-4" />} label="RAINFALL (avg, forecast 1h)" value={forecastRainfall !== null ? forecastRainfall.toFixed(1) : "—"} unit="mm" />
        <Telemetry icon={<Droplets className="h-4 w-4" />} label="WATER LEVEL · LIVE" value={liveReading?.water_level_m != null ? liveReading.water_level_m.toFixed(2) : "—"} unit="m" />
        <Telemetry icon={<Wind className="h-4 w-4" />} label="WIND SPEED · LIVE" value={liveReading?.wind_speed != null ? liveReading.wind_speed.toFixed(2) : "—"} unit="m/s" />
      </div>

      <p className="mono-font text-[11px] text-muted-foreground">Live sensor updates every 20 seconds from the Raspberry Pi. Flood Risk Alert uses provisional 5-ft datum thresholds (water 0.30/0.75/1.20 m; wind 10.8/17.2/24.5 m/s), takes the higher risk, and is not an official warning. {liveReading ? `Last update: ${new Date(liveReading.updated_at).toLocaleTimeString("en-PH")}` : liveUpdated ? "Live telemetry is stale/offline" : "Awaiting live telemetry"}{liveError ? ` · ${liveError}` : ""}. Historical charts and Data Visualization use 30-minute saved readings.</p>
      {weatherRainError && <p className="text-xs text-muted-foreground">Open-Meteo rainfall forecast: {weatherRainError}</p>}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Panel
          label="TIMESERIES · 24H"
          title="Wind Speed & Water Level Trend"
          className="xl:col-span-2"
          action={pred && <RiskBadge level={pred.risk_level} />}
        >
          {trend.length === 0 ? (
            <EmptyState icon={<Inbox className="h-5 w-5" />} title="No sensor readings yet" description="Once sensor stations begin reporting, the rainfall and water-level trend will appear here." />
          ) : (
            <div className="h-72">
              <ResponsiveContainer>
                <AreaChart data={trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="g-wind" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="g-water" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--risk-high))" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="hsl(var(--risk-high))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--primary) / 0.15)" />
                  <XAxis dataKey="time" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "JetBrains Mono" }} stroke="hsl(var(--primary) / 0.3)" />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "JetBrains Mono" }} stroke="hsl(var(--primary) / 0.3)" />
                  <Tooltip {...chartTooltip} />
                  <Area type="monotone" dataKey="wind_speed" name="Wind Speed (m/s)" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#g-wind)" />
                  <Area type="monotone" dataKey="water_level" name="Water (m)" stroke="hsl(var(--risk-high))" strokeWidth={2} fill="url(#g-water)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel label="ML INFERENCE" title="Prediction Confidence">
          {!pred ? (
            <EmptyState title="Awaiting telemetry" description="Inference activates once flood readings stream in." />
          ) : (
            <div className="text-center py-6">
              <div className="mono-label">CURRENT CONFIDENCE</div>
              <div className="display-font text-6xl font-bold text-accent text-glow tabular-nums my-3">{pred.confidence}%</div>
              <RiskBadge level={pred.risk_level} />
              <div className="mono-font text-[11px] text-muted-foreground mt-4">
                Model: heuristic v2.1.3 · {recent.length} reading{recent.length !== 1 ? "s" : ""} aggregated
              </div>
            </div>
          )}
        </Panel>
      </div>

      <Panel label="GEOSPATIAL ASSESSMENT" title="Barangay Roster">
        {barangays.length === 0 ? (
          <EmptyState
            title="No barangays registered"
            description="Add Pililla barangays from Mission Control to populate the geospatial roster."
            action={<Link to="/admin" className="text-primary text-xs hover:underline">Open Mission Control →</Link>}
          />
        ) : (
          <ul className="space-y-2">
            {barangays.map(b => (
              <li key={b.id} className="flex items-center gap-3 px-3 py-2.5 rounded bg-surface-2/60 border border-primary/10">
                <span className="font-medium flex-1 min-w-0 truncate">{b.name}</span>
                <span className="mono-font text-xs text-muted-foreground hidden sm:inline">{(b.population ?? 0).toLocaleString()} pop</span>
                <span className="mono-font text-xs text-muted-foreground hidden md:inline">elev {b.elevation_m ?? "—"}m</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Telemetry({ icon, label, value, unit }: { icon: React.ReactNode; label: string; value: string; unit?: string }) {
  return (
    <div className="glass-panel p-3 flex items-center gap-3">
      <div className="h-9 w-9 rounded grid place-items-center bg-primary/10 text-primary border border-primary/30">{icon}</div>
      <div className="min-w-0">
        <div className="mono-label">{label}</div>
        <div className="mono-font text-base font-semibold tabular-nums">
          {value}{unit && <span className="text-xs text-muted-foreground ml-1">{unit}</span>}
        </div>
      </div>
    </div>
  );
}
