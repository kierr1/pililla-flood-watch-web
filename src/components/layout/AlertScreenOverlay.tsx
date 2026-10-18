import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useAlerts, type Alert } from "@/hooks/useData";
import { useAlertDismissals } from "@/hooks/useAlertDismissals";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const tones: Record<string, string> = {
  low: "text-risk-low border-risk-low/60",
  moderate: "text-risk-moderate border-risk-moderate/60",
  high: "text-risk-high border-risk-high/60",
  critical: "text-risk-critical border-risk-critical/70",
};

/** Full-screen announcement on every page, separate from the persistent banner. */
export default function AlertScreenOverlay() {
  const { data: alerts, loading } = useAlerts();
  const { user } = useAuth();
  const { dismissedAlertIds, loading: dismissalsLoading } = useAlertDismissals(user?.id ?? null);
  const seen = useRef<Set<string>>(new Set());
  const initialized = useRef(false);
  const [active, setActive] = useState<Alert | null>(null);

  useEffect(() => {
    if (loading || dismissalsLoading) return;
    const eligible = alerts.filter(a => !dismissedAlertIds.has(a.id));
    if (!initialized.current) {
      initialized.current = true;
      // Show the latest unacknowledged announcement immediately on initial page load,
      // including alerts older than two minutes. New alerts still trigger independently.
      eligible.forEach(a => seen.current.add(a.id));
      if (eligible.length) {
        const newest = [...eligible].sort((a, b) => b.issued_at.localeCompare(a.issued_at))[0];
        setActive(newest);
      }
      return;
    }
    const incoming = eligible.filter(a => !seen.current.has(a.id));
    alerts.forEach(a => seen.current.add(a.id));
    if (incoming.length) {
      setActive(incoming.sort((a, b) => b.issued_at.localeCompare(a.issued_at))[0]);
    }
  }, [alerts, loading, dismissedAlertIds, dismissalsLoading]);

  useEffect(() => {
    if (active && (!alerts.some(a => a.id === active.id) || dismissedAlertIds.has(active.id))) {
      setActive(null);
    }
  }, [alerts, dismissedAlertIds, active]);

  if (!active) return null;
  const tone = tones[active.level] ?? tones.moderate;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/80 backdrop-blur-md p-3 sm:p-4"
      role="alertdialog" aria-modal="true" aria-labelledby="screen-alert-title" aria-describedby="screen-alert-message">
      <div className={cn("w-full min-w-0 max-w-xl max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain rounded-lg border-2 bg-background shadow-2xl p-4 sm:p-8", tone)}>
        <div className="mb-4 flex min-w-0 items-start gap-2 sm:gap-3">
          <div className={cn("flex min-w-0 flex-1 items-start gap-2 font-bold uppercase tracking-wider text-xs sm:text-sm leading-snug", tone)}>
            <AlertTriangle className="h-6 w-6 sm:h-7 sm:w-7 shrink-0" />
            <span className="min-w-0 break-words">{active.level === "critical" ? "Critical emergency alert" : active.level + " alert announcement"}</span>
          </div>
          <button type="button" onClick={() => setActive(null)}
            aria-label="Close alert announcement"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <h2 id="screen-alert-title" className="display-font text-xl sm:text-3xl leading-tight font-bold break-words text-foreground">{active.title}</h2>
        {active.area && <p className="mt-3 text-sm font-semibold text-foreground break-words">Area: {active.area}</p>}
        <p id="screen-alert-message" className="mt-4 text-base text-foreground/90 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          {active.message || "Please check the latest flood advisory and follow instructions from local authorities."}
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <Link to="/evacuation" onClick={() => setActive(null)}
            className="min-w-0 flex-1 inline-flex min-h-11 justify-center items-center gap-2 rounded bg-primary px-4 py-3 text-primary-foreground font-bold text-sm text-center transition-colors hover:bg-primary-glow">
            View evacuation routes <ArrowRight className="h-4 w-4" />
          </Link>
          <button type="button" onClick={() => setActive(null)}
            className="min-w-0 flex-1 min-h-11 rounded border border-primary/40 px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-primary/10">
            Acknowledge
          </button>
        </div>
      </div>
    </div>
  );
}
