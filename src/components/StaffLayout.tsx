import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import {
  getStaffPermissions,
  hasStaffPermission,
  STAFF_ROLE_LABELS,
  type StaffMember,
} from "../lib/staffPermissions";

export default function StaffLayout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [staff, setStaff] = useState<StaffMember | null>(null);

  useEffect(() => {
    async function loadStaff() {
      if (!user) return;
      const email = user.email?.toLowerCase() ?? "";
      const { data } = await supabase
        .from("admin_team_members")
        .select("id, auth_user_id, email, name, role, status, notes, created_at")
        .or(`auth_user_id.eq.${user.id},email.eq.${email}`)
        .maybeSingle();
      if (data?.status === "active") setStaff(data as StaffMember);
    }
    loadStaff();
  }, [user]);

  async function handleSignOut() {
    await signOut();
    navigate("/staff/login", { replace: true });
  }

  const role = staff?.role ?? "viewer";
  const permissions = getStaffPermissions(role);

  const navItems = useMemo(() => [
    { key: "dashboard", label: "Dashboard", icon: "📊" },
    { key: "tasks", label: "My Tasks", icon: "📋" },
    { key: "tickets", label: "Support Tickets", icon: "🎫" },
    { key: "users", label: "Users", icon: "👥" },
    { key: "finance", label: "Finance", icon: "💰" },
    { key: "reports", label: "Reports", icon: "📄" },
    { key: "profile", label: "Profile", icon: "👤" },
  ].filter((item) => item.key === "profile" || hasStaffPermission(role, item.key as any)), [role]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white">
        <div className="flex items-center justify-between h-16 px-5 lg:px-8">
          <div>
            <div className="font-bold text-lg">InvoiceKit Staff</div>
            <div className="text-xs text-slate-400">Role-based workspace</div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:block text-right">
              <div className="text-sm font-semibold">{staff?.name || user?.email}</div>
              <div className="text-xs text-slate-400">{STAFF_ROLE_LABELS[role]}</div>
            </div>
            <button onClick={handleSignOut} className="text-sm text-slate-300 hover:text-white">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="md:hidden bg-white border-b border-slate-200 px-4 py-3 overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {navItems.map((item) => (
            <a
              key={item.key}
              href={`#${item.key}`}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200"
            >
              <span>{item.icon}</span>
              {item.label}
            </a>
          ))}
        </div>
      </div>

      <div className="flex">
        <aside className="hidden md:block w-72 min-h-[calc(100vh-4rem)] bg-white border-r border-slate-200 p-5">
          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 mb-5">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Access</div>
            <div className="mt-1 font-semibold text-slate-900">{STAFF_ROLE_LABELS[role]}</div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {permissions.map((p) => (
                <span key={p} className="text-[11px] rounded-full bg-primary-50 text-primary-700 px-2 py-1 border border-primary-100">
                  {p.replace("_", " ")}
                </span>
              ))}
            </div>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => (
              <a key={item.key} href={`#${item.key}`} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-100">
                <span>{item.icon}</span>
                {item.label}
              </a>
            ))}
          </nav>
        </aside>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
