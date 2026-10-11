import { useState } from "react";
import { Building2, Users, MapPin, Trash2, Loader2 } from "lucide-react";
import { Panel, PageHeader } from "@/components/mission/Panel";
import { EmptyState } from "@/components/mission/EmptyState";
import { useEvacuationCenters, type EvacuationCenter } from "@/hooks/useData";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
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

export default function Centers() {
  const { data: centers, loading } = useEvacuationCenters();
  const { isAdmin } = useAuth();
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set());
  const [centerToDelete, setCenterToDelete] = useState<EvacuationCenter | null>(null);
  const [deleting, setDeleting] = useState(false);
  const visibleCenters = centers.filter(center => !removedIds.has(center.id));
  const total = visibleCenters.reduce((a, c) => a + (c.capacity ?? 0), 0);
  const occ = visibleCenters.reduce((a, c) => a + (c.occupancy ?? 0), 0);

  async function deleteCenter() {
    if (!centerToDelete) return;
    setDeleting(true);
    const { error } = await supabase
      .from("evacuation_centers")
      .delete()
      .eq("id", centerToDelete.id);
    setDeleting(false);

    if (error) {
      toast({ title: "Failed to delete evacuation center", description: error.message, variant: "destructive" });
      return;
    }

    setRemovedIds(ids => new Set(ids).add(centerToDelete.id));
    toast({ title: "Evacuation center deleted", description: centerToDelete.name });
    setCenterToDelete(null);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        code="06"
        title="Evacuation Centers · Pililla"
        subtitle={
          visibleCenters.length
            ? `${visibleCenters.length} registered shelters · ${(total - occ).toLocaleString()} of ${total.toLocaleString()} seats currently available.`
            : "Registered shelters will appear here once admins add them."
        }
      />

      {loading ? null : visibleCenters.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Building2 className="h-5 w-5" />}
            title="No evacuation centers registered"
            description="Mission Control administrators can add evacuation centers from the Admin panel."
          />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleCenters.map(c => {
            const cap = c.capacity ?? 0;
            const occu = c.occupancy ?? 0;
            const pct = cap > 0 ? (occu / cap) * 100 : 0;
            const status = pct >= 100 ? "FULL" : pct >= 80 ? "NEAR CAPACITY" : "AVAILABLE";
            const tone = pct >= 100 ? "critical" : pct >= 80 ? "moderate" : "low";
            return (
              <div key={c.id} className="glass-panel glass-panel-hover hud-brackets p-5">
                <div className="flex items-start gap-3">
                  <div className={cn("h-10 w-10 rounded grid place-items-center shrink-0",
                    tone === "low" && "bg-success/15 text-success border border-success/40",
                    tone === "moderate" && "bg-risk-moderate/15 text-risk-moderate border border-risk-moderate/40",
                    tone === "critical" && "bg-risk-critical/15 text-risk-critical border border-risk-critical/40",
                  )}>
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-sm leading-tight">{c.name}</h3>
                    <div className="mono-label mt-0.5">{c.status ?? "available"}</div>
                  </div>
                  <span className={cn("mono-font text-[10px] font-bold px-2 py-0.5 rounded border",
                    tone === "low" && "text-success border-success/40 bg-success/10",
                    tone === "moderate" && "text-risk-moderate border-risk-moderate/40 bg-risk-moderate/10",
                    tone === "critical" && "text-risk-critical border-risk-critical/40 bg-risk-critical/15",
                  )}>{status}</span>
                </div>

                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setCenterToDelete(c)}
                    className="mt-4 inline-flex items-center gap-1.5 rounded border border-risk-critical/40 px-2.5 py-1.5 text-xs text-risk-critical transition hover:bg-risk-critical/10"
                    aria-label={`Delete ${c.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                )}

                <div className="mt-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between mono-font">
                    <span className="flex items-center gap-2 text-muted-foreground"><Users className="h-3 w-3" /> Occupancy</span>
                    <span className="text-foreground">{occu.toLocaleString()} / {cap.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
                    <div className={cn("h-full",
                      tone === "low" && "bg-success",
                      tone === "moderate" && "bg-risk-moderate",
                      tone === "critical" && "bg-risk-critical",
                    )} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                  {c.lat != null && c.lng != null && (
                    <div className="flex items-center gap-2 text-muted-foreground mono-font">
                      <MapPin className="h-3 w-3" /> {Number(c.lat).toFixed(4)}°N · {Number(c.lng).toFixed(4)}°E
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!centerToDelete} onOpenChange={open => !open && !deleting && setCenterToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete evacuation center?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {centerToDelete?.name} from the evacuation center list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={event => {
                event.preventDefault();
                void deleteCenter();
              }}
              disabled={deleting}
              className="bg-risk-critical text-white hover:bg-risk-critical/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete center
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
