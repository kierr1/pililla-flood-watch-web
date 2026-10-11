import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Satellite, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

type Mode = "signin" | "signup";

export default function Auth() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();
  const from = (location.state as any)?.from?.pathname || "/";

  useEffect(() => {
    if (!loading && user) navigate(from, { replace: true });
  }, [user, loading, navigate, from]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "signup") {
        const redirectUrl = `${window.location.origin}/`;
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectUrl,
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) throw error;
        // Sign out immediately — account requires admin approval before access.
        await supabase.auth.signOut();
        setMode("signin");
        toast({
          title: "Access request submitted",
          description: "Your account is pending admin approval. You will be notified once granted access.",
        });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        // Verify approval status before allowing access.
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("approval_status")
            .eq("id", authUser.id)
            .maybeSingle();
          if (profile?.approval_status !== "approved") {
            await supabase.auth.signOut();
            const status = profile?.approval_status ?? "pending";
            toast({
              title: status === "rejected" ? "Access denied" : "Awaiting approval",
              description:
                status === "rejected"
                  ? "Your access request was rejected. Contact an administrator."
                  : "Your account is still pending admin approval.",
              variant: "destructive",
            });
            return;
          }
        }
        toast({ title: "Signed in" });
      }
    } catch (err: any) {
      toast({
        title: mode === "signup" ? "Sign-up failed" : "Sign-in failed",
        description: err.message ?? String(err),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center p-4 bg-background">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-3 justify-center mb-6">
          <div className="h-10 w-10 rounded grid place-items-center bg-primary/15 border border-primary/40 shadow-glow">
            <Satellite className="h-5 w-5 text-primary" />
          </div>
          <div className="leading-tight">
            <div className="display-font text-base font-bold text-primary text-glow tracking-wider">FLOOD-OPS · PILILLA</div>
            <div className="mono-label">MISSION CONTROL ACCESS</div>
          </div>
        </Link>

        <div className="glass-panel hud-brackets p-6">
          <div className="flex gap-1 mb-5 p-1 rounded bg-surface-2 border border-primary/15">
            {(["signin", "signup"] as Mode[]).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 px-3 py-1.5 rounded text-xs font-bold mono-font transition ${
                  mode === m ? "bg-primary/20 text-primary border border-primary/40" : "text-muted-foreground"
                }`}
              >
                {m === "signin" ? "SIGN IN" : "REQUEST ACCESS"}
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="space-y-3">
            {mode === "signup" && (
              <Field
                label="Display name"
                type="text"
                value={displayName}
                onChange={setDisplayName}
                placeholder="Operator name"
              />
            )}
            <Field label="Email" type="email" value={email} onChange={setEmail} required placeholder="operator@agency.gov" />
            <Field label="Password" type="password" value={password} onChange={setPassword} required minLength={6} placeholder="•••••••" />

            <button
              type="submit"
              disabled={submitting}
              className="w-full mt-2 px-4 py-2.5 rounded bg-gradient-primary text-primary-foreground font-bold text-sm shadow-glow hover:scale-[1.01] transition disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "signin" ? "AUTHENTICATE" : "CREATE ACCOUNT"}
            </button>
          </form>

          <p className="mono-label text-center mt-5">
            New accounts require <span className="text-primary">admin approval</span> before access is granted.
            <br />
            No email confirmation needed — you will be notified once approved.
          </p>
        </div>

        <Link to="/" className="block text-center mono-label mt-4 hover:text-primary">← RETURN TO DASHBOARD</Link>
      </div>
    </div>
  );
}

function Field({
  label, type, value, onChange, required, minLength, placeholder,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  minLength?: number;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mono-label">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        placeholder={placeholder}
        style={{ color: "#000000" }}
        className="mt-1 w-full px-3 py-2 rounded bg-surface-0 border border-primary/20 focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/40 mono-font text-sm text-black placeholder:text-muted-foreground/60"
      />
    </label>
  );
}
