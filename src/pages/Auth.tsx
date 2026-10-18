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
  const [emailNotConfirmed, setEmailNotConfirmed] = useState(false);
  const [resending, setResending] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, approvalError, approvalStatus, refreshAccess } = useAuth();
  const from = (location.state as any)?.from?.pathname || "/";

  useEffect(() => {
    if (!loading && user) navigate(from, { replace: true });
  }, [user, loading, navigate, from]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setEmailNotConfirmed(false);
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
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;

        // AuthProvider exposes a user only after the approved profile is verified.
        const { data: { user: authUser }, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!authUser) throw new Error("Sign-in succeeded but no user session was returned.");
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("approval_status")
          .eq("id", authUser.id)
          .maybeSingle();
        if (profileError) throw new Error("Could not read approval status: " + profileError.message);
        if (!profile) throw new Error("Your user profile was not found. Contact the administrator to repair the account.");
        if (profile.approval_status !== "approved") {
          await supabase.auth.signOut();
          toast({
            title: profile.approval_status === "rejected" ? "Access denied" : "Awaiting approval",
            description: profile.approval_status === "rejected"
              ? "Your request was rejected. Contact an administrator."
              : "Your account has not yet been approved. Try signing in again after approval.",
            variant: "destructive",
          });
          return;
        }
        await refreshAccess();
        toast({ title: "Signed in" });
      }
    } catch (err: any) {
      if (mode === "signin" && /email\s+not\s+confirmed/i.test(err.message ?? "")) setEmailNotConfirmed(true);
      toast({
        title: mode === "signup" ? "Sign-up failed" : "Sign-in failed",
        description: err.message ?? String(err),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function resendConfirmation() {
    if (!email.trim()) return;
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth` },
      });
      if (error) throw error;
      toast({ title: "Confirmation requested", description: "Check inbox and spam. Email delivery depends on your Supabase email provider settings." });
    } catch (err) {
      toast({ title: "Unable to resend email", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally { setResending(false); }
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
          {approvalError && <p role="alert" className="mb-4 text-sm text-risk-high break-words">Approval check failed: {approvalError}</p>}
          {approvalStatus === "pending" && <p role="status" className="mb-4 text-sm text-risk-moderate">Your account is awaiting administrator approval.</p>}
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

          {emailNotConfirmed && <div role="alert" className="mb-4 rounded border border-risk-high/40 bg-risk-high/10 p-3 text-sm space-y-2">
            <p>Supabase requires email confirmation before login. Your admin approval alone cannot bypass this setting.</p>
            <button type="button" onClick={() => void resendConfirmation()} disabled={resending || !email.trim()} className="min-h-10 rounded border border-primary/50 px-3 py-2 text-primary disabled:opacity-50">{resending ? "Sending…" : "Resend confirmation email"}</button>
            <p className="text-xs text-muted-foreground">If no email arrives, an administrator must check Authentication → Email provider and SMTP delivery in Supabase.</p>
          </div>}
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
            Email confirmation may also be required if enabled in Supabase.
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
