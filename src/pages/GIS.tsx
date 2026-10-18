import { Panel, PageHeader } from "@/components/mission/Panel";
import { EmptyState } from "@/components/mission/EmptyState";
import GISMap from "@/components/map/GISMap";
import { useSensorStations, useEvacuationCenters } from "@/hooks/useData";
import { useFloodRisk } from "@/hooks/useFloodRisk";
import { Map as MapIcon, Radio, Building2, Activity, Navigation, X } from "lucide-react";
import { useEffect, useState } from "react";

export default function GIS() {
  const { barangays, loading: bLoading, lastEventAt } = useFloodRisk();
  const { data: sensors, loading: sLoading } = useSensorStations();
  const { data: centers, loading: cLoading } = useEvacuationCenters();

  // "Updated Xs ago" ticker
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const sinceLabel = (() => {
    if (!lastEventAt) return "Awaiting telemetry";
    const s = Math.max(0, Math.floor((now - new Date(lastEventAt).getTime()) / 1000));
    if (s < 60) return `Updated ${s}s ago`;
    const m = Math.floor(s / 60);
    return `Updated ${m}m ago`;
  })();

  // --- NEW: Routing State & Logic ---
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [routingDestination, setRoutingDestination] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);
  const [routeStatus, setRouteStatus] = useState<string | null>(null);

  // Ask a road router for a complete road geometry. Never draw a straight
  // line between the GPS location and the evacuation center.
  useEffect(() => {
    setRouteCoords([]);
    if (!routingDestination) {
      setRouteStatus(null);
      return;
    }
    if (!userLocation) {
      setRouteStatus("Enable location access to calculate a road route.");
      return;
    }
    const controller = new AbortController();
    const [lng, lat] = userLocation;
    const url = `https://router.project-osrm.org/route/v1/driving/${lng},${lat};${routingDestination.lng},${routingDestination.lat}?overview=full&geometries=geojson&steps=false`;
    setRouteStatus("Calculating road route...");
    fetch(url, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Routing service unavailable");
        return response.json();
      })
      .then(data => {
        if (controller.signal.aborted) return;
        const route = data?.routes?.[0];
        const coords = route?.geometry?.coordinates;
        if (data.code !== "Ok" || !Array.isArray(coords) || coords.length < 2) {
          throw new Error("No drivable route found");
        }
        const snapDistances = (data.waypoints ?? []).map((p: { distance?: number }) => p.distance ?? Infinity);
        if (snapDistances.length !== 2 || snapDistances.some((d: number) => !Number.isFinite(d) || d > 150)) {
          throw new Error("Location or evacuation center is too far from a mapped road. Check the center coordinates.");
        }
        const valid = coords.filter((p: unknown): p is [number, number] =>
          Array.isArray(p) && p.length >= 2 &&
          Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
          Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90
        );
        if (valid.length < 2) throw new Error("Invalid routing geometry");
        // Reject discontinuous road geometries instead of drawing straight diagonals.
        const radians = (deg: number) => deg * Math.PI / 180;
        const hasGap = valid.slice(1).some(([lng2, lat2], i) => {
          const [lng1, lat1] = valid[i];
          const dLat = radians(lat2 - lat1);
          const dLng = radians(lng2 - lng1);
          const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
          return 12742000 * Math.asin(Math.min(1, Math.sqrt(a))) > 1000;
        });
        if (hasGap) throw new Error("Routing geometry contains a gap. Refusing to display a misleading route.");
        setRouteCoords(valid);
        setRouteStatus(`Road route: ${(route.distance / 1000).toFixed(1)} km, approximately ${Math.round(route.duration / 60)} min by car. Check local flood and road conditions.`);
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        setRouteCoords([]);
        setRouteStatus(error instanceof Error ? error.message : "Route unavailable");
      });
    return () => controller.abort();
  }, [userLocation, routingDestination]);


  // Get user's current location on mount
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation([
            position.coords.longitude,
            position.coords.latitude,
          ]);
          setLocationError(null);
        },
        (error) => {
          console.error("Geolocation error:", error);
          setUserLocation(null);
          setLocationError(
            error.code === error.PERMISSION_DENIED
              ? "Location access denied. Allow location access in your browser to show your position."
              : error.code === error.POSITION_UNAVAILABLE
                ? "Your current location could not be determined."
                : "Timed out while getting your current location."
          );
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      setLocationError("Current location is not supported by this browser.");
    }
  }, []);

  const handleSetDestination = (lat: number, lng: number, name: string) => {
    setRoutingDestination({ lat, lng, name });
  };

  const handleClearRoute = () => {
    setRoutingDestination(null);
  };
  // ---------------------------------

  const mapBarangays = barangays
    .filter(b => b.lat != null && b.lng != null)
    .map(b => ({
      id: b.id, name: b.name, lat: Number(b.lat), lng: Number(b.lng),
      population: b.population, elevation_m: b.elevation_m,
      risk_score: b.risk_score,
      risk_level: b.risk_level,
    }));
    
  const mapSensors = sensors
    .filter(s => s.lat != null && s.lng != null)
    .map(s => ({ id: s.id, name: s.name, lat: Number(s.lat), lng: Number(s.lng), status: s.status, type: s.type }));
    
  const mapCenters = centers
    .filter(c => c.lat != null && c.lng != null)
    .map(c => ({ id: c.id, name: c.name, lat: Number(c.lat), lng: Number(c.lng), capacity: c.capacity, occupancy: c.occupancy }));

  return (
    <div className="space-y-6">
      <PageHeader
        code="02"
        title="GIS · Satellite Mapping"
        subtitle="Multi-layer geospatial intelligence with realtime flood-risk heatmap driven by live sensor and weather streams."
      />

      {locationError && (
        <p className="text-xs text-muted-foreground" role="status">
          {locationError}
        </p>
      )}

      <div className="relative">
        <div className="absolute top-[4.4rem] left-3 right-3 sm:left-auto sm:right-16 sm:top-3 z-20 glass-panel px-3 py-1.5 flex items-center justify-center gap-2 pointer-events-none w-fit max-w-[calc(100%-1.5rem)] mx-auto sm:mx-0">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          <Activity className="h-3 w-3 text-primary" />
          <span className="mono-font text-[10px] uppercase tracking-wider text-primary">
            Live · {sinceLabel}
          </span>
        </div>

        {routeStatus && (
          <div className="absolute bottom-16 right-3 z-20 glass-panel px-3 py-2 text-xs max-w-[280px]" role="status">
            {routeStatus}
          </div>
        )}
        {/* --- Route Status Panel --- */}
        {routingDestination && (
          <div className="absolute top-28 left-3 right-3 sm:top-16 sm:right-auto z-20 glass-panel px-3 py-2 flex items-center gap-3 w-fit max-w-[calc(100%-1.5rem)]">
            <Navigation className="h-4 w-4 text-primary animate-pulse" />
            <div className="flex flex-col">
              <span className="mono-font text-[10px] uppercase tracking-wider text-muted-foreground">
                Routing To
              </span>
              <span className="text-xs font-medium truncate max-w-[150px]">
                {routingDestination.name}
              </span>
            </div>
            <button 
              onClick={handleClearRoute}
              className="ml-2 p-1 rounded hover:bg-destructive/20 transition-colors"
              title="Clear Route"
            >
              <X className="h-4 w-4 text-destructive" />
            </button>
          </div>
        )}

        <GISMap
          className="h-[640px]"
          routes={routeCoords.length ? [{ coords: routeCoords }] : []}
          barangays={mapBarangays}
          sensors={mapSensors}
          centers={mapCenters}
          userLocation={userLocation}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Panel label="GEOSPATIAL UNITS" title={`${barangays.length} Barangay${barangays.length === 1 ? "" : "s"} Monitored`}>
          {bLoading ? null : barangays.length === 0 ? (
            <EmptyState icon={<MapIcon className="h-5 w-5" />} title="No barangays yet" description="Admins can add barangays from Mission Control." />
          ) : (
            <ul className="space-y-1.5 text-sm">
              {barangays.map(b => (
                <li key={b.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-primary/5">
                  <span className="font-medium truncate">{b.name}</span>
                  <span className={
                    "mono-font text-[10px] px-1.5 py-0.5 rounded " +
                    (b.risk_level === "critical" ? "bg-destructive/20 text-destructive" :
                     b.risk_level === "high" ? "bg-warning/20 text-warning" :
                     b.risk_level === "moderate" ? "bg-warning/15 text-warning" :
                     "bg-primary/15 text-primary")
                  }>
                    {b.risk_score}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel label="TELEMETRY NODES" title={`${sensors.length} Sensor Station${sensors.length === 1 ? "" : "s"}`}>
          {sLoading ? null : sensors.length === 0 ? (
            <EmptyState icon={<Radio className="h-5 w-5" />} title="No sensors registered" description="Register sensor stations from Mission Control." />
          ) : (
            <ul className="space-y-1.5 text-sm">
              {sensors.map(s => (
                <li key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded">
                  <span className={
                    s.status === "online" ? "status-dot dot-low" :
                    s.status === "degraded" ? "status-dot dot-moderate" : "status-dot dot-critical"
                  } />
                  <span className="font-medium flex-1 truncate">{s.name}</span>
                  <span className="mono-font text-[10px] text-muted-foreground uppercase">{s.status ?? "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel label="SHELTER NODES" title={`${centers.length} Evacuation Center${centers.length === 1 ? "" : "s"}`}>
          {cLoading ? null : centers.length === 0 ? (
            <EmptyState icon={<Building2 className="h-5 w-5" />} title="No centers registered" />
          ) : (
            <ul className="space-y-1.5 text-sm">
              {centers.map(c => (
                /* --- NEW: Made list items clickable to set routing destination --- */
                <li 
                  key={c.id} 
                  className={`px-2 py-1.5 rounded cursor-pointer transition-colors flex flex-col gap-1
                    ${routingDestination?.lat === Number(c.lat) ? 'bg-primary/15 ring-1 ring-primary' : 'hover:bg-primary/10'}`}
                  onClick={() => handleSetDestination(Number(c.lat), Number(c.lng), c.name)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium truncate">{c.name}</span>
                    <span className="mono-font text-[10px] text-primary">{c.occupancy ?? 0}/{c.capacity ?? "—"}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-primary/80 uppercase mono-font tracking-wider">
                    <Navigation className="h-3 w-3" />
                    {routingDestination?.lat === Number(c.lat) ? "Selected" : "Set as Destination"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}