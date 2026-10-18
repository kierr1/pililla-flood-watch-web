import { useEffect, useMemo, useState } from "react";
import { Locate, Navigation, Clock, Route as RouteIcon, Building2, Compass } from "lucide-react";
import { Link } from "react-router-dom";
import { Panel, PageHeader } from "@/components/mission/Panel";
import { EmptyState } from "@/components/mission/EmptyState";
import GISMap from "@/components/map/GISMap";
import { distanceKm } from "@/data/pililla";
import { kShortestRoadRoutes } from "@/lib/kShortestRoutes";
import { useEvacuationCenters, useBarangays, useSensorStations } from "@/hooks/useData";
import { cn } from "@/lib/utils";

type LngLat = [number, number];

export default function Evacuation() {
  const [user, setUser] = useState<LngLat | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roadRoutes, setRoadRoutes] = useState<{ coords: LngLat[]; color: string; dashed?: boolean }[]>([]);
  const [roadStats, setRoadStats] = useState<{ distance: number; duration: number } | null>(null);
  const [routingStatus, setRoutingStatus] = useState("Select an evacuation center and locate yourself to calculate a road route.");

  const { data: centers, loading: centersLoading } = useEvacuationCenters();
  const { data: barangays } = useBarangays();
  const { data: sensors } = useSensorStations();

  const candidates = useMemo(() => {
    if (!user) return [];
    return centers
      .filter(c => c.lat != null && c.lng != null)
      .map(c => ({
        ...c,
        coords: [Number(c.lng), Number(c.lat)] as LngLat,
        distance_km: distanceKm(user, [Number(c.lng), Number(c.lat)]),
      }))
      .sort((a, b) => a.distance_km - b.distance_km);
  }, [user, centers]);

  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    if (candidates.length && !selected) setSelected(candidates[0].id);
  }, [candidates, selected]);

  function locate() {
    setLocating(true);
    setError(null);
    if (!navigator.geolocation) {
      setError("Geolocation unavailable. Allow location access to calculate a route.");
      setUser(null);
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setUser([pos.coords.longitude, pos.coords.latitude]); setLocating(false); },
      () => { setError("Location denied. Enable precise location access to calculate a road route."); setUser(null); setLocating(false); },
      { timeout: 8000, enableHighAccuracy: true },
    );
  }

  const target = candidates.find(c => c.id === selected);

  // Request genuine road geometries. Do not construct synthetic zigzag routes.
  const targetLng = target?.coords[0];
  const targetLat = target?.coords[1];
  useEffect(() => {
    setRoadRoutes([]);
    setRoadStats(null);
    if (!user || targetLng == null || targetLat == null) return;
    const controller = new AbortController();
    setRoutingStatus("Calculating route on mapped roads...");
    async function calculate() {
      try {
        // K-shortest loopless paths over real mapped OSM road edges.
        let usable: { coords: LngLat[]; distance: number; duration: number }[];
        let algorithm = "K-shortest (Yen)";
        try {
          usable = await kShortestRoadRoutes(user!, [targetLng!, targetLat!], controller.signal, 3);
        } catch (graphError) {
          if (controller.signal.aborted) return;
          // OSRM provides genuine drivable road geometries when Overpass is unavailable.
          algorithm = "OSRM fallback";
          const url = `https://router.project-osrm.org/route/v1/driving/${user![0]},${user![1]};${targetLng},${targetLat}?overview=full&geometries=geojson&alternatives=true&steps=false`;
          const response = await fetch(url, { signal: controller.signal });
          if (!response.ok) throw graphError;
          const data = await response.json();
          if (data.code !== "Ok" || !Array.isArray(data.routes) || !data.routes.length) throw graphError;
          const snaps: number[] = (data.waypoints ?? []).map((p: {distance?: number}) => p.distance ?? Infinity);
          if (snaps.length !== 2 || snaps.some(d => !Number.isFinite(d) || d > 150))
            throw Error("GPS or shelter is over 150 meters from a mapped road.");
          usable = data.routes.slice(0, 3).map((route: {geometry?: {coordinates?: unknown}; distance: number; duration: number}) => {
            const coords = route.geometry?.coordinates;
            if (!Array.isArray(coords)) return null;
            const points: LngLat[] = coords.filter((p: unknown): p is LngLat =>
              Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])
              && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90
            );
            if (points.length < 2 || points.slice(1).some((p, i) => distanceKm(points[i], p) > 1)) return null;
            if (!Number.isFinite(route.distance) || !Number.isFinite(route.duration)) return null;
            return { coords: points, distance: route.distance, duration: route.duration };
          }).filter((route: unknown): route is { coords: LngLat[]; distance: number; duration: number } => route !== null);
        }
        if (controller.signal.aborted) return;
        if (!usable.length) throw Error("No connected road route found.");
        const colors = ["#00ffd4", "#ffcc33", "#ff8a3d"];
        setRoadRoutes(usable.map((r, i) => ({ coords: r.coords, color: colors[i], dashed: i > 0 })));
        setRoadStats({ distance: usable[0].distance / 1000, duration: usable[0].duration / 60 });
        setRoutingStatus(`${algorithm}: ${usable.length} mapped route(s). K-shortest estimates use a fixed 25 km/h, not traffic. Roads, closures and flood safety are NOT verified.`);
      } catch (err) {
        if (controller.signal.aborted) return;
        setRoadRoutes([]);
        setRoadStats(null);
        setRoutingStatus(err instanceof Error ? err.message : "Road routing failed.");
      }
    }
    void calculate();
    return () => controller.abort();
  }, [user, targetLng, targetLat]);

  const mapBarangays = barangays.filter(b => b.lat && b.lng).map(b => ({
    id: b.id, name: b.name, lat: Number(b.lat), lng: Number(b.lng),
  }));
  const mapSensors = sensors.filter(s => s.lat && s.lng).map(s => ({
    id: s.id, name: s.name, lat: Number(s.lat), lng: Number(s.lng), status: s.status,
  }));
  const mapCenters = centers.filter(c => c.lat && c.lng).map(c => ({
    id: c.id, name: c.name, lat: Number(c.lat), lng: Number(c.lng), capacity: c.capacity, occupancy: c.occupancy,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        code="03"
        title="Evacuation Road Routing"
        subtitle="Find up to three mapped driving routes with K-shortest-path search. Routes are not flood-safety verified."
        action={
          <button
            onClick={locate}
            disabled={locating || centers.length === 0}
            className="inline-flex items-center gap-2 px-5 py-3 rounded bg-gradient-primary text-primary-foreground font-bold text-sm shadow-glow hover:scale-105 transition-transform disabled:opacity-60"
          >
            <Locate className={cn("h-4 w-4", locating && "animate-spin")} />
            {locating ? "ACQUIRING GPS..." : user ? "RECALCULATE ROUTE" : "FIND ROAD ROUTE"}
          </button>
        }
      />

      {error && <div className="glass-panel border-risk-moderate/40 px-4 py-2.5 text-sm text-risk-moderate">{error}</div>}
      <p className="text-xs text-muted-foreground" role="status">{routingStatus}</p>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <GISMap
            className="h-[560px]"
            userLocation={user}
            routes={roadRoutes}
            barangays={mapBarangays}
            sensors={mapSensors}
            centers={mapCenters}
            defaultLayers={{ heatmap: true, barangays: true, centers: true, sensors: false }}
          />
        </div>

        <div className="space-y-4">
          <Panel label="ROUTE BRIEFING" title={target ? target.name : "Awaiting GPS Lock"}>
            {centers.length === 0 && !centersLoading ? (
              <EmptyState
                icon={<Building2 className="h-5 w-5" />}
                title="No evacuation centers"
                description="Admins must register evacuation centers before routes can be calculated."
                action={<Link to="/admin" className="text-primary text-xs hover:underline">Open Mission Control →</Link>}
              />
            ) : !user ? (
              <EmptyState
                icon={<Compass className="h-5 w-5" />}
                title="No origin set"
                description='Tap "Find Safest Route Now" to detect your position via GPS and allow location access.'
              />
            ) : !target ? (
              <EmptyState icon={<Building2 className="h-5 w-5" />} title="No center selected" description="Pick an evacuation center below." />
            ) : (
              <RouteBriefing target={target} routesCount={roadRoutes.length} roadStats={roadStats} />
            )}
          </Panel>

          <Panel label="SHELTER CANDIDATES" title="Nearest Centers">
            {!user ? (
              <p className="text-sm text-muted-foreground">Acquire GPS to rank shelters by distance.</p>
            ) : candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No centers available.</p>
            ) : (
              <ul className="space-y-2">
                {candidates.slice(0, 5).map(c => {
                  const isFull = (c.occupancy ?? 0) >= (c.capacity ?? 0) && (c.capacity ?? 0) > 0;
                  const isSel = c.id === selected;
                  return (
                    <li key={c.id}>
                      <button
                        onClick={() => setSelected(c.id)}
                        disabled={isFull}
                        className={cn(
                          "w-full text-left p-3 rounded border transition",
                          isSel ? "border-primary bg-primary/15 shadow-glow" : "border-primary/15 bg-surface-2/40 hover:border-primary/40",
                          isFull && "opacity-50 cursor-not-allowed",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-sm">{c.name}</span>
                          <span className="mono-font text-xs text-primary">{c.distance_km.toFixed(2)} km</span>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="mono-label">{c.status ?? "available"}</span>
                          <span className={cn("mono-font text-[10px]", isFull ? "text-risk-critical" : "text-success")}>
                            {isFull ? "FULL" : `${(c.capacity ?? 0) - (c.occupancy ?? 0)} OPEN`}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function RouteBriefing({ target, routesCount, roadStats }: { target: { coords: LngLat; distance_km: number; capacity: number | null; occupancy: number | null }; routesCount: number; roadStats: { distance: number; duration: number } | null }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat icon={<RouteIcon className="h-4 w-4" />} label="Distance" value={roadStats ? `${roadStats.distance.toFixed(2)} km` : "Pending"} />
        <Stat icon={<Clock className="h-4 w-4" />} label="Est. Time" value={roadStats ? `${Math.round(roadStats.duration)} min` : "Pending"} />
        <Stat icon={<Navigation className="h-4 w-4" />} label="Routes" value={`${routesCount} avail.`} />
        <Stat icon={<Building2 className="h-4 w-4" />} label="Capacity" value={`${target.occupancy ?? 0}/${target.capacity ?? "—"}`} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="h-1.5 w-6 rounded" style={{ background: "#00ffd4", boxShadow: "0 0 8px #00ffd4" }} />
          <span className="font-semibold">PRIMARY</span>
          <span className="mono-label ml-auto">SHORTEST MAPPED</span>
        </div>
        {routesCount > 1 && <div className="flex items-center gap-2 text-xs">
          <span className="h-1.5 w-6 rounded border-dashed border-2" style={{ borderColor: "#ffcc33" }} />
          <span className="font-semibold">ALTERNATIVE</span>
          <span className="mono-label ml-auto">IF AVAILABLE · UNVERIFIED</span>
        </div>}
      </div>

      <a
        href={`https://www.google.com/maps/dir/?api=1&destination=${target.coords[1]},${target.coords[0]}&travelmode=driving`}
        target="_blank" rel="noreferrer"
        className="block text-center w-full px-4 py-2.5 rounded bg-primary text-primary-foreground font-bold text-sm hover:bg-primary-glow transition"
      >
        OPEN TURN-BY-TURN NAVIGATION ↗
      </a>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="p-3 rounded bg-surface-2/60 border border-primary/15">
      <div className="flex items-center gap-2 mono-label">{icon}{label}</div>
      <div className="mono-font font-bold text-base mt-1">{value}</div>
    </div>
  );
}

