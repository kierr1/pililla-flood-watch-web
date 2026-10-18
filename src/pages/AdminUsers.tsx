import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, ShieldOff, Users, Search, Loader2, UserPlus, Crown, History, Check, X, Clock } from "lucide-react";
import { Panel, PageHeader } from "@/components/mission/Panel";
import { EmptyState } from "@/components/mission/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type ApprovalStatus = "pending" | "approved" | "rejected";
type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  agency: string | null;
  phone: string | null;
  created_at: string;
  approval_status: ApprovalStatus;
};
type RoleRow = { user_id: string; role: "admin" | "user"; created_at: string };
type AuditRow = { id: string; action: string; target: string | null; created_at: string; actor_id: string | null };

type Filter = "all" | "admins" | "users";

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    const [{ data: p }, { data: r }, { data: a }] = await Promise.all([
      supabase.from("profiles").select("id,email,display_name,agency,phone,created_at,approval_status").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id,role,created_at"),
      supabase.from("audit_logs").select("id,action,target,created_at,actor_id").in("action", ["grant_admin", "revoke_admin", "approve_user", "reject_user"]).order("created_at", { ascending: false }).limit(20),
    ]);
    setProfiles((p as Profile[]) ?? []);
    setRoles((r as RoleRow[]) ?? []);
    setAudit((a as AuditRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  const rolesByUser = useMemo(() => {
    const m = new Map<string, RoleRow[]>();
    roles.forEach(r => {
      const arr = m.get(r.user_id) ?? [];
      arr.push(r);
      m.set(r.user_id, arr);
    });
    return m;
  }, [roles]);

  const adminCount = useMemo(() => new Set(roles.filter(r => r.role === "admin").map(r => r.user_id)).size, [roles]);
  const totalUsers = profiles.length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return profiles.filter(p => {
      const userRoles = rolesByUser.get(p.id) ?? [];
      const isAdmin = userRoles.some(r => r.role === "admin");
      if (filter === "admins" && !isAdmin) return false;
      if (filter === "users" && isAdmin) return false;
      if (!q) return true;
      return (
        (p.email ?? "").toLowerCase().includes(q) ||
        (p.display_name ?? "").toLowerCase().includes(q) ||
        (p.agency ?? "").toLowerCase().includes(q)
      );
    });
  }, [profiles, rolesByUser, search, filter]);

  async function toggleAdmin(target: Profile, currentlyAdmin: boolean) {
    if (target.id === me?.id) {
      toast({ title: "Action blocked", description: "You cannot change your own admin role.", variant: "destructive" });
      return;
    }
    setPendingId(target.id);
    try {
      if (currentlyAdmin) {
        const { error } = await supabase.from("user_roles").delete().eq("user_id", target.id).eq("role", "admin");
        if (error) throw error;
        await supabase.from("audit_logs").insert({
          action: "revoke_admin",
          actor_id: me?.id ?? null,
          target: target.email ?? target.id,
          metadata: { target_user_id: target.id },
        });
        toast({ title: "Admin revoked", description: `${target.email ?? target.display_name ?? "User"} is now a standard user.` });
      } else {
        const { error } = await supabase.from("user_roles").insert({ user_id: target.id, role: "admin" });
        if (error) throw error;
        await supabase.from("audit_logs").insert({
          action: "grant_admin",
          actor_id: me?.id ?? null,
          target: target.email ?? target.id,
          metadata: { target_user_id: target.id },
        });
        toast({ title: "Admin granted", description: `${target.email ?? target.display_name ?? "User"} now has full clearance.` });
      }
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Failed", description: msg, variant: "destructive" });
    } finally {
      setPendingId(null);
    }
  }

  async function setApproval(target: Profile, next: ApprovalStatus) {
    if (target.id === me?.id) {
      toast({ title: "Action blocked", description: "You cannot change your own approval status.", variant: "destructive" });
      return;
    }
    setPendingId(target.id);
    try {
      const { data: updated, error } = await supabase.from("profiles").update({ approval_status: next }).eq("id", target.id).select("id,approval_status").maybeSingle();
      if (error) throw error;
      if (!updated || updated.approval_status !== next) throw new Error("Approval was not saved. Check profiles update permissions and database policies.");
      await supabase.from("audit_logs").insert({
        action: next === "approved" ? "approve_user" : "reject_user",
        actor_id: me?.id ?? null,
        target: target.email ?? target.id,
        metadata: { target_user_id: target.id, status: next },
      });
      toast({
        title: next === "approved" ? "User approved" : "User rejected",
        description: `${target.email ?? target.display_name ?? "User"} access status updated.`,
      });
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Failed", description: msg, variant: "destructive" });
    } finally {
      setPendingId(null);
    }
  }

  const pendingProfiles = useMemo(() => profiles.filter(p => p.approval_status === "pending"), [profiles]);

  const actorEmailById = useMemo(() => {
    const m = new Map<string, string>();
    profiles.forEach(p => { if (p.email) m.set(p.id, p.email); });
    return m;
  }, [profiles]);

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        code="0A"
        title="Admin Panel · User Management"
        subtitle="View all operators, audit clearance levels, and grant or revoke admin access."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={<Users className="h-5 w-5" />} label="Total operators" value={totalUsers} tone="primary" />
        <Stat icon={<Clock className="h-5 w-5" />} label="Pending approval" value={pendingProfiles.length} tone={pendingProfiles.length > 0 ? "warn" : "muted"} />
        <Stat icon={<Crown className="h-5 w-5" />} label="Admins" value={adminCount} tone="warn" />
        <Stat icon={<ShieldCheck className="h-5 w-5" />} label="Standard users" value={Math.max(0, totalUsers - adminCount)} tone="muted" />
      </div>

      {pendingProfiles.length > 0 && (
        <Panel
          label="ACCESS REQUESTS"
          title={`${pendingProfiles.length} pending approval${pendingProfiles.length === 1 ? "" : "s"}`}
          action={<Clock className="h-4 w-4 text-risk-high" />}
        >
          <ul className="space-y-2">
            {pendingProfiles.map(p => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-3 px-3 py-2.5 rounded bg-risk-high/5 border border-risk-high/20"
              >
                <div className="h-9 w-9 rounded grid place-items-center mono-font text-xs font-bold border bg-risk-high/15 text-risk-high border-risk-high/40">
                  {(p.display_name ?? p.email ?? "?").slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium leading-tight truncate">{p.display_name ?? "—"}</div>
                  <div className="mono-font text-[11px] text-muted-foreground truncate">{p.email ?? "—"}</div>
                </div>
                <span className="mono-font text-[10px] text-muted-foreground hidden sm:block">
                  Requested {new Date(p.created_at).toLocaleString()}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setApproval(p, "approved")}
                    disabled={pendingId === p.id}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-primary/40 text-primary hover:bg-primary/10 transition disabled:opacity-40"
                  >
                    {pendingId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Approve
                  </button>
                  <button
                    onClick={() => setApproval(p, "rejected")}
                    disabled={pendingId === p.id}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-risk-high/40 text-risk-high hover:bg-risk-high/10 transition disabled:opacity-40"
                  >
                    <X className="h-3.5 w-3.5" />
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel
        label="ROSTER"
        title="Operators & Clearance"

      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5 min-w-0">
          <div className="relative flex-1 min-w-0">
            <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="search" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search email, name, agency…"
              aria-label="Search operators"
              className="w-full pl-8 pr-3 py-2 rounded bg-surface-0 border border-primary/20 focus:border-primary/60 focus:outline-none text-xs mono-font text-foreground placeholder:text-muted-foreground/60" />
          </div>
          <div className="flex w-full sm:w-auto gap-1 p-0.5 rounded bg-surface-2 border border-primary/15">
            {(["all", "admins", "users"] as Filter[]).map(f => (
              <button key={f} type="button" onClick={() => setFilter(f)}
                className={cn("flex-1 sm:flex-none mono-font text-[10px] px-3 py-2 rounded uppercase",
                  filter === f ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground")}>{f}</button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="py-10 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<UserPlus className="h-5 w-5" />}
            title={search ? "No matches" : "No operators"}
            description={search ? "Try a different search term or filter." : "Operators appear here after their first sign-in."}
          />
        ) : (
          <div className="w-full max-w-full overflow-x-auto pb-2" role="region" aria-label="Operator table" tabIndex={0}>
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left mono-label border-b border-primary/15">
                  <th className="py-2 px-2">OPERATOR</th>
                  <th className="py-2 px-2">EMAIL</th>
                  <th className="py-2 px-2 hidden md:table-cell">AGENCY</th>
                  <th className="py-2 px-2">CLEARANCE</th>
                  <th className="py-2 px-2 hidden md:table-cell">JOINED</th>
                  <th className="py-2 px-2 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const userRoles = rolesByUser.get(p.id) ?? [];
                  const isAdmin = userRoles.some(r => r.role === "admin");
                  const isSelf = p.id === me?.id;
                  const initials = (p.display_name ?? p.email ?? "?").slice(0, 2).toUpperCase();
                  return (
                    <tr key={p.id} className={cn("border-b border-primary/5 hover:bg-primary/5", isSelf && "bg-primary/5")}>
                      <td className="py-2.5 px-2">
                        <div className="flex items-center gap-2.5">
                          <div className={cn(
                            "h-8 w-8 rounded grid place-items-center mono-font text-xs font-bold border",
                            isAdmin ? "bg-primary/15 text-primary border-primary/40" : "bg-surface-2 text-muted-foreground border-primary/15",
                          )}>
                            {initials}
                          </div>
                          <div>
                            <div className="font-medium leading-tight">{p.display_name ?? "—"}{isSelf && <span className="ml-1.5 mono-font text-[10px] text-primary">(YOU)</span>}</div>
                            {p.phone && <div className="mono-font text-[10px] text-muted-foreground">{p.phone}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 mono-font text-xs text-foreground/90 max-w-[190px] break-all">{p.email ?? "—"}</td>
                      <td className="py-2.5 px-2 hidden md:table-cell text-xs text-muted-foreground">{p.agency ?? "—"}</td>
                      <td className="py-2.5 px-2">
                        <div className="flex flex-wrap gap-1">
                          <span className={cn(
                            "mono-font text-[10px] px-2 py-0.5 rounded border inline-flex items-center gap-1",
                            isAdmin ? "text-primary border-primary/40 bg-primary/10" : "text-muted-foreground border-primary/15",
                          )}>
                            {isAdmin ? <><Crown className="h-3 w-3" /> ADMIN</> : "USER"}
                          </span>
                          {p.approval_status !== "approved" && (
                            <span className={cn(
                              "mono-font text-[10px] px-2 py-0.5 rounded border inline-flex items-center gap-1",
                              p.approval_status === "pending"
                                ? "text-risk-high border-risk-high/40 bg-risk-high/10"
                                : "text-muted-foreground border-primary/15 bg-surface-2",
                            )}>
                              {p.approval_status === "pending" ? <><Clock className="h-3 w-3" /> PENDING</> : "REJECTED"}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 hidden md:table-cell mono-font text-[10px] text-muted-foreground">
                        {new Date(p.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <button
                          onClick={() => toggleAdmin(p, isAdmin)}
                          disabled={isSelf || pendingId === p.id}
                          title={isSelf ? "Cannot modify your own role" : isAdmin ? "Revoke admin clearance" : "Grant admin clearance"}
                          className={cn(
                            "inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition",
                            isAdmin
                              ? "border-risk-high/40 text-risk-high hover:bg-risk-high/10"
                              : "border-primary/40 text-primary hover:bg-primary/10",
                            "disabled:opacity-40 disabled:cursor-not-allowed",
                          )}
                        >
                          {pendingId === p.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : isAdmin ? (
                            <ShieldOff className="h-3 w-3" />
                          ) : (
                            <ShieldCheck className="h-3 w-3" />
                          )}
                          {isAdmin ? "Revoke" : "Grant"}
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

      <Panel label="AUDIT TRAIL" title="Recent admin actions" action={<History className="h-4 w-4 text-muted-foreground" />}>
        {audit.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No admin actions recorded yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {audit.map(a => {
              const positive = a.action === "grant_admin" || a.action === "approve_user";
              const label =
                a.action === "grant_admin" ? "GRANTED" :
                a.action === "revoke_admin" ? "REVOKED" :
                a.action === "approve_user" ? "APPROVED" : "REJECTED";
              return (
                <li key={a.id} className="flex items-center gap-3 text-xs px-2.5 py-2 rounded bg-surface-2/40 border border-primary/10">
                  <span className={cn(
                    "mono-font text-[10px] px-2 py-0.5 rounded",
                    positive ? "bg-primary/15 text-primary" : "bg-risk-high/15 text-risk-high",
                  )}>
                    {label}
                  </span>
                  <span className="flex-1 truncate">
                    <span className="text-foreground/90">{a.target ?? "—"}</span>
                    <span className="text-muted-foreground"> by </span>
                    <span className="mono-font text-foreground/80">{a.actor_id ? actorEmailById.get(a.actor_id) ?? a.actor_id.slice(0, 8) : "system"}</span>
                  </span>
                  <span className="mono-font text-[10px] text-muted-foreground shrink-0">
                    {new Date(a.created_at).toLocaleString()}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "primary" | "warn" | "muted" }) {
  const toneClass =
    tone === "primary" ? "bg-primary/10 text-primary border-primary/30" :
    tone === "warn" ? "bg-risk-high/10 text-risk-high border-risk-high/30" :
    "bg-surface-2 text-muted-foreground border-primary/15";
  return (
    <div className="glass-panel p-4 flex items-center gap-3">
      <div className={cn("h-10 w-10 rounded grid place-items-center border", toneClass)}>{icon}</div>
      <div>
        <div className="mono-label">{label}</div>
        <div className="display-font text-2xl font-bold tabular-nums">{value}</div>
      </div>
    </div>
  );
}
