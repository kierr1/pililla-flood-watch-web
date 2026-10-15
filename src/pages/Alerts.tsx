import { useState } from "react";
import { Bell, BellRing, Loader2, Mail, MessageSquare, Trash2, Volume2, X } from "lucide-react";
import { Panel, PageHeader, RiskBadge } from "@/components/mission/Panel";
import { EmptyState } from "@/components/mission/EmptyState";
import { useAlerts, type Alert } from "@/hooks/useData";
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
  const { isAdmin } = useAuth();
  const [deletedAlertIds, setDeletedAlertIds] = useState<Set<string>>(() => new Set());
  const [alertToDelete, setAlertToDelete] = useState<Alert | null>(null);
  const [deleting, setDeleting] = useState(false);
  const visibleAlerts = alerts.filter(alert => !deletedAlertIds.has(alert.id));
  const critical = visibleAlerts.find(a => a.level === "critical");
  const [showModal, setShowModal] = useState(true);

  async function deleteAlert() {
    if (!alertToDelete || deleting) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("alerts").delete().eq("id", alertToDelete.id);
      if (error) {
        toast({ title: "Failed to delete alert", description: error.message, variant: "destructive" });
        return;
      }

      setDeletedAlertIds(ids => new Set(ids).add(alertToDelete.id));
      toast({ title: "Alert deleted", description: alertToDelete.title });
      setAlertToDelete(null);
    } catch (error) {
      toast({
        title: "Failed to delete alert",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
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
        {loading ? null : visibleAlerts.length === 0 ? (
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
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setAlertToDelete(a)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded border border-risk-critical/40 px-2.5 py-1.5 text-xs text-risk-critical transition hover:bg-risk-critical/10 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`Delete ${a.title}`}
                      disabled={deleting}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  )}
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

      {showModal && critical && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-background/80 backdrop-blur-md p-4 animate-fade-in">
          <div className="glass-panel max-w-lg w-full border-risk-critical/60 animate-critical-pulse p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <BellRing className="h-7 w-7 text-risk-critical animate-flicker" />
                <div>
                  <div className="mono-label text-risk-critical">PRIORITY ALPHA</div>
                  <h3 className="display-font text-xl font-bold text-risk-critical text-glow-critical">{critical.title}</h3>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            {critical.message && <p className="text-sm mt-4">{critical.message}</p>}
            <a href="/evacuation" className="mt-5 inline-block w-full text-center px-4 py-3 rounded bg-gradient-critical text-white font-bold shadow-glow-critical">
              FIND SAFEST ROUTE NOW
            </a>
          </div>
        </div>
      )}

      <AlertDialog open={!!alertToDelete} onOpenChange={open => !open && !deleting && setAlertToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete alert?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete “{alertToDelete?.title}” from the alert system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={event => {
                event.preventDefault();
                void deleteAlert();
              }}
              disabled={deleting}
              className="bg-risk-critical text-white hover:bg-risk-critical/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete alert
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
