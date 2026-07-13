import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import type { StaffMember } from "../lib/staffPermissions";

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm">
        <div className="w-10 h-10 border-4 border-primary-100 border-t-primary-600 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm font-medium text-slate-700">Checking staff access...</p>
      </div>
    </div>
  );
}

export default function StaffRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [checking, setChecking] = useState(true);
  const [staff, setStaff] = useState<StaffMember | null>(null);

  useEffect(() => {
    let mounted = true;

    async function checkStaff() {
      if (loading) return;

      // Don't trust `user` from context alone here — right after a fresh
      // page load (e.g. staff opens a bookmarked /staff URL), AuthContext's
      // `loading` can flip to false a moment before `user` is actually
      // populated (same timing gap documented in AuthContext.tsx). Checking
      // the session directly avoids redirecting a genuinely logged-in staff
      // member to /staff/login just because of that gap.
      const { data: sessionData } = await supabase.auth.getSession();
      const activeUser = sessionData.session?.user ?? user;

      if (!mounted) return;

      if (!activeUser) {
        setChecking(false);
        return;
      }

      const email = activeUser.email?.toLowerCase() ?? "";
      const { data, error } = await supabase
        .from("admin_team_members")
        .select("id, auth_user_id, email, name, role, status, notes, created_at")
        .or(`auth_user_id.eq.${activeUser.id},email.eq.${email}`)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        console.error("Staff access check failed:", error.message);
        setStaff(null);
      } else if (data?.status === "active") {
        setStaff(data as StaffMember);
      } else {
        setStaff(null);
      }
      setChecking(false);
    }

    checkStaff();
    return () => {
      mounted = false;
    };
  }, [user, loading]);

  if (loading || checking) return <LoadingScreen />;
  if (!staff) return <Navigate to="/staff/login" replace />;

  return <>{children}</>;
}
