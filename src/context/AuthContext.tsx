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
  workspaceOwnerId: string | null;
  workspaceRole: "owner" | "manager" | "accountant" | "staff" | null;
  workspaceStatus: "active" | "disabled" | "removed" | null;
  workspaceName: string | null;
  workspacePermissions: string[];
  workspaceCustomRole: string | null;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string, options?: { skipProfile?: boolean }) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: (options?: { skipProfile?: boolean }) => Promise<Profile | null>;
  refreshWorkspace: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const VERIFICATION_PENDING_KEY = "rivox_email_verification_pending";

function isVerificationCallbackUrl() {
  if (typeof window === "undefined") return false;

  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const authType = search.get("type") || hash.get("type");

  return (
    authType === "signup" ||
    authType === "email" ||
    search.has("token_hash") ||
    search.has("code") ||
    hash.has("access_token") ||
    hash.has("refresh_token")
  );
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getSecurityDeviceId() {
  const key = "rivox_security_device_id";
  let value = localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(key, value);
  }
  return value;
}

function deviceLabel() {
  const ua = navigator.userAgent;
  const browser = ua.includes("Edg/") ? "Edge" : ua.includes("Chrome/") ? "Chrome" : ua.includes("Firefox/") ? "Firefox" : ua.includes("Safari/") ? "Safari" : "Browser";
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || "Device";
  return `${browser} on ${platform}`;
}

