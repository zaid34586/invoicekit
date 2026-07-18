import { useState, useRef, useEffect, type ReactNode } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function NavItem({
  to,
  icon,
  label,
  onClick,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `group flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${
          isActive
            ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-200/70"
            : "text-slate-600 hover:bg-violet-50 hover:text-violet-700"
        }`
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}

function UserMenu() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleSignOut() {
    setOpen(false);
    await signOut();
    navigate("/login", { replace: true });
  }

  function handleNavigate(path: string) {
    setOpen(false);
    navigate(path);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100 transition"
      >
        <div className="w-8 h-8 rounded-full overflow-hidden bg-primary-600 flex items-center justify-center">
  {profile?.logo_url ? (
    <img
      src={profile.logo_url}
      alt="Business Logo"
      className="w-full h-full object-cover"
    />
  ) : (
    <span className="text-white text-sm font-semibold">
      {user?.email?.[0]?.toUpperCase() ?? "U"}
    </span>
  )}
</div>
        <span className="text-sm text-slate-700 font-medium hidden sm:block max-w-[160px] truncate">
          {user?.email}
        </span>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 card p-1.5 animate-scale-in z-50">
          <div className="px-3 py-2 border-b border-slate-100 mb-1">
            <p className="text-xs text-slate-400">Signed in as</p>
            <p className="text-sm font-medium text-slate-700 truncate">
              {user?.email}
            </p>
          </div>

          {/* Settings */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => handleNavigate("/settings")}
            onKeyDown={(e) => e.key === "Enter" && handleNavigate("/settings")}
            className="w-full text-left px-3 py-2 rounded-md text-sm text-slate-600 hover:bg-slate-100 transition flex items-center gap-2 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </div>

          {/* Billing */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => handleNavigate("/billing")}
            onKeyDown={(e) => e.key === "Enter" && handleNavigate("/billing")}
            className="w-full text-left px-3 py-2 rounded-md text-sm text-slate-600 hover:bg-slate-100 transition flex items-center gap-2 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M5 7v10a2 2 0 002 2h10a2 2 0 002-2V7M7 11h4" />
            </svg>
            Billing & Subscription
          </div>

          {/* Account */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => handleNavigate("/account")}
            onKeyDown={(e) => e.key === "Enter" && handleNavigate("/account")}
            className="w-full text-left px-3 py-2 rounded-md text-sm text-slate-600 hover:bg-slate-100 transition flex items-center gap-2 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Account
          </div>

          <div className="border-t border-slate-100 mt-1 pt-1">
            {/* Sign out */}
            <div
              role="button"
              tabIndex={0}
              onClick={handleSignOut}
              onKeyDown={(e) => e.key === "Enter" && handleSignOut()}
              className="w-full text-left px-3 py-2 rounded-md text-sm text-red-600 hover:bg-red-50 transition flex items-center gap-2 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign out
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1.5 px-4 py-6">
      <div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Workspace</div>
      <NavItem to="/dashboard" icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>} label="Dashboard" onClick={onNavigate} />
      <NavItem to="/new" icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>} label="New Invoice" onClick={onNavigate} />
      <NavItem to="/invoices" icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>} label="All Invoices" onClick={onNavigate} />
      <NavItem to="/clients" icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-5.13a4 4 0 11-8 0 4 4 0 018 0zm6 0a4 4 0 11-8 0 4 4 0 018 0z" /></svg>} label="Clients" onClick={onNavigate} />
      <NavItem to="/billing" icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M5 7v10a2 2 0 002 2h10a2 2 0 002-2V7M7 11h4" /></svg>} label="Billing & Plans" onClick={onNavigate} />
      <NavItem to="/reports" icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>} label="Reports" onClick={onNavigate} />
      <NavItem to="/team-members" icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-4-4h-1M9 20H4v-2a4 4 0 014-4h1m6-5a4 4 0 11-8 0 4 4 0 018 0zm6 1a3 3 0 11-6 0" /></svg>} label="Team Members" onClick={onNavigate} />
      <NavItem to="/settings" icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>} label="Settings" onClick={onNavigate} />
    </nav>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,_rgba(124,58,237,0.08),_transparent_30%),linear-gradient(to_bottom,#f8fafc,#f1f5f9)]">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="flex items-center justify-between h-[72px] px-4 sm:px-7">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-slate-100 transition"
              aria-label="Toggle menu"
            >
              <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <NavLink to="/dashboard" className="group flex items-center gap-3">
              <img src="/favicon.svg" alt="Rivox" className="h-10 w-10 drop-shadow-sm transition-transform duration-200 group-hover:scale-105" />
              <div className="leading-none">
                <span className="block text-[22px] font-black tracking-[-0.04em] text-slate-950">Rivox</span>
                <span className="mt-1 block text-[9px] font-bold uppercase tracking-[0.22em] text-violet-500">Business OS</span>
              </div>
            </NavLink>
          </div>
          <UserMenu />
        </div>
      </header>

      <div className="flex">
        <aside className="hidden lg:block w-64 flex-shrink-0 border-r border-slate-200/80 bg-white/85 backdrop-blur-xl min-h-[calc(100vh-4.5rem)] sticky top-[72px]">
          <SidebarContent />
        </aside>

        {sidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-30">
            <div className="absolute inset-0 bg-slate-900/40" onClick={() => setSidebarOpen(false)} />
            <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white border-r border-slate-200 animate-fade-in">
              <div className="h-16 flex items-center px-4 border-b border-slate-200">
                <span className="font-bold text-slate-900">Menu</span>
              </div>
              <SidebarContent onNavigate={() => setSidebarOpen(false)} />
            </aside>
          </div>
        )}

        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}