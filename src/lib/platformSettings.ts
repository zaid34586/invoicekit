import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export type PlatformSettings = {
  maintenance_mode: boolean;
  maintenance_message: string;
  allow_admin_bypass: boolean;
  public_signup: boolean;
};

const DEFAULTS: PlatformSettings = {
  maintenance_mode: false,
  maintenance_message: "We are improving Rivox. Please check back soon.",
  allow_admin_bypass: true,
  public_signup: true,
};

// admin_system_settings.value is one JSONB blob keyed "platform" holding
// all the toggles from Admin -> Settings. This is the first thing that
// actually reads it outside the admin panel itself.
export function usePlatformSettings() {
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("admin_system_settings")
          .select("value")
          .eq("key", "platform")
          .maybeSingle();
        if (cancelled) return;
        if (data?.value) setSettings({ ...DEFAULTS, ...(data.value as Partial<PlatformSettings>) });
      } catch {
        // fail open: never hard-block the app because this fetch failed
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { settings, loaded };
}
