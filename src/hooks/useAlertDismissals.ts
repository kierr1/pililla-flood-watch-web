import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type AlertDismissalEvent = CustomEvent<{ userId: string; alertId: string }>;

export function useAlertDismissals(userId: string | null) {
  const [dismissedAlertIds, setDismissedAlertIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(Boolean(userId));

  useEffect(() => {
    let active = true;
    setDismissedAlertIds(new Set());
    setLoading(Boolean(userId));

    if (!userId) return () => { active = false; };

    const handleDismissal = (event: Event) => {
      const { userId: eventUserId, alertId } = (event as AlertDismissalEvent).detail;
      if (eventUserId === userId) {
        setDismissedAlertIds(ids => new Set(ids).add(alertId));
      }
    };
    window.addEventListener("alert-dismissed", handleDismissal);

    void (async () => {
      try {
        const { data, error } = await supabase
          .from("alert_dismissals")
          .select("alert_id")
          .eq("user_id", userId);
        if (!active) return;

        if (error) {
          toast({ title: "Could not load dismissed alerts", description: error.message, variant: "destructive" });
        } else {
          setDismissedAlertIds(ids => new Set([...ids, ...data.map(row => row.alert_id)]));
        }
      } catch (error) {
        if (active) {
          toast({
            title: "Could not load dismissed alerts",
            description: error instanceof Error ? error.message : String(error),
            variant: "destructive",
          });
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      window.removeEventListener("alert-dismissed", handleDismissal);
    };
  }, [userId]);

  const dismissAlert = useCallback(async (alertId: string) => {
    if (!userId) {
      toast({ title: "Could not dismiss alert", description: "Sign in to dismiss alerts.", variant: "destructive" });
      return false;
    }

    try {
      const { error } = await supabase
        .from("alert_dismissals")
        .upsert(
          { user_id: userId, alert_id: alertId },
          { onConflict: "user_id,alert_id", ignoreDuplicates: true },
        );
      if (error) throw error;
    } catch (error) {
      toast({
        title: "Could not dismiss alert",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
      return false;
    }

    setDismissedAlertIds(ids => new Set(ids).add(alertId));
    window.dispatchEvent(new CustomEvent("alert-dismissed", { detail: { userId, alertId } }));
    return true;
  }, [userId]);

  return { dismissedAlertIds, loading, dismissAlert };
}
