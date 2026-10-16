import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import { Layers, MapPin, Droplets, Building2, Radio } from "lucide-react";
import { PILILLA_CENTER } from "@/data/pililla";
import { cn } from "@/lib/utils";

export interface MapBarangay {
  id: string;
  name: string;
  lat: number;
  lng: number;
  population?: number | null;
  elevation_m?: number | null;
  risk_score?: number;
  risk_level?: "low" | "moderate" | "high" | "critical";
}
export interface MapSensor {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status?: string | null;
  type?: string | null;
}
export interface MapCenter {
  id: string;
  name: string;
  lat: number;
  lng: number;
  capacity?: number | null;
  occupancy?: number | null;
}

type LayerKey = "heatmap" | "barangays" | "centers" | "sensors";

interface Props {
  defaultLayers?: Partial<Record<LayerKey, boolean>>;
  userLocation?: [number, number] | null; // [lng, lat] (kept for API compat)
  routes?: { coords: [number, number][]; color?: string; dashed?: boolean }[]; // coords as [lng, lat]
  styleVariant?: "satellite" | "dark" | "terrain" | "streets";
  className?: string;
  barangays?: MapBarangay[];
  sensors?: MapSensor[];
  centers?: MapCenter[];
  /** Kept for backwards-compat — Leaflet+OSM does not require a token */
  token?: string;
  onReady?: (map: L.Map) => void;
}

const RISK_COLOR: Record<string, string> = {
  low: "#33b5ff",
  moderate: "#ffcc33",
  high: "#ff8a3d",
  critical: "#ff3d3d",
};

// Tile providers — all free, no key required
const TILE_LAYERS = {
  streets: {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: "© OpenStreetMap contributors © CARTO",
    maxZoom: 19,
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    maxZoom: 19,
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: "© OpenStreetMap contributors © CARTO",
    maxZoom: 19,
  },
  terrain: {
    url: "https://tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: "Map data © OpenStreetMap contributors, SRTM | Map style © OpenTopoMap (CC-BY-SA)",
    maxZoom: 17,
  },
} as const;

