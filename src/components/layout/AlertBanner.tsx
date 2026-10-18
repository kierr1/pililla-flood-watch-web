import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useAlerts } from "@/hooks/useData";
import { useAlertDismissals } from "@/hooks/useAlertDismissals";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const TONE: Record<string, { bar: string; text: string; bg: string; label: string }> = {
  low:      { bar: "bg-risk-low",      text: "text-risk-low",      bg: "bg-risk-low/10",      label: "ADVISORY" },
  moderate: { bar: "bg-risk-moderate", text: "text-risk-moderate", bg: "bg-risk-moderate/10", label: "WATCH" },
  high:     { bar: "bg-risk-high",     text: "text-risk-high",     bg: "bg-risk-high/10",     label: "WARNING" },
  critical: { bar: "bg-risk-critical", text: "text-risk-critical", bg: "bg-risk-critical/15", label: "CRITICAL" },
};

const LEVEL_RANK: Record<string, number> = { critical: 4, high: 3, moderate: 2, low: 1 };

export default function AlertBanner() {
  const { data: alerts, loading } = useAlerts();
  const { user, isAdmin } = useAuth();
  const { dismissedAlertIds, loading: dismissalsLoading, dismissAlert } = useAlertDismissals(user?.id ?? null);
  const [dismissedAdminAlertId, setDismissedAdminAlertId] = useState<string | null>(null);
  const [dismissedGuestAlertId, setDismissedGuestAlertId] = useState<string | null>(null);
  const [deletedAlertIds, setDeletedAlertIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const handleAlertDeleted = (event: Event) => {
      const alertId = (event as CustomEvent<string>).detail;
      setDeletedAlertIds(ids => new Set(ids).add(alertId));
    };
    window.addEventListener("alert-deleted", handleAlertDeleted);
    return () => window.removeEventListener("alert-deleted", handleAlertDeleted);
  }, []);

  if (loading || dismissalsLoading) return null;
  const visibleAlerts = alerts.filter(alert =>
    !deletedAlertIds.has(alert.id) &&
    !dismissedAlertIds.has(alert.id) &&
    !(isAdmin && dismissedAdminAlertId === alert.id) &&
    !(user === null && dismissedGuestAlertId === alert.id)
  );
  if (!visibleAlerts.length) return null;

  // Pick the highest-severity active alert
  const top = [...visibleAlerts].sort((a, b) => (LEVEL_RANK[b.level] ?? 0) - (LEVEL_RANK[a.level] ?? 0))[0];
  const tone = TONE[top.level] ?? TONE.moderate;

  return (
    <div
      className={cn(
        "relative border-b backdrop-blur-md overflow-hidden",
        tone.bg,
        top.level === "critical" ? "border-risk-critical/60 animate-critical-pulse" : "border-primary/15",
      )}
    >
      <div className={cn("absolute left-0 top-0 bottom-0 w-1", tone.bar, top.level === "critical" && "animate-flicker")} />
      <div className="px-3 sm:px-6 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 min-w-0">
        <div className="flex w-full min-w-0 items-center gap-2 sm:flex-1">
          <span className={cn("mono-font shrink-0 font-bold text-[11px] px-2 py-0.5 rounded border", tone.text)}>
            {tone.label}
          </span>
          <AlertTriangle className={cn("h-4 w-4 shrink-0", tone.text)} />
          <span className="min-w-0 flex-1 text-sm font-medium break-words [overflow-wrap:anywhere]">{top.title}</span>
          {top.area && <span className="mono-label hidden lg:inline">· {top.area}</span>}
          <button
            type="button"
            onClick={() => {
              if (isAdmin) setDismissedAdminAlertId(top.id);
              else if (!user) setDismissedGuestAlertId(top.id);
              else void dismissAlert(top.id);
            }}
            className="ml-auto inline-flex h-10 w-10 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={`Dismiss ${top.title} notification`}
            title="Dismiss notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <Link
          to="/evacuation"
          className="min-h-10 w-full sm:w-auto sm:shrink-0 inline-flex justify-center items-center gap-2 rounded border border-primary/50 bg-primary/15 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/25"
        >
          Find Safest Route Now <ArrowRight className="h-3.5 w-3.5 shrink-0" />
        </Link>
      </div>
    </div>
  );
}
