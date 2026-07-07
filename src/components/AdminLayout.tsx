import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Deliberately separate from AppLayout.tsx — the admin panel is a
// completely different surface from the customer-facing app, so it does
// not show the customer sidebar (Dashboard/New Invoice/Clients/Billing/
// Settings). Just a header identifying it as Admin, and a sign-out button.
export default function AdminLayout({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate("/admin/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto flex items-center justify-between h-14 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-slate-700 rounded-md flex items-center justify-center">
              <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <span className="font-semibold text-sm">InvoiceKit Admin</span>
          </div>
          <button
            onClick={handleSignOut}
            className="text-sm text-slate-300 hover:text-white transition flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
        </div>
      </header>
      <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