export default function GISMap({
  defaultLayers,
  userLocation,
  routes,
  styleVariant = "streets",
  className,
  barangays = [],
  sensors = [],
  centers = [],
  onReady,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const heatRef = useRef<L.Layer | null>(null);
  const barangayLayerRef = useRef<L.LayerGroup | null>(null);
  const sensorLayerRef = useRef<L.LayerGroup | null>(null);
  const centerLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);

  const [baseMap, setBaseMap] = useState<"streets" | "satellite">("streets");
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    heatmap: true,
    barangays: true,
    centers: true,
    sensors: true,
    ...defaultLayers,
  });

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [PILILLA_CENTER[1], PILILLA_CENTER[0]],
      zoom: 10,
      zoomControl: true,
      attributionControl: true,
    });
    mapRef.current = map;
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false, debounceMoveend: true }));
    observer.observe(containerRef.current);
    const frame = requestAnimationFrame(() => map.invalidateSize({ pan: false }));

    barangayLayerRef.current = L.layerGroup().addTo(map);
    sensorLayerRef.current = L.layerGroup().addTo(map);
    centerLayerRef.current = L.layerGroup().addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);

    onReady?.(map);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      tileRef.current = null;
      heatRef.current = null;
      barangayLayerRef.current = null;
      sensorLayerRef.current = null;
      centerLayerRef.current = null;
      routeLayerRef.current = null;
      userMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tile layer (style variant)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileRef.current) {
      map.removeLayer(tileRef.current);
      tileRef.current = null;
    }
    const cfg = TILE_LAYERS[baseMap === "satellite" ? "satellite" : styleVariant];
    tileRef.current = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: cfg.maxZoom,
      keepBuffer: 4,
      updateWhenIdle: true,
    }).addTo(map);
  }, [styleVariant, baseMap]);

  // Heatmap + barangay markers
  useEffect(() => {
    const map = mapRef.current;
    const group = barangayLayerRef.current;
    if (!map || !group) return;

    // Heatmap (separate from marker group so it can be toggled independently)
    if (heatRef.current) {
      map.removeLayer(heatRef.current);
      heatRef.current = null;
    }
    const heatPoints = barangays
      .filter((b) => b.lat != null && b.lng != null)
      .map((b) => [Number(b.lat), Number(b.lng), Math.max(0.05, (b.risk_score ?? 0) / 100)] as [number, number, number]);

    if (heatPoints.length && layers.heatmap) {
      heatRef.current = (L as unknown as { heatLayer: (pts: [number, number, number][], opts: Record<string, unknown>) => L.Layer }).heatLayer(heatPoints, {
        radius: 45,
        blur: 35,
        maxZoom: 17,
        max: 1.0,
        gradient: { 0.2: "#33b5ff", 0.4: "#ffcc33", 0.7: "#ff8a3d", 1.0: "#ff3d3d" },
      }).addTo(map);
    }

    // Barangay circle markers + labels
    group.clearLayers();
    barangays
      .filter((b) => b.lat != null && b.lng != null)
      .forEach((b) => {
        const color = RISK_COLOR[b.risk_level ?? "low"];
        const marker = L.circleMarker([Number(b.lat), Number(b.lng)], {
          radius: 7,
          color: "#ffffff",
          weight: 1.5,
          fillColor: color,
          fillOpacity: 0.95,
        }).bindPopup(
          `<strong>${escapeHtml(b.name)}</strong><br/>` +
            `Risk: ${(b.risk_level ?? "low").toUpperCase()}${b.risk_score != null ? ` (${b.risk_score})` : ""}<br/>` +
            `Pop: ${(b.population ?? 0).toLocaleString()}<br/>` +
            `Elev: ${b.elevation_m ?? "—"}m`,
        );
        const label = L.tooltip({
          permanent: true,
          direction: "bottom",
          offset: [0, 10],
          className: "gis-label",
        }).setContent(escapeHtml(b.name));
        marker.bindTooltip(label);
        if (layers.barangays) marker.addTo(group);
      });
  }, [barangays, layers.heatmap, layers.barangays]);

  // Sensor markers
  useEffect(() => {
    const group = sensorLayerRef.current;
    if (!group) return;
    group.clearLayers();
    if (!layers.sensors) return;
    sensors
      .filter((s) => s.lat != null && s.lng != null)
      .forEach((s) => {
        const color = s.status === "online" ? "#1eff8c" : s.status === "degraded" ? "#ffcc33" : "#ff3d3d";
        const icon = L.divIcon({
          className: "gis-sensor-icon",
          html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #001;box-shadow:0 0 10px ${color}"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        L.marker([Number(s.lat), Number(s.lng)], { icon })
          .bindPopup(`<strong>${escapeHtml(s.name)}</strong><br/>Status: ${(s.status ?? "unknown").toUpperCase()}`)
          .addTo(group);
      });
  }, [sensors, layers.sensors]);

  // Evacuation centers
  useEffect(() => {
    const group = centerLayerRef.current;
    if (!group) return;
    group.clearLayers();
    if (!layers.centers) return;
    centers
      .filter((c) => c.lat != null && c.lng != null)
      .forEach((c) => {
        const icon = L.divIcon({
          className: "gis-center-icon",
          html: `<div style="width:24px;height:24px;border-radius:5px;background:#33b5ff;border:2px solid #fff;display:grid;place-items:center;box-shadow:0 0 12px #33b5ff;color:#001a2e;font-weight:900;font-size:13px;font-family:'JetBrains Mono',monospace">E</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        L.marker([Number(c.lat), Number(c.lng)], { icon })
          .bindPopup(
            `<strong>${escapeHtml(c.name)}</strong><br/>Capacity: ${c.occupancy ?? 0}/${c.capacity ?? "—"}`,
          )
          .addTo(group);
      });
  }, [centers, layers.centers]);

  // User location pin
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }
    if (!userLocation) return;
    const [lng, lat] = userLocation;
    const icon = L.divIcon({
      className: "gis-user-icon",
      html: `<div style="position:relative">
              <div style="width:18px;height:18px;border-radius:50%;background:#fff;border:3px solid #00d4ff;box-shadow:0 0 16px #00d4ff"></div>
              <div style="position:absolute;inset:-8px;border-radius:50%;border:2px solid #00d4ff;animation:status-pulse 2s infinite"></div>
            </div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
    userMarkerRef.current = L.marker([lat, lng], { icon }).addTo(map);
    map.flyTo([lat, lng], 14, { duration: 0.8 });
  }, [userLocation]);

  // Routes
  useEffect(() => {
    const group = routeLayerRef.current;
    if (!group) return;
    group.clearLayers();
    if (!routes) return;
    routes.forEach((r, i) => {
      const latlngs = r.coords.filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180).map(([lng, lat]) => [lat, lng] as [number, number]);
      if (latlngs.length < 2) return;
      const line = L.polyline(latlngs, {
        color: r.color || "#00d4ff",
        weight: i === 0 ? 5 : 3,
        opacity: i === 0 ? 0.95 : 0.65,
        dashArray: r.dashed ? "6 8" : undefined,
      });
      line.addTo(group);
    });
  }, [routes]);

  return (
    <div className={cn("relative glass-panel hud-brackets overflow-hidden", className || "h-[600px]")}>
      <div ref={containerRef} className="absolute inset-0 z-0 leaflet-mission" />

      <div className="absolute top-3 left-3 z-[500] glass-panel p-3 w-56 max-w-[calc(100%-1.5rem)]">
        <div className="flex items-center gap-2 mb-2">
          <Layers className="h-3.5 w-3.5 text-primary" />
          <span className="mono-label">MAP LAYERS</span>
        </div>
        <div className="flex gap-1 mb-3" role="group" aria-label="Base map">
          <button type="button" onClick={() => setBaseMap("streets")} className={cn("flex-1 text-xs rounded border px-2 py-1", baseMap === "streets" ? "border-primary text-primary bg-primary/15" : "border-primary/20")}>Road map</button>
          <button type="button" onClick={() => setBaseMap("satellite")} className={cn("flex-1 text-xs rounded border px-2 py-1", baseMap === "satellite" ? "border-primary text-primary bg-primary/15" : "border-primary/20")}>Satellite</button>
        </div>
        <div className="space-y-1.5">
          <LayerToggle icon={<Droplets />} label="Flood Risk Heatmap" k="heatmap" layers={layers} setLayers={setLayers} />
          <LayerToggle icon={<MapPin />} label="Barangay Markers" k="barangays" layers={layers} setLayers={setLayers} />
          <LayerToggle icon={<Building2 />} label="Evacuation Centers" k="centers" layers={layers} setLayers={setLayers} />
          <LayerToggle icon={<Radio />} label="Sensor Stations" k="sensors" layers={layers} setLayers={setLayers} />
        </div>
        <div className="mt-3 pt-3 border-t border-primary/15 mono-font text-[10px] text-muted-foreground">
          Road map: CARTO / OSM · Satellite: Esri
        </div>
      </div>

      <div className="absolute bottom-3 left-3 z-[500] glass-panel p-3">
        <div className="mono-label mb-2">RISK SCALE</div>
        <div className="flex items-center gap-3 text-[11px] mono-font">
          {(["low", "moderate", "high", "critical"] as const).map((k) => (
            <div key={k} className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: RISK_COLOR[k], boxShadow: `0 0 6px ${RISK_COLOR[k]}` }}
              />
              <span className="capitalize text-foreground/80">{k}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent animate-scan-line pointer-events-none z-[400]" />
    </div>
  );
}

function LayerToggle({
  icon,
  label,
  k,
  layers,
  setLayers,
}: {
  icon: React.ReactNode;
  label: string;
  k: LayerKey;
  layers: Record<LayerKey, boolean>;
  setLayers: (l: Record<LayerKey, boolean>) => void;
}) {
  const on = layers[k];
  return (
    <button
      onClick={() => setLayers({ ...layers, [k]: !on })}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition border",
        on
          ? "bg-primary/15 text-primary border-primary/40"
          : "text-muted-foreground border-transparent hover:bg-primary/5",
      )}
    >
      <span className="h-3.5 w-3.5">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          on ? "bg-primary shadow-[0_0_6px_hsl(var(--primary))]" : "bg-muted-foreground/40",
        )}
      />
    </button>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}
