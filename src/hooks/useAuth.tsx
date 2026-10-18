import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Role = "admin" | "user";
type Approval = "pending" | "approved" | "rejected" | null;
interface AuthContextValue {
  user: User | null;
  session: Session | null;
  roles: Role[];
  isAdmin: boolean;
  loading: boolean;
  approvalStatus: Approval;
  approvalError: string | null;
  refreshAccess: () => Promise<void>;
  signOut: () => Promise<void>;
}
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvalStatus, setApprovalStatus] = useState<Approval>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    let serial = 0;
    async function verify(nextSession: Session | null) {
      const request = ++serial;
      if (!live) return;
      setLoading(true);
      setSession(nextSession);
      setUser(null);
      setRoles([]);
      setApprovalStatus(null);
      setApprovalError(null);
      if (!nextSession?.user) { setLoading(false); return; }
      try {
        const { data: profile, error } = await supabase.from("profiles")
          .select("approval_status").eq("id", nextSession.user.id).maybeSingle();
        if (error) throw error;
        if (!profile) throw new Error("Account profile is missing or inaccessible. Contact an administrator.");
        if (!live || serial !== request) return;
        const status = profile.approval_status as Approval;
        setApprovalStatus(status);
        if (status !== "approved") { setLoading(false); return; }
        const { data: rows, error: rolesError } = await supabase.from("user_roles")
          .select("role").eq("user_id", nextSession.user.id);
        if (!live || serial !== request) return;
        if (rolesError) throw rolesError;
        setRoles((rows ?? []).map(r => r.role as Role));
        setUser(nextSession.user);
        setLoading(false);
      } catch (error) {
        if (!live || serial !== request) return;
        setApprovalError(error instanceof Error ? error.message : String(error));
        setLoading(false);
      }
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      // Defer Supabase requests outside the auth-state callback to prevent deadlocks.
      setTimeout(() => { if (live) void verify(nextSession); }, 0);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (live) void verify(data.session);
    }).catch(error => {
      if (live) { setApprovalError(String(error)); setLoading(false); }
    });
    return () => { live = false; serial++; subscription.unsubscribe(); };
  }, []);

  async function refreshAccess() {
    const { data: { session: current }, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!current) { setUser(null); setSession(null); setRoles([]); setApprovalStatus(null); return; }
    const { data: profile, error: profileError } = await supabase.from("profiles")
      .select("approval_status").eq("id", current.user.id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile) throw new Error("Account profile is missing or inaccessible.");
    const status = profile.approval_status as Approval;
    setApprovalStatus(status);
    if (status !== "approved") { setUser(null); setRoles([]); return; }
    const { data: roleRows, error: roleError } = await supabase.from("user_roles")
      .select("role").eq("user_id", current.user.id);
    if (roleError) throw roleError;
    setSession(current);
    setUser(current.user);
    setRoles((roleRows ?? []).map(r => r.role as Role));
    setApprovalError(null);
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setSession(null); setUser(null); setRoles([]); setApprovalStatus(null);
  }

  return <AuthContext.Provider value={{
    user, session, roles, isAdmin: roles.includes("admin"), loading,
    approvalStatus, approvalError, refreshAccess, signOut,
  }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
