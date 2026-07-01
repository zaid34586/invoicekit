import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
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
    const { data: existing, error: fetchError } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (fetchError) {
      console.error("Profile fetch error:", fetchError.message);
      setProfile(null);
      return null;
    }

    if (existing) {
      setProfile(existing as Profile);
      return existing as Profile;
    }

    const { data: created, error: createError } = await supabase
      .from("profiles")
      .insert(createDefaultProfile(userId, email))
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
    setSession(nextSession);

    if (!nextSession?.user) {
      setProfile(null);
      return null;
    }

    // Only create profile if email is confirmed
    if (!nextSession.user.email_confirmed_at) {
      setProfile(null);
      return null;
    }

    return await fetchOrCreateProfile(
      nextSession.user.id,
      nextSession.user.email
    );
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

  // App already loaded.
  // Don't show global loader during login/logout.
  await syncSession(nextSession);
});
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Signup: check email via Edge Function first
  const signUp = async (email: string, password: string) => {
    // Call Edge Function to check if email already exists in auth.users
    const { data, error: fnError } = await supabase.functions.invoke(
      "check-email",
      { body: { email } }
    );

    if (fnError) {
      // Edge function error — fallback to direct signup
      console.warn("check-email function error:", fnError.message);
    } else if (data?.exists === true) {
      return {
        error: "This email is already registered. Please sign in.",
      };
    }

    const { error } = await supabase.auth.signUp({
      email,
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

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    // Clear all local storage keys related to supabase
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("sb-")) localStorage.removeItem(key);
    });
    sessionStorage.clear();
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