import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { ADMIN_EMAIL } from "../lib/constants";
import type { Profile } from "../lib/types";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string, options?: { skipProfile?: boolean }) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: (options?: { skipProfile?: boolean }) => Promise<Profile | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function clearSupabaseStorage() {
  try {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("sb-")) localStorage.removeItem(key);
    });
    Object.keys(sessionStorage).forEach((key) => {
      if (key.startsWith("sb-")) sessionStorage.removeItem(key);
    });
  } catch (error) {
    console.warn("Unable to clear auth storage", error);
  }
}

function createDefaultProfile(userId: string, email?: string) {
  return {
    user_id: userId,
    email: email ?? null,
    business_name: null,
    gstin: null,
    phone: null,
    state: null,
    address: null,
    logo_url: null,
    is_pro: false,
    phone_verified: false,
    currency: null,
    payment_gateway: null,
    country: null,
    country_code: null,
    timezone: null,
    date_format: null,
  };
}

function isStaffPortalRoute() {
  if (typeof window === "undefined") return false;
  return window.location.pathname.startsWith("/staff");
}

async function findActiveStaffMember(userId: string, email?: string | null) {
  const cleanEmail = email ? normalizeEmail(email) : "";
  let query = `auth_user_id.eq.${userId}`;
  if (cleanEmail) query += `,email.eq.${cleanEmail}`;

  const { data, error } = await supabase
    .from("admin_team_members")
    .select("id, role, status, email")
    .or(query)
    .maybeSingle();

  if (error) {
    console.warn("Staff lookup failed:", error.message);
    return null;
  }

  return data && data.status === "active" ? data : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchOrCreateProfile(
    userId: string,
    email?: string
  ): Promise<Profile | null> {
    const cleanEmail = email ? normalizeEmail(email) : undefined;

    // Staff accounts must never become customer profiles. Staff login has its
    // own portal and reads admin_team_members instead of profiles. Without this
    // guard, every /staff/login created a customer row and polluted Admin → Users.
    const activeStaff = await findActiveStaffMember(userId, cleanEmail);
    if (activeStaff) {
      setProfile(null);
      return null;
    }

    const { data: existing, error: fetchError } = await supabase
      .from("profiles")
      .select("*")
      .or(`user_id.eq.${userId},id.eq.${userId}`)
      .maybeSingle();

    if (fetchError) {
      console.error("Profile fetch error:", fetchError.message);
      setProfile(null);
      return null;
    }

    if (existing) {
      if ((existing as Profile & { is_banned?: boolean }).is_banned === true) {
        await supabase.auth.signOut();
        clearSupabaseStorage();
        setSession(null);
        setProfile(null);
        return null;
      }

      const maybeProfile = existing as Profile & {
        free_pro_until?: string | null;
        plan?: string | null;
      };
      const freeProExpired =
        maybeProfile.free_pro_until &&
        new Date(maybeProfile.free_pro_until).getTime() < Date.now();

      if (freeProExpired) {
        const { data: updated } = await supabase
          .from("profiles")
          .update({ is_pro: false, plan: "free", free_pro_until: null })
          .eq("id", maybeProfile.id)
          .select("*")
          .single();

        if (updated) {
          setProfile(updated as Profile);
          return updated as Profile;
        }
      }

      setProfile(existing as Profile);
      return existing as Profile;
    }

    // Use upsert (not insert) here. Right after email confirmation,
    // initializeAuth()'s getSession() and the onAuthStateChange(SIGNED_IN)
    // listener both fire on the same page load and can call this function
    // concurrently. With a plain insert, the second call hit a duplicate-key
    // error on user_id and set `profile` to null PERMANENTLY — even though a
    // profile row existed — which is what caused "Loading your workspace" to
    // hang forever after clicking the real email verification link. upsert
    // makes the "losing" concurrent call a harmless no-op update instead of
    // an error.
    const { data: created, error: createError } = await supabase
      .from("profiles")
      .upsert(createDefaultProfile(userId, cleanEmail), { onConflict: "user_id" })
      .select("*")
      .single();

    if (createError) {
      console.error("Profile create error:", createError.message);
      setProfile(null);
      return null;
    }

    setProfile(created as Profile);
    return created as Profile;
  }

  async function syncSession(nextSession: Session | null, options?: { skipProfile?: boolean }) {
    if (!nextSession?.user) {
      setSession(null);
      setProfile(null);
      return null;
    }

    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      await supabase.auth.signOut();
      clearSupabaseStorage();
      setSession(null);
      setProfile(null);
      return null;
    }

    setSession(nextSession);

    if (!data.user.email_confirmed_at) {
      setProfile(null);
      return null;
    }

    const skipProfile = options?.skipProfile || isStaffPortalRoute();
    if (skipProfile) {
      const staff = await findActiveStaffMember(data.user.id, data.user.email);
      if (staff) {
        setProfile(null);
        return null;
      }
    }

    return await fetchOrCreateProfile(data.user.id, data.user.email);
  }

  useEffect(() => {
    let mounted = true;

    async function initializeAuth() {
      setLoading(true);
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      await syncSession(data.session);
      if (mounted) setLoading(false);
    }

    initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!mounted) return;
      await syncSession(nextSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string) => {
    const cleanEmail = normalizeEmail(email);

    if (cleanEmail === ADMIN_EMAIL.toLowerCase()) {
      return { error: "This email address is reserved and cannot be used to sign up." };
    }

    if (password.length < 8) {
      return { error: "Password must be at least 8 characters." };
    }

    const { data, error: fnError } = await supabase.functions.invoke(
      "check-email",
      { body: { email: cleanEmail } }
    );

    if (fnError) {
      console.warn("check-email function error:", fnError.message);
    } else if (data?.exists === true) {
      return {
        error: "This email is already registered. Please sign in.",
      };
    }

    const { error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/login?confirmed=1`,
      },
    });

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        return { error: "This email is already registered. Please sign in." };
      }
      return { error: error.message };
    }

    return { error: null };
  };

  const signIn = async (email: string, password: string, options?: { skipProfile?: boolean }) => {
    const cleanEmail = normalizeEmail(email);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) return { error: error.message };

    if (data.user?.email_confirmed_at) {
      if (options?.skipProfile) {
        const staff = await findActiveStaffMember(data.user.id, data.user.email);
        if (!staff) {
          await supabase.auth.signOut();
          clearSupabaseStorage();
          setSession(null);
          setProfile(null);
          return { error: "This staff account is not active or not authorized." };
        }
        await syncSession(data.session, { skipProfile: true });
        return { error: null };
      }

      const profileAfterLogin = await fetchOrCreateProfile(data.user.id, data.user.email);
      if (!profileAfterLogin) {
        await supabase.auth.signOut();
        clearSupabaseStorage();
        setSession(null);
        setProfile(null);
        return { error: "This account is disabled, is a staff account, or could not be loaded." };
      }
    }

    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut({ scope: "global" });
    clearSupabaseStorage();
    setSession(null);
    setProfile(null);
  };

  const refreshProfile = async (options?: { skipProfile?: boolean }) => {
    const { data } = await supabase.auth.getSession();

    if (!data.session?.user) {
      setSession(null);
      setProfile(null);
      return null;
    }

    setSession(data.session);
    if (options?.skipProfile || isStaffPortalRoute()) {
      const staff = await findActiveStaffMember(data.session.user.id, data.session.user.email);
      if (staff) {
        setProfile(null);
        return null;
      }
    }
    return await fetchOrCreateProfile(
      data.session.user.id,
      data.session.user.email
    );
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        signUp,
        signIn,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
