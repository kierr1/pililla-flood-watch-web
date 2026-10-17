import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Activity, Map, Route, CloudRain, Building2, Bell, Shield, BarChart3, Radio, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import StatusBar from "./StatusBar";
import { supabase } from "@/integrations/supabase/client";
import AlertBanner from "./AlertBanner";
import AlertScreenOverlay from "./AlertScreenOverlay";

const NAV = [
  { to: "/", label: "Mission Dashboard", icon: Activity, code: "01" },
  { to: "/gis", label: "GIS / Satellite Map", icon: Map, code: "02" },
  { to: "/evacuation", label: "Evacuation Routes", icon: Route, code: "03" },
  { to: "/weather", label: "Weather & Forecast", icon: CloudRain, code: "04" },
  { to: "/centers", label: "Evacuation Centers", icon: Building2, code: "05" },
  { to: "/alerts", label: "Alert System", icon: Bell, code: "06" },
  { to: "/admin", label: "Mission Control", icon: Shield, code: "07", adminOnly: true },
  { to: "/analytics", label: "Data Visualization", icon: BarChart3, code: "08" },
  { to: "/admin/users", label: "Admin Panel", icon: Users, code: "09", adminOnly: true },
];

export default function MissionShell() {
  const location = useLocation();
  const { isAdmin } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const [deviceHealth, setDeviceHealth] = useState<Record<string, boolean>>({
    wind: false, water_level: false, camera: false,
  });
  const [lastTelemetryAt, setLastTelemetryAt] = useState<string | null>(null);
  const deviceCount = Object.values(deviceHealth).filter(Boolean).length;

  // Device checks are reported by the Pi, not inferred from regular readings.
  // A report expires after 90 seconds so powering off the Pi goes offline.
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const { data, error } = await supabase
          .from("device_health" as any)
          .select("device_id,connected,checked_at");
        if (error) throw error;
        if (!active) return;
        const now = Date.now();
        const next: Record<string, boolean> = { wind: false, water_level: false, camera: false };
        let mostRecent = 0;
        for (const row of (data ?? []) as unknown as Array<{device_id: string; connected: boolean; checked_at: string}>) {
          const checked = new Date(row.checked_at).getTime();
          if (Object.prototype.hasOwnProperty.call(next, row.device_id) && Number.isFinite(checked)) {
            next[row.device_id] = row.connected === true && checked <= now + 10000 && now - checked < 90000;
            mostRecent = Math.max(mostRecent, checked);
          }
        }
        setDeviceHealth(next);
        setLastTelemetryAt(mostRecent ? new Date(mostRecent).toISOString() : null);
      } catch {
        if (active) {
          setDeviceHealth({ wind: false, water_level: false, camera: false });
          setLastTelemetryAt(null);
        }
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    const onVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Close mobile nav on route change
  useEffect(() => { setNavOpen(false); }, [location.pathname]);

  const visibleNav = NAV.filter(item => !item.adminOnly || isAdmin);

  return (
    <div className="min-h-screen flex flex-col">
      <StatusBar onMenuToggle={() => setNavOpen(v => !v)} navOpen={navOpen} />
      <AlertBanner />
      <AlertScreenOverlay />

      <div className="flex-1 flex w-full">
        {/* Sidebar */}
        <aside
          className={cn(
            "fixed lg:sticky top-0 lg:top-[88px] left-0 z-40 lg:z-10",
            "h-screen lg:h-[calc(100vh-88px)] w-72 shrink-0",
            "bg-surface-1 border-r border-primary/15 backdrop-blur-xl",
            "transition-transform duration-300",
            navOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          )}
        >
          <div className="px-5 py-5 border-b border-primary/15 lg:hidden">
            <div className="display-font text-sm font-bold text-primary text-glow">FLOOD-OPS</div>
            <div className="mono-label mt-1">PILILLA · RIZAL</div>
          </div>

          <nav className="p-3 space-y-1 overflow-y-auto h-[calc(100%-80px)] lg:h-full">
            <div className="mono-label px-3 py-2">MODULES</div>
            {visibleNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end
                className={({ isActive }) =>
                  cn(
                    "group flex items-center gap-3 px-3 py-2.5 rounded text-sm transition-all relative overflow-hidden",
                    "hover:bg-primary/10 hover:text-primary",
                    isActive
                      ? "bg-primary/15 text-primary border border-primary/40 shadow-[inset_0_0_12px_hsl(var(--primary)/0.15)]"
                      : "text-muted-foreground border border-transparent",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={cn("mono-font text-[10px] w-6", isActive ? "text-primary/80" : "text-muted-foreground/60")}>{item.code}</span>
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="font-medium">{item.label}</span>
                    {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />}
                  </>
                )}
              </NavLink>
            ))}

            <div className="mt-6 mx-3 p-3 rounded glass-panel">
              <div className="flex items-center gap-2 mb-2">
                <Radio className="h-3.5 w-3.5 text-success animate-flicker" />
                <span className="mono-label">SYSTEM STATUS</span>
              </div>
              <div className="space-y-1.5 text-xs">
                <Stat label="Devices online" value={`${deviceCount}/3`} tone={deviceCount === 3 ? "ok" : deviceCount ? "warn" : "crit"} />
                <Stat label="ML model" value="v2.1.3" tone="ok" />
                <Stat label="Sat. uplink" value="STABLE" tone="ok" />
                <Stat label="Last health check" value={lastTelemetryAt ? new Date(lastTelemetryAt).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }) : "No data"} tone={deviceCount === 3 ? "ok" : "crit"} />
              </div>
            </div>
          </nav>
        </aside>

        {navOpen && (
          <button
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
            className="fixed inset-0 z-30 bg-background/70 backdrop-blur-sm lg:hidden"
          />
        )}

        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "ok" | "warn" | "crit" }) {
  const dot = tone === "ok" ? "bg-success shadow-[0_0_6px_hsl(var(--success))]" : tone === "warn" ? "bg-risk-moderate" : "bg-risk-critical";
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 mono-font text-foreground/90">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
        {value}
      </span>
    </div>
  );
}