function securityPortal(user: User): "admin" | "staff" | "customer" {
  if (String(user.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase()) return "admin";
  return isStaffPortalRoute() ? "staff" : "customer";
}

async function registerSecuritySession(user: User) {
  try {
    const sessionKey = `${user.id}:${getSecurityDeviceId()}`;
    await supabase.from("admin_active_sessions").upsert({
      session_key: sessionKey,
      user_id: user.id,
      email: user.email || null,
      portal: securityPortal(user),
      device_label: deviceLabel(),
      user_agent: navigator.userAgent,
      last_seen_at: new Date().toISOString(),
      expires_at: null,
      force_logout: false,
      status: "active",
      revoked_at: null,
      revoke_reason: null,
    }, { onConflict: "session_key" });
  } catch (error) {
    console.warn("Security session registration unavailable", error);
  }
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
  const [workspaceOwnerId, setWorkspaceOwnerId] = useState<string | null>(null);
  const [workspaceRole, setWorkspaceRole] = useState<AuthContextValue["workspaceRole"]>(null);
  const [workspaceStatus, setWorkspaceStatus] = useState<AuthContextValue["workspaceStatus"]>(null);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [workspacePermissions, setWorkspacePermissions] = useState<string[]>([]);
  const [workspaceCustomRole, setWorkspaceCustomRole] = useState<string | null>(null);

  function clearAuthState() {
    setSession(null);
    setProfile(null);
    setWorkspaceOwnerId(null);
    setWorkspaceRole(null);
    setWorkspaceStatus(null);
    setWorkspaceName(null);
    setWorkspacePermissions([]);
    setWorkspaceCustomRole(null);
  }

  async function loadWorkspaceContext(): Promise<Profile | null> {
    const [{ data, error }, { data: permissionData }] = await Promise.all([
      supabase.rpc("get_my_workspace_context"),
      supabase.rpc("get_my_workspace_permissions"),
    ]);
    if (error || !data) return null;
    setWorkspaceOwnerId(data.owner_user_id ?? null);
    setWorkspaceRole(data.role ?? null);
    setWorkspaceStatus(data.status ?? null);
    setWorkspaceName(data.workspace_name ?? null);
    setWorkspacePermissions(Array.isArray(permissionData) ? permissionData : Array.isArray(data.permissions) ? data.permissions : []);
    setWorkspaceCustomRole(data.custom_role_name ?? null);
    if (data.owner_profile && data.role === "owner") {
      const ownerProfile = { ...data.owner_profile, workspace_owner_id: data.owner_user_id, workspace_role: "owner", workspace_member_status: "active" } as Profile;
      setProfile(ownerProfile);
      return ownerProfile;
    }
    if (data.owner_profile && data.role !== "owner" && data.status === "active") {
      const merged = { ...data.owner_profile, workspace_owner_id: data.owner_user_id, workspace_role: data.role, workspace_member_status: data.status } as Profile;
      setProfile(merged);
      return merged;
    }
    return null;
  }

  async function refreshWorkspace() { await loadWorkspaceContext(); }

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
      const workspaceProfile = await loadWorkspaceContext();
      return workspaceProfile || existing as Profile;
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
    const workspaceProfile = await loadWorkspaceContext();
    return workspaceProfile || created as Profile;
  }

  async function syncSession(nextSession: Session | null, options?: { skipProfile?: boolean }) {
    if (!nextSession?.user) {
      clearAuthState();
      return null;
    }

    let { data, error } = await supabase.auth.getUser();

    // Bug fix: a refresh used to log staff/customers out instantly on ANY
    // getUser() hiccup (a cold network request, a brief Supabase blip right
    // after a token refresh, etc). That's not proof the session is invalid --
    // only an explicit auth error (expired/invalid JWT) is. For anything
    // else, retry once before giving up, and otherwise trust the session we
    // already have from localStorage rather than force-signing-out.
    if (error) {
      const authInvalid = error.status === 401 || /invalid|expired|revoked/i.test(error.message || "");
      if (authInvalid) {
        await supabase.auth.signOut();
        clearSupabaseStorage();
        clearAuthState();
        return null;
      }
      // Transient error (network blip, cold start) -- retry once.
      await new Promise((resolve) => setTimeout(resolve, 600));
      const retry = await supabase.auth.getUser();
      data = retry.data;
      error = retry.error;
      if (error || !data.user) {
        // Still failing, but not a confirmed-invalid session -- keep the
        // person signed in on the session we have rather than bouncing them.
        setSession(nextSession);
        return null;
      }
    }

    if (!data.user) {
      await supabase.auth.signOut();
      clearSupabaseStorage();
      clearAuthState();
      return null;
    }

    setSession(nextSession);
    void registerSecuritySession(data.user);
    const auditKey = `rivox_login_audit_${nextSession.access_token.slice(-12)}`;
    if (!sessionStorage.getItem(auditKey)) {
      sessionStorage.setItem(auditKey, "1");
      void supabase.rpc("log_workspace_event", { p_action: "login", p_metadata: { source: "web" } });
    }

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
    } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (!mounted) return;

      const verificationPending =
        localStorage.getItem(VERIFICATION_PENDING_KEY) === "1";
      const cameFromVerificationLink = isVerificationCallbackUrl();
      const isAutoVerificationSession =
        event === "SIGNED_IN" &&
        Boolean(nextSession?.user?.email_confirmed_at) &&
        window.location.pathname !== "/accept-invitation" &&
        window.location.pathname !== "/login" &&
        (verificationPending || cameFromVerificationLink);

      if (isAutoVerificationSession) {
        localStorage.removeItem(VERIFICATION_PENDING_KEY);
        await supabase.auth.signOut({ scope: "local" });
        clearSupabaseStorage();
        clearAuthState();
        window.location.replace("/login?confirmed=1");
        return;
      }

      await syncSession(nextSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    let stopped = false;
    const sessionKey = `${session.user.id}:${getSecurityDeviceId()}`;

    const heartbeat = async () => {
      const { data } = await supabase.from("admin_active_sessions")
        .select("force_logout,status")
        .eq("session_key", sessionKey)
        .maybeSingle();
      if (stopped) return;
      if (data?.force_logout || data?.status === "revoked") {
        await supabase.from("admin_security_events").insert({
          event_type: "force_logout",
          actor_user_id: session.user.id,
          actor_email: session.user.email || null,
          portal: securityPortal(session.user),
          status: "warning",
          severity: "warning",
          device_label: deviceLabel(),
          user_agent: navigator.userAgent,
          details: { source: "security_center" },
        });
        await supabase.auth.signOut({ scope: "local" });
        clearSupabaseStorage();
        clearAuthState();
        window.location.replace(isStaffPortalRoute() ? "/staff/login?session=revoked" : "/login?session=revoked");
        return;
      }
      await supabase.from("admin_active_sessions").update({
        last_seen_at: new Date().toISOString(),
        device_label: deviceLabel(),
        user_agent: navigator.userAgent,
      }).eq("session_key", sessionKey);
    };

    void heartbeat();
    const timer = window.setInterval(() => void heartbeat(), 60000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [session?.user?.id]);

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

    const { data: signUpData, error } = await supabase.auth.signUp({
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

    // Supabase deliberately returns a successful-looking response for an
    // existing email in some configurations. An empty identities array is the
    // reliable signal that no new account was created.
    if (signUpData.user && Array.isArray(signUpData.user.identities) && signUpData.user.identities.length === 0) {
      await supabase.auth.signOut({ scope: "local" });
      clearSupabaseStorage();
      clearAuthState();
      return { error: "This email is already registered. Please sign in or reset your password." };
    }

    localStorage.setItem(VERIFICATION_PENDING_KEY, "1");
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
          clearAuthState();
          return { error: "This staff account is not active or not authorized." };
        }
        await syncSession(data.session, { skipProfile: true });
        return { error: null };
      }

      const profileAfterLogin = await fetchOrCreateProfile(data.user.id, data.user.email);
      if (!profileAfterLogin) {
        await supabase.auth.signOut();
        clearSupabaseStorage();
        clearAuthState();
        return { error: "This account is disabled, is a staff account, or could not be loaded." };
      }
    }

    return { error: null };
  };

  const signOut = async () => {
    if (session?.user) {
      const sessionKey = `${session.user.id}:${getSecurityDeviceId()}`;
      await supabase.from("admin_active_sessions").update({
        status: "expired",
        last_seen_at: new Date().toISOString(),
      }).eq("session_key", sessionKey);
    }
    await supabase.auth.signOut({ scope: "global" });
    clearSupabaseStorage();
    clearAuthState();
  };

  const refreshProfile = async (options?: { skipProfile?: boolean }) => {
    const { data } = await supabase.auth.getSession();

    if (!data.session?.user) {
      clearAuthState();
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
        workspaceOwnerId,
        workspaceRole,
        workspaceStatus,
        workspaceName,
        workspacePermissions,
        workspaceCustomRole,
        signUp,
        signIn,
        signOut,
        refreshProfile,
        refreshWorkspace,
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
