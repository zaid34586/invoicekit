import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const adminNav = [
  { id: "dashboard", label: "Dashboard", hash: "#dashboard" },
  { id: "users", label: "Users", hash: "#users" },
  { id: "team", label: "Team Members", hash: "#team" },
  { id: "credits", label: "Credits & Plans", hash: "#credits" },
  { id: "invoices", label: "Invoices", hash: "#invoices" },
  { id: "finance", label: "Revenue & Finance", hash: "#finance" },
  { id: "tasks", label: "Tasks", hash: "#tasks" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate("/admin/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <aside className="bg-slate-950 text-white lg:w-64 lg:min-h-screen">
        <div className="h-16 flex items-center gap-3 px-5 border-b border-white/10">
          <div className="w-9 h-9 bg-slate-800 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div>
            <p className="font-bold leading-tight">InvoiceKit</p>
            <p className="text-xs text-slate-400">Admin Control</p>
          </div>
        </div>

        <nav className="flex gap-2 overflow-x-auto p-3 lg:block lg:space-y-1 lg:overflow-visible">
          {adminNav.map((item) => (
            <a
              key={item.id}
              href={item.hash}
              className="whitespace-nowrap block rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-4 sm:px-6">
          <div>
            <h1 className="text-sm font-semibold text-slate-900">Owner Admin Panel</h1>
            <p className="text-xs text-slate-500">Users, team, credits, invoices, revenue and tasks</p>
          </div>
          <button onClick={handleSignOut} className="btn-secondary text-sm">
            Sign out
          </button>
        </header>
        <main className="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
