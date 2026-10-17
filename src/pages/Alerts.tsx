import { useState } from "react";
import { Bell, BellRing, Loader2, Trash2, X, VideoOff } from "lucide-react";
import { Panel, PageHeader, RiskBadge } from "@/components/mission/Panel";
import { EmptyState } from "@/components/mission/EmptyState";
import { useAlerts, type Alert } from "@/hooks/useData";
import { useAlertDismissals } from "@/hooks/useAlertDismissals";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Alerts() {
  const { data: alerts, loading } = useAlerts();
  const { isAdmin, user } = useAuth();
  const { dismissedAlertIds, loading: dismissalsLoading, dismissAlert } = useAlertDismissals(user?.id ?? null);
  const [deletedAlertIds, setDeletedAlertIds] = useState<Set<string>>(() => new Set());
  const [alertToManage, setAlertToManage] = useState<Alert | null>(null);
  const [saving, setSaving] = useState(false);
  const visibleAlerts = alerts.filter(alert =>
    !deletedAlertIds.has(alert.id) && !dismissedAlertIds.has(alert.id)
  );

  async function manageAlert() {
    if (!alertToManage || saving) return;
    setSaving(true);
    try {
      if (isAdmin) {
        const { data, error } = await supabase
          .from("alerts")
          .delete()
          .eq("id", alertToManage.id)
          .select("id");
        if (error) throw error;
        if (!data?.length) throw new Error("The alert was not deleted. Check your admin permissions and try again.");
        setDeletedAlertIds(ids => new Set(ids).add(alertToManage.id));
        window.dispatchEvent(new CustomEvent("alert-deleted", { detail: alertToManage.id }));
        toast({ title: "Alert deleted", description: alertToManage.title });
      } else {
        const dismissed = await dismissAlert(alertToManage.id);
        if (!dismissed) return;
        toast({ title: "Alert dismissed", description: "It will stay hidden from your account." });
      }
      setAlertToManage(null);
    } catch (error) {
      toast({
        title: isAdmin ? "Failed to delete alert" : "Failed to dismiss alert",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        code="07"
        title="Alert System"
        subtitle="Real-time community alerts and live camera monitoring."
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { level: "low", label: "ADVISORY", desc: "Monitor conditions" },
          { level: "moderate", label: "WATCH", desc: "Stay alert" },
          { level: "high", label: "WARNING", desc: "Prepare to evacuate" },
          { level: "critical", label: "CRITICAL", desc: "Evacuate now" },
        ].map((a) => (
          <div key={a.level} className="glass-panel hud-brackets p-4">
            <div className="mono-label">LEVEL · {a.label}</div>
            <div className="mt-2"><RiskBadge level={a.level as any} /></div>
            <p className="text-xs text-muted-foreground mt-2">{a.desc}</p>
          </div>
        ))}
      </div>

      <Panel label="ALERT FEED" title={`${visibleAlerts.length} Active Alert${visibleAlerts.length === 1 ? "" : "s"}`}>
        {loading || dismissalsLoading ? null : visibleAlerts.length === 0 ? (
          <EmptyState
            icon={<Bell className="h-5 w-5" />}
            title="No active alerts"
            description="Conditions are nominal. New alerts dispatched by Mission Control will appear here in real-time."
          />
        ) : (
          <ul className="space-y-3">
            {visibleAlerts.map(a => (
              <li key={a.id} className="p-4 rounded border bg-surface-2/40 border-primary/15">
                <div className="flex items-start gap-3">
                  <BellRing className="h-5 w-5 shrink-0 mt-0.5 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <RiskBadge level={a.level as any} />
                      <h4 className="font-bold text-sm">{a.title}</h4>
                    </div>
                    {a.area && <p className="text-xs text-muted-foreground mt-1">Affecting: {a.area}</p>}
                    {a.message && <p className="text-xs text-foreground/80 mt-1">{a.message}</p>}
                    <p className="mono-font text-[10px] text-muted-foreground mt-1">Issued {new Date(a.issued_at).toLocaleString("en-PH", { hour12: false })}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAlertToManage(a)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      isAdmin
                        ? "border-risk-critical/40 text-risk-critical hover:bg-risk-critical/10"
                        : "border-primary/30 text-primary hover:bg-primary/10"
                    }`}
                    aria-label={`${isAdmin ? "Delete" : "Dismiss"} ${a.title}`}
                    disabled={saving}
                  >
                    {isAdmin ? <Trash2 className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                    {isAdmin ? "Delete" : "Dismiss"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel label="CAMERA MONITORING" title="Live Camera View">
        {import.meta.env.VITE_CAMERA_STREAM_URL ? (
          <div className="mx-auto max-w-4xl overflow-hidden rounded border border-primary/20 bg-black">
            <iframe
              src={import.meta.env.VITE_CAMERA_STREAM_URL}
              title="Live Raspberry Pi camera feed"
              className="aspect-video w-full border-0"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              referrerPolicy="no-referrer"
            />
          </div>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded border border-primary/20 bg-black/70 p-6 text-center">
            <VideoOff className="h-9 w-9 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">Camera stream not configured</p>
            <p className="max-w-lg text-xs text-muted-foreground">
              Connect a live video stream from your Raspberry Pi to display it here.
              Scheduled 30-minute image captures are separate and unchanged.
            </p>
          </div>
        )}
      </Panel>

      <AlertDialog open={!!alertToManage} onOpenChange={open => !open && !saving && setAlertToManage(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isAdmin ? "Delete alert?" : "Dismiss alert?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {isAdmin
                ? `This will permanently delete “${alertToManage?.title}” from the alert system.`
                : `“${alertToManage?.title}” will be hidden from your account and will not appear again for you.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={event => {
                event.preventDefault();
                void manageAlert();
              }}
              disabled={saving}
              className={isAdmin ? "bg-risk-critical text-white hover:bg-risk-critical/90" : ""}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isAdmin ? "Delete alert" : "Dismiss alert"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
