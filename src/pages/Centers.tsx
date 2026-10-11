import { useState } from "react";
import { Building2, Users, MapPin, Trash2, Loader2, Pencil } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type CenterForm = {
  name: string;
  capacity: string;
  occupancy: string;
  status: string;
  lat: string;
  lng: string;
};

export default function Centers() {
  const { data: centers, loading } = useEvacuationCenters();
  const { isAdmin } = useAuth();
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set());
  const [updatedCenters, setUpdatedCenters] = useState<Map<string, EvacuationCenter>>(() => new Map());
  const [centerToDelete, setCenterToDelete] = useState<EvacuationCenter | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [centerToEdit, setCenterToEdit] = useState<EvacuationCenter | null>(null);
  const [editForm, setEditForm] = useState<CenterForm | null>(null);
  const [saving, setSaving] = useState(false);
  const visibleCenters = centers
    .filter(center => !removedIds.has(center.id))
    .map(center => updatedCenters.get(center.id) ?? center);
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

  function openEdit(center: EvacuationCenter) {
    setCenterToEdit(center);
    setEditForm({
      name: center.name,
      capacity: center.capacity?.toString() ?? "",
      occupancy: center.occupancy?.toString() ?? "",
      status: center.status ?? "available",
      lat: center.lat?.toString() ?? "",
      lng: center.lng?.toString() ?? "",
    });
  }

  async function saveCenter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!centerToEdit || !editForm) return;
    setSaving(true);
    const updates = {
      name: editForm.name.trim(),
      capacity: numOrNull(editForm.capacity),
      occupancy: numOrNull(editForm.occupancy),
      status: editForm.status.trim() || null,
      lat: numOrNull(editForm.lat),
      lng: numOrNull(editForm.lng),
    };
    const { error } = await supabase
      .from("evacuation_centers")
      .update(updates)
      .eq("id", centerToEdit.id);
    setSaving(false);

    if (error) {
      toast({ title: "Failed to update evacuation center", description: error.message, variant: "destructive" });
      return;
    }

    setUpdatedCenters(previous => new Map(previous).set(centerToEdit.id, { ...centerToEdit, ...updates }));
    toast({ title: "Evacuation center updated", description: updates.name });
    setCenterToEdit(null);
    setEditForm(null);
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
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(c)}
                      className="inline-flex items-center gap-1.5 rounded border border-primary/40 px-2.5 py-1.5 text-xs text-primary transition hover:bg-primary/10"
                      aria-label={`Edit ${c.name}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setCenterToDelete(c)}
                      className="inline-flex items-center gap-1.5 rounded border border-risk-critical/40 px-2.5 py-1.5 text-xs text-risk-critical transition hover:bg-risk-critical/10"
                      aria-label={`Delete ${c.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
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

      <Dialog
        open={!!centerToEdit}
        onOpenChange={open => {
          if (!open && !saving) {
            setCenterToEdit(null);
            setEditForm(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit evacuation center</DialogTitle>
          </DialogHeader>
          {editForm && (
            <form onSubmit={saveCenter} className="space-y-3">
              <CenterField label="Name" value={editForm.name} onChange={value => setEditForm({ ...editForm, name: value })} required />
              <div className="grid grid-cols-2 gap-3">
                <CenterField label="Capacity" type="number" min="0" value={editForm.capacity} onChange={value => setEditForm({ ...editForm, capacity: value })} />
                <CenterField label="Occupancy" type="number" min="0" value={editForm.occupancy} onChange={value => setEditForm({ ...editForm, occupancy: value })} />
                <CenterField label="Status" value={editForm.status} onChange={value => setEditForm({ ...editForm, status: value })} />
                <CenterField label="Latitude" type="number" min="-90" max="90" step="any" value={editForm.lat} onChange={value => setEditForm({ ...editForm, lat: value })} />
                <CenterField label="Longitude" type="number" min="-180" max="180" step="any" value={editForm.lng} onChange={value => setEditForm({ ...editForm, lng: value })} />
              </div>
              <DialogFooter>
                <button
                  type="button"
                  onClick={() => {
                    setCenterToEdit(null);
                    setEditForm(null);
                  }}
                  disabled={saving}
                  className="rounded border border-primary/20 px-4 py-2 text-sm text-muted-foreground hover:bg-primary/5 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !editForm.name.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary-glow disabled:opacity-50"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save changes
                </button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CenterField({
  label,
  value,
  onChange,
  type = "text",
  min,
  max,
  step,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: string;
  max?: string;
  step?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mono-label">{label}</span>
      <input
        type={type}
        value={value}
        onChange={event => onChange(event.target.value)}
        min={min}
        max={max}
        step={step}
        required={required}
        className="mt-1 w-full rounded border border-primary/20 bg-surface-0 px-3 py-2 text-sm text-black focus:border-primary/60 focus:outline-none"
      />
    </label>
  );
}

function numOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
