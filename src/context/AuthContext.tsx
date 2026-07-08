import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { SITE_URL } from "../config/env";
import { ADMIN_EMAIL } from "../lib/constants";
import type { Profile } from "../lib/types";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<Profile | null>;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchOrCreateProfile(
    userId: string,
    email?: string
  ): Promise<Profile | null> {
    const cleanEmail = email ? normalizeEmail(email) : undefined;

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

      setProfile(existing as Profile);
      return existing as Profile;
    }

    const { data: created, error: createError } = await supabase
      .from("profiles")
      .insert(createDefaultProfile(userId, cleanEmail))
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

  async function syncSession(nextSession: Session | null) {
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
        emailRedirectTo: `${SITE_URL}/login?confirmed=1`,
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

  const signIn = async (email: string, password: string) => {
    const cleanEmail = normalizeEmail(email);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) return { error: error.message };

    const profileAfterLogin = data.user?.email_confirmed_at
      ? await fetchOrCreateProfile(data.user.id, data.user.email)
      : null;

    if (data.user?.email_confirmed_at && !profileAfterLogin) {
      return { error: "This account is disabled or could not be loaded." };
    }

    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut({ scope: "global" });
    clearSupabaseStorage();
    setSession(null);
    setProfile(null);
  };

  const refreshProfile = async () => {
    const { data } = await supabase.auth.getSession();

    if (!data.session?.user) {
      setSession(null);
      setProfile(null);
      return null;
    }

    setSession(data.session);
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
