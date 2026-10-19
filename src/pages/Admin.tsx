import { useEffect, useState } from "react";
import { Shield, Database, Settings, Upload, FileText, Activity, UserPlus, Trash2, Loader2, Plus } from "lucide-react";
import { Panel, PageHeader } from "@/components/mission/Panel";
import { EmptyState } from "@/components/mission/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { useBarangays, useSensorStations, useEvacuationCenters } from "@/hooks/useData";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

type Profile = { id: string; email: string | null; display_name: string | null };
type RoleRow = { user_id: string; role: "admin" | "user" };

export default function Admin() {
  const { user } = useAuth();
  const { data: barangays } = useBarangays();
  const { data: sensors } = useSensorStations();
  const { data: centers } = useEvacuationCenters();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from("profiles").select("id,email,display_name"),
      supabase.from("user_roles").select("user_id,role"),
    ]);
    setProfiles((p as Profile[]) ?? []);
    setRoles((r as RoleRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  async function toggleAdmin(uid: string, currentlyAdmin: boolean) {
    if (currentlyAdmin) {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", uid).eq("role", "admin");
      if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
      else toast({ title: "Admin role revoked" });
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: uid, role: "admin" });
      if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
      else toast({ title: "Admin role granted" });
    }
    refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        code="08"
        title="Mission Control · Admin Panel"
        subtitle="Manage barangays, sensor stations, evacuation centers, user roles, and dataset ingestion."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Stat icon={<Database />} label="Barangays" count={barangays.length} />
        <Stat icon={<Activity />} label="Sensor Stations" count={sensors.length} />
        <Stat icon={<Shield />} label="Evac Centers" count={centers.length} />
      </div>

      <Panel label="ACCESS CONTROL" title="User Roles">
        {loading ? (
          <div className="py-6 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-primary" /></div>
        ) : profiles.length === 0 ? (
          <EmptyState icon={<UserPlus className="h-5 w-5" />} title="No users yet" description="Users appear here after their first sign-in." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left mono-label border-b border-primary/15">
                  <th className="py-2 pr-3">USER</th>
                  <th className="py-2 pr-3">EMAIL</th>
                  <th className="py-2 pr-3">ROLES</th>
                  <th className="py-2 pr-3 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map(p => {
                  const userRoles = roles.filter(r => r.user_id === p.id).map(r => r.role);
                  const isAdmin = userRoles.includes("admin");
                  const isSelf = p.id === user?.id;
                  return (
                    <tr key={p.id} className="border-b border-primary/5">
                      <td className="py-2 pr-3 font-medium">{p.display_name ?? "—"}</td>
                      <td className="py-2 pr-3 mono-font text-xs">{p.email}</td>
                      <td className="py-2 pr-3">
                        {userRoles.length === 0 ? (
                          <span className="mono-label">none</span>
                        ) : userRoles.map(r => (
                          <span key={r} className={`mono-font text-[10px] mr-1 px-2 py-0.5 rounded border ${r === "admin" ? "text-primary border-primary/40 bg-primary/10" : "text-muted-foreground border-primary/15"}`}>{r.toUpperCase()}</span>
                        ))}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <button
                          onClick={() => toggleAdmin(p.id, isAdmin)}
                          disabled={isSelf}
                          title={isSelf ? "Cannot modify your own role" : ""}
                          className={`text-xs px-2.5 py-1 rounded border ${isAdmin ? "border-risk-high/40 text-risk-high hover:bg-risk-high/10" : "border-primary/40 text-primary hover:bg-primary/10"} disabled:opacity-40 disabled:cursor-not-allowed`}
                        >
                          {isAdmin ? "Revoke admin" : "Grant admin"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <CsvUploadPanel onComplete={refresh} />

      <QuickAddPanel />
    </div>
  );
}

function CsvUploadPanel({ onComplete }: { onComplete: () => void }) {
  const [target, setTarget] = useState<"barangays" | "sensor_stations" | "evacuation_centers">("barangays");
  const [busy, setBusy] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) throw new Error("CSV is empty");
      const { error } = await supabase.from(target).insert(rows as any);
      if (error) throw error;
      toast({ title: "Import complete", description: `${rows.length} row(s) inserted into ${target}.` });
      onComplete();
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message ?? String(err), variant: "destructive" });
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  const headers: Record<string, string[]> = {
    barangays: ["name", "population", "elevation_m", "lat", "lng"],
    sensor_stations: ["name", "type", "status", "lat", "lng"],
    evacuation_centers: ["name", "capacity", "occupancy", "status", "lat", "lng"],
  };

  return (
    <Panel label="DATASETS" title="CSV Upload" action={<Settings className="h-4 w-4 text-muted-foreground" />}>
      <div className="space-y-3">
        <div className="flex gap-2 flex-wrap">
          {(["barangays", "sensor_stations", "evacuation_centers"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTarget(t)}
              className={`mono-font text-xs px-3 py-1.5 rounded border transition ${target === t ? "border-primary/60 bg-primary/15 text-primary" : "border-primary/20 text-muted-foreground hover:bg-primary/5"}`}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>

        <label className="block border-2 border-dashed border-primary/30 rounded p-8 text-center bg-surface-2/40 cursor-pointer hover:border-primary/60 transition">
          {busy ? <Loader2 className="h-10 w-10 mx-auto text-primary/60 animate-spin" /> : <Upload className="h-10 w-10 mx-auto text-primary/60" />}
          <p className="mt-3 font-medium">{busy ? "Importing..." : "Drop CSV here or click to browse"}</p>
          <p className="text-xs text-muted-foreground mt-1 mono-font">columns: {headers[target].join(", ")}</p>
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} disabled={busy} />
        </label>
      </div>
    </Panel>
  );
}

function QuickAddPanel() {
  const [kind, setKind] = useState<"barangay" | "center" | "alert">("alert");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      let table = "";
      let row: any = {};
      if (kind === "barangay") {
        table = "barangays";
        row = { name: form.name, population: numOrNull(form.population), elevation_m: numOrNull(form.elevation_m), lat: numOrNull(form.lat), lng: numOrNull(form.lng) };
      } else if (kind === "center") {
        table = "evacuation_centers";
        row = { name: form.name, capacity: numOrNull(form.capacity), occupancy: numOrNull(form.occupancy) ?? 0, status: form.status || "available", lat: numOrNull(form.lat), lng: numOrNull(form.lng) };
      } else {
        table = "alerts";
        row = { level: form.level || "moderate", title: form.title, area: form.area || null, message: form.message || null };
      }
      const { error } = await supabase.from(table as any).insert(row);
      if (error) throw error;
      toast({ title: "Saved" });
      setForm({});
    } catch (err: any) {
      toast({ title: "Failed", description: err.message ?? String(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel label="QUICK ADD" title="Insert single record">
      <div className="flex gap-2 flex-wrap mb-3">
        {(["alert", "barangay", "center"] as const).map(k => (
          <button key={k} onClick={() => { setKind(k); setForm({}); }} className={`mono-font text-xs px-3 py-1.5 rounded border ${kind === k ? "border-primary/60 bg-primary/15 text-primary" : "border-primary/20 text-muted-foreground"}`}>
            {k.toUpperCase()}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {kind === "alert" && (
          <>
            <Field label="Title" value={form.title ?? ""} onChange={v => set("title", v)} required />
            <SelectField label="Level" value={form.level ?? "moderate"} onChange={v => set("level", v)} options={["low", "moderate", "high", "critical"]} />
            <Field label="Area" value={form.area ?? ""} onChange={v => set("area", v)} />
            <Field label="Message" value={form.message ?? ""} onChange={v => set("message", v)} />
          </>
        )}
        {kind === "barangay" && (
          <>
            <Field label="Name" value={form.name ?? ""} onChange={v => set("name", v)} required />
            <Field label="Population" value={form.population ?? ""} onChange={v => set("population", v)} type="number" />
            <Field label="Elevation (m)" value={form.elevation_m ?? ""} onChange={v => set("elevation_m", v)} type="number" />
            <Field label="Latitude" value={form.lat ?? ""} onChange={v => set("lat", v)} type="number" />
            <Field label="Longitude" value={form.lng ?? ""} onChange={v => set("lng", v)} type="number" />
          </>
        )}
        {kind === "center" && (
          <>
            <Field label="Name" value={form.name ?? ""} onChange={v => set("name", v)} required />
            <Field label="Capacity" value={form.capacity ?? ""} onChange={v => set("capacity", v)} type="number" />
            <Field label="Occupancy" value={form.occupancy ?? ""} onChange={v => set("occupancy", v)} type="number" />
            <Field label="Latitude" value={form.lat ?? ""} onChange={v => set("lat", v)} type="number" />
            <Field label="Longitude" value={form.lng ?? ""} onChange={v => set("lng", v)} type="number" />
          </>
        )}
        <button type="submit" disabled={busy} className="md:col-span-2 inline-flex items-center justify-center gap-2 px-4 py-2 rounded bg-primary text-primary-foreground font-bold text-sm hover:bg-primary-glow disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Save
        </button>
      </form>
    </Panel>
  );
}

function Field({ label, value, onChange, type = "text", required, placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mono-label">{label}</span>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} required={required} placeholder={placeholder}
        style={{ color: "#000000" }}
        className="mt-1 w-full px-3 py-2 rounded bg-surface-0 border border-primary/20 focus:border-primary/60 focus:outline-none mono-font text-sm placeholder:text-black/40" />
    </label>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className="block">
      <span className="mono-label">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ color: "#000000" }}
        className="mt-1 w-full px-3 py-2 rounded bg-surface-0 border border-primary/20 focus:border-primary/60 focus:outline-none mono-font text-sm">
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function Stat({ icon, label, count }: { icon: React.ReactNode; label: string; count: number }) {
  return (
    <div className="glass-panel p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded grid place-items-center bg-primary/10 text-primary border border-primary/30">{icon}</div>
      <div>
        <div className="mono-label">{label}</div>
        <div className="display-font text-2xl font-bold tabular-nums">{count}</div>
      </div>
    </div>
  );
}

function numOrNull(v: string): number | null {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Minimal CSV parser: comma-separated, header row, quoted fields, no embedded newlines.
function parseCsv(text: string): Record<string, any>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map(h => h.trim());
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = splitCsvLine(line);
    const row: Record<string, any> = {};
    headers.forEach((h, i) => {
      const raw = values[i]?.trim() ?? "";
      if (raw === "") { row[h] = null; return; }
      const n = Number(raw);
      row[h] = !isNaN(n) && /^-?\d+(\.\d+)?$/.test(raw) ? n : raw;
    });
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === "," && !inQ) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}
