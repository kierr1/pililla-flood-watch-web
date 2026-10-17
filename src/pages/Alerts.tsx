import { useState } from "react";
import { Bell, BellRing, Loader2, Mail, MessageSquare, Trash2, Volume2, X } from "lucide-react";
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
        subtitle="Color-coded warnings, real-time banner alerts, and SMS/email/voice broadcast structure."
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

      <Panel label="LIVE FEED" title={`${visibleAlerts.length} Active Alert${visibleAlerts.length === 1 ? "" : "s"}`}>
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

      <Panel label="BROADCAST CHANNELS" title="Multi-Channel Alert Dispatch (Ready)">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: <MessageSquare className="h-5 w-5" />, name: "SMS Broadcast", note: "Configure with Twilio" },
            { icon: <Mail className="h-5 w-5" />, name: "Email Cascade", note: "Configure SMTP" },
            { icon: <Volume2 className="h-5 w-5" />, name: "Voice Sirens", note: "Field hardware" },
            { icon: <Bell className="h-5 w-5" />, name: "Push Notifications", note: "Mobile app (planned)" },
          ].map(c => (
            <div key={c.name} className="p-4 rounded bg-surface-2/60 border border-primary/15 text-center">
              <div className="mx-auto h-10 w-10 rounded grid place-items-center bg-primary/10 text-primary border border-primary/30 mb-2">{c.icon}</div>
              <div className="font-semibold text-sm">{c.name}</div>
              <div className="mono-label mt-1">{c.note}</div>
            </div>
          ))}
        </div>
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
