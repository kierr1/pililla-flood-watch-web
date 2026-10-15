import { Panel, PageHeader, RiskBadge } from "@/components/mission/Panel";
import { EmptyState } from "@/components/mission/EmptyState";
import { useFloodReadings, useBarangays } from "@/hooks/useData";
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { BarChart3, Download, Image as ImageIcon } from "lucide-react";

const tt = {
  contentStyle: { background: "hsl(var(--surface-2))", border: "1px solid hsl(var(--primary) / 0.4)", borderRadius: 4, fontFamily: "JetBrains Mono", fontSize: 11 },
  labelStyle: { color: "hsl(var(--muted-foreground))" },
};

export default function Analytics() {
  const { data: readings, loading: readingsLoading } = useFloodReadings();
  const { data: barangays } = useBarangays();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  function downloadReadingHistory() {
    const columns = ["Recorded At", "Station ID", "Rainfall (mm)", "Water Level (m)", "Soil Moisture (%)", "Wind Speed", "Image URL"];
    const rows = readings.map(reading => [
      reading.recorded_at,
      reading.station_id ?? "",
      reading.rainfall_mm?.toString() ?? "",
      reading.water_level_m?.toString() ?? "",
      reading.soil_moisture_percent?.toString() ?? "",
      reading.wind_speed?.toString() ?? "",
      reading.image_url ?? "",
    ]);
    const csv = [columns, ...rows]
      .map(row => row.map(value => `"${value.replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const file = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `flood-reading-history-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const trend = [...readings].slice(0, 24).reverse().map(r => ({
    time: new Date(r.recorded_at).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: false }),
    wind_speed: r.wind_speed ?? 0,
    water_level: r.water_level_m ?? 0,
    image_url: r.image_url ?? ""
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        code="09"
        title="Data Visualization"
        subtitle="Cross-cutting analytics on real sensor data: rainfall vs water level, barangay distributions, and recent readings."
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel label="CORRELATION" title="Rainfall vs Water Level (24h)">
          {trend.length === 0 ? (
            <EmptyState icon={<BarChart3 className="h-5 w-5" />} title="No readings yet" description="Charts populate as flood readings stream in." />
          ) : (
            <div className="h-72">
              <ResponsiveContainer>
                <ComposedChart data={trend}>
                  <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--primary) / 0.15)" />
                  <XAxis dataKey="time" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "JetBrains Mono" }} stroke="hsl(var(--primary) / 0.3)" />
                  <YAxis yAxisId="l" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "JetBrains Mono" }} stroke="hsl(var(--primary) / 0.3)" />
                  <YAxis yAxisId="r" orientation="right" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "JetBrains Mono" }} stroke="hsl(var(--risk-high) / 0.3)" />
                  <Tooltip {...tt} />
                  <Bar yAxisId="l" dataKey="wind_speed" fill="hsl(var(--primary) / 0.6)" name="Wind Speed m/s" />
                  <Line yAxisId="r" type="monotone" dataKey="water_level" stroke="hsl(var(--risk-high))" strokeWidth={2} dot={false} name="Water (m)" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel label="GEOSPATIAL" title="Barangay Elevation Distribution">
          {barangays.length === 0 ? (
            <EmptyState title="No barangays registered" />
          ) : (
            <div className="h-72">
              <ResponsiveContainer>
                <ComposedChart data={barangays.map(b => ({ name: b.name, elev: b.elevation_m ?? 0, pop: b.population ?? 0 }))}>
                  <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--primary) / 0.15)" />
                  <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "JetBrains Mono" }} stroke="hsl(var(--primary) / 0.3)" />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "JetBrains Mono" }} stroke="hsl(var(--primary) / 0.3)" />
                  <Tooltip {...tt} />
                  <Bar dataKey="elev" name="Elevation (m)" fill="hsl(var(--primary) / 0.6)" />
                  <Line type="monotone" dataKey="pop" stroke="hsl(var(--risk-moderate))" strokeWidth={2} name="Population" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>

      <Panel
        label="EVENT LOG"
        title="Recent Sensor Readings"
        action={
          <button
            type="button"
            onClick={downloadReadingHistory}
            disabled={readingsLoading || readings.length === 0}
            className="inline-flex items-center gap-2 rounded border border-primary/40 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Download History
          </button>
        }
      >
        {trend.length === 0 ? (
          <EmptyState title="No readings logged" description="Once sensor stations begin reporting, recent readings will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left mono-label border-b border-primary/15">
                  <th className="py-2 pr-3">TIME</th>
                  <th className="py-2 pr-3">WIND SPEED</th>
                  <th className="py-2 pr-3">WATER LEVEL</th>
                  <th className="py-2 pr-3">DELTA</th>
                  <th className="py-2 pr-3">IMAGE</th>
                </tr>
              </thead>
              <tbody className="mono-font">
                {trend.slice(-10).reverse().map((t, i) => (
                  <tr key={i} className="border-b border-primary/5 hover:bg-primary/5">
                    <td className="py-2 pr-3">{t.time}</td>
                    <td className="py-2 pr-3 tabular-nums">{t.wind_speed.toFixed(1)} m/s</td>
                    <td className="py-2 pr-3 tabular-nums">{t.water_level.toFixed(2)} m</td>
                    <td className="py-2 pr-3">
                      {t.water_level > 2.0 ? <RiskBadge level="high" /> : t.water_level > 1.5 ? <RiskBadge level="moderate" /> : <RiskBadge level="low" />}
                    </td>
                    <td className="py-2 pr-3">
                      {t.image_url ? (
                        <button
                          type="button"
                          onClick={() => setSelectedImage(t.image_url)}
                          aria-label={`Open sensor image recorded at ${t.time}`}
                          className="inline-flex items-center gap-1.5 text-primary hover:underline"
                        >
                          <ImageIcon className="h-4 w-4" />
                          Open image
                        </button>
                      ) : (
                        <span className="text-muted-foreground">No image</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Dialog open={selectedImage !== null} onOpenChange={(open) => !open && setSelectedImage(null)}>
        <DialogContent className="max-w-5xl border-primary/20 bg-background p-4 sm:p-6">
          <DialogTitle className="sr-only">Sensor image</DialogTitle>
          {selectedImage && (
            <img
              src={selectedImage}
              alt="Flood sensor reading"
              className="max-h-[75vh] w-full object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
