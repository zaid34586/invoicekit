import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { hasStaffPermission, STAFF_ROLE_LABELS, type StaffMember } from "../lib/staffPermissions";
import RivoxLogo from "./RivoxLogo";

const navBase = [
  { key: "dashboard", label: "Dashboard", icon: "📊" },
  { key: "tasks", label: "My Tasks", icon: "✅" },
  { key: "tickets", label: "Support", icon: "🎧" },
  { key: "users", label: "Users", icon: "👥" },
  { key: "finance", label: "Finance", icon: "💰" },
  { key: "reports", label: "Reports", icon: "📈" },
  { key: "communication", label: "Communication", icon: "💬" },
  { key: "notifications", label: "Notifications", icon: "🔔" },
  { key: "profile", label: "Profile", icon: "👤" },
  { key: "settings", label: "Settings", icon: "⚙️" },
];

export default function StaffLayout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [staff, setStaff] = useState<StaffMember | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [active, setActive] = useState(() => window.location.hash.replace("#", "") || "dashboard");

  useEffect(() => {
    const onHash = () => setActive(window.location.hash.replace("#", "") || "dashboard");
    window.addEventListener("hashchange", onHash);
    onHash();
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    async function loadStaff() {
      if (!user) return;
      const email = user.email?.toLowerCase() ?? "";
      const { data } = await supabase
        .from("admin_team_members")
        .select("id, auth_user_id, email, name, role, status, notes, created_at")
        .or(`auth_user_id.eq.${user.id},email.eq.${email}`)
        .maybeSingle();
      if (data?.status !== "active") return;
      const team = data as StaffMember;
      setStaff(team);
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null)
        .or(`recipient_team_member_id.eq.${team.id},role.eq.${team.role},audience.eq.staff,audience.eq.all`);
      setUnreadCount(count ?? 0);
    }
    loadStaff();
  }, [user]);

  async function handleSignOut() {
    await signOut();
    navigate("/staff/login", { replace: true });
  }

  const role = staff?.role ?? "viewer";
  const navItems = useMemo(
    () => navBase.filter((item) => ["dashboard", "communication", "notifications", "profile", "settings"].includes(item.key) || hasStaffPermission(role, item.key as any)),
    [role]
  );

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="flex min-h-screen">
        <aside className="hidden lg:flex w-80 bg-slate-950 text-white flex-col fixed inset-y-0 left-0">
          <div className="p-6 border-b border-white/10">
            <div className="flex items-center gap-3">
              <RivoxLogo showWordmark iconClassName="w-11 h-11" wordmarkClassName="text-xl text-white" />
              <div className="sr-only">Rivox Staff portal</div>
            </div>
          </div>

          <div className="p-5 border-b border-white/10">
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
              <div className="text-xs text-slate-400 uppercase font-semibold tracking-wide">Signed in as</div>
              <div className="mt-2 font-semibold truncate">{staff?.name || user?.email}</div>
              <div className="mt-1 inline-flex rounded-full bg-emerald-400/10 text-emerald-200 border border-emerald-400/20 px-2.5 py-1 text-xs font-semibold">
                {STAFF_ROLE_LABELS[role]}
              </div>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              const isActive = active === item.key;
              return (
                <a
                  key={item.key}
                  href={`#${item.key}`}
                  className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${isActive ? "bg-white text-slate-950 shadow-lg" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
                >
                  <span className="flex items-center gap-3"><span>{item.icon}</span>{item.label}</span>
                  {item.key === "notifications" && unreadCount > 0 && <span className="rounded-full bg-red-500 text-white text-[11px] min-w-5 h-5 flex items-center justify-center px-1">{unreadCount}</span>}
                </a>
              );
            })}
          </nav>

          <div className="p-4 border-t border-white/10">
            <button onClick={handleSignOut} className="w-full rounded-2xl bg-white/10 hover:bg-white/15 px-4 py-3 text-sm font-semibold text-white">Sign out</button>
          </div>
        </aside>

        <div className="flex-1 lg:pl-80">
          <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200">
            <div className="h-16 px-4 sm:px-6 lg:px-8 flex items-center justify-between">
              <div className="lg:hidden font-bold text-slate-950">Rivox Staff</div>
              <div className="hidden lg:block">
                <div className="text-sm text-slate-500">Staff workspace</div>
                <div className="font-semibold text-slate-950 capitalize">{active.replace("_", " ")}</div>
              </div>
              <div className="flex items-center gap-3">
                <a href="#notifications" className="relative rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  🔔
                  {unreadCount > 0 && <span className="absolute -top-2 -right-2 rounded-full bg-red-500 text-white text-[10px] min-w-5 h-5 flex items-center justify-center px-1">{unreadCount}</span>}
                </a>
                <button onClick={handleSignOut} className="rounded-2xl bg-slate-950 text-white px-4 py-2 text-sm font-semibold">Sign out</button>
              </div>
            </div>
            <div className="lg:hidden px-4 pb-3 overflow-x-auto">
              <div className="flex gap-2 min-w-max">
                {navItems.map((item) => (
                  <a key={item.key} href={`#${item.key}`} className={`rounded-xl px-3 py-2 text-xs font-semibold border ${active === item.key ? "bg-slate-950 text-white border-slate-950" : "bg-white text-slate-700 border-slate-200"}`}>{item.icon} {item.label}</a>
                ))}
              </div>
            </div>
          </header>

          <main className="p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
