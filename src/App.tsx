import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import CheckEmail from "./pages/CheckEmail";
import BusinessSetup from "./pages/BusinessSetup";
import VerifyPhone from "./pages/VerifyPhone";

import AppLayout from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import NewInvoice from "./pages/NewInvoice";
import InvoicePreview from "./pages/InvoicePreview";
import Invoices from "./pages/Invoices";
import Clients from "./pages/Clients";
import Account from "./pages/Account";
import Billing from "./pages/Billing";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Support from "./pages/Support";
import Admin from "./pages/Admin";
import AdminLogin from "./pages/AdminLogin";
import StaffLogin from "./pages/StaffLogin";
import StaffDashboard from "./pages/StaffDashboard";
import AdminLayout from "./components/AdminLayout";
import StaffLayout from "./components/StaffLayout";
import StaffRoute from "./components/StaffRoute";
import ShareInvoice from "./pages/ShareInvoice";
import { ADMIN_EMAIL } from "./lib/constants";


function getPortalHost() {
  const host = window.location.hostname.toLowerCase();
  return {
    isStaffHost: host === "staff.invoicekit.com" || host.startsWith("staff."),
    isAdminHost: host === "admin.invoicekit.com" || host.startsWith("admin."),
  };
}

function HostHomeRedirect() {
  const { isStaffHost, isAdminHost } = getPortalHost();
  if (isStaffHost) return <Navigate to="/staff/login" replace />;
  if (isAdminHost) return <Navigate to="/admin/login" replace />;
  return <Landing />;
}

function StaffHostOnly({ children }: { children: ReactNode }) {
  const { isAdminHost } = getPortalHost();
  if (isAdminHost) return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}

function AdminHostOnly({ children }: { children: ReactNode }) {
  const { isStaffHost } = getPortalHost();
  if (isStaffHost) return <Navigate to="/staff/login" replace />;
  return <>{children}</>;
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="card p-8 max-w-sm w-full text-center animate-fade-in">
        <div className="w-14 h-14 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <div className="w-7 h-7 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>

        <h2 className="text-lg font-semibold text-slate-900">
          Loading your workspace
        </h2>

        <p className="text-sm text-slate-500 mt-2">
          Please wait while we prepare your account...
        </p>
      </div>
    </div>
  );
}

// Only accessible when NOT logged in
function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useAuth();
  if (loading && !user) return <LoadingScreen />;
  if (!user) return <>{children}</>;

const confirmed =
  new URLSearchParams(window.location.search).get("confirmed") === "1";

if (confirmed && window.location.pathname === "/login") {
  return <>{children}</>;
}

if (!user.email_confirmed_at) {
  return <Navigate to="/check-email" replace />;
}

if (!profile) {
  return <LoadingScreen />;
}

if (!profile.country) {
  return <Navigate to="/business-setup" replace />;
}

if (!profile.phone_verified) {
  return <Navigate to="/verify-phone" replace />;
}

return <Navigate to="/dashboard" replace />;
}

// Full auth: email confirmed + business country set + phone verified
function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.email_confirmed_at) return <Navigate to="/check-email" replace />;
  if (!profile?.country) return <Navigate to="/business-setup" replace />;
  if (!profile?.phone_verified) return <Navigate to="/verify-phone" replace />;
  return <>{children}</>;
}

// Admin-only route — deliberately separate from ProtectedRoute above.
// It does NOT require business-setup/phone-verify (the admin account isn't
// a real customer business), and it does not accept just any logged-in
// user — only the one fixed ADMIN_EMAIL account. Anyone else (including a
// perfectly normal, fully-verified customer) is sent to the admin login
// page, never to the customer /login (keeping the two flows fully
// separate, with no signup path here).
function AdminRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user || user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return <Navigate to="/admin/login" replace />;
  }
  return <>{children}</>;
}

// Business setup route: email confirmed, but business country not set yet.
// This is what guarantees Phone Verification never runs without a country.
function BusinessSetupRoute() {
  const { user, profile, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.email_confirmed_at) return <Navigate to="/check-email" replace />;
  if (profile?.country) {
    return profile.phone_verified
      ? <Navigate to="/dashboard" replace />
      : <Navigate to="/verify-phone" replace />;
  }
  return <BusinessSetup />;
}

// Phone verify route: email confirmed + country set, but phone not verified
function PhoneRoute() {
  const { user, profile, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.email_confirmed_at) return <Navigate to="/check-email" replace />;
  if (!profile?.country) return <Navigate to="/business-setup" replace />;
  if (profile?.phone_verified) return <Navigate to="/dashboard" replace />;
  return <VerifyPhone />;
}

// Check email route: signed up but email not confirmed yet
function CheckEmailRoute() {
  const { user, profile, loading } = useAuth();

  

  if (loading) return <LoadingScreen />;

  if (user?.email_confirmed_at) {
  return <Navigate to="/login?confirmed=1" replace />;
}

  if (!user) return <Navigate to="/signup" replace />;

  if (user.email_confirmed_at && profile?.phone_verified) {
    return <Navigate to="/dashboard" replace />;
  }

  

  return <CheckEmail />;
}
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HostHomeRedirect />} />

      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <Login />
          </PublicOnlyRoute>
        }
      />

      <Route
        path="/signup"
        element={
          <PublicOnlyRoute>
            <Signup />
          </PublicOnlyRoute>
        }
      />

      <Route path="/check-email" element={<CheckEmailRoute />} />
      <Route path="/business-setup" element={<BusinessSetupRoute />} />
      <Route path="/verify-phone" element={<PhoneRoute />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <AppLayout><Dashboard /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/new"
        element={
          <ProtectedRoute>
            <AppLayout><NewInvoice /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/invoice/:id"
        element={
          <ProtectedRoute>
            <AppLayout><InvoicePreview /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/invoices"
        element={
          <ProtectedRoute>
            <AppLayout><Invoices /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/clients"
        element={
          <ProtectedRoute>
            <AppLayout><Clients /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/account"
        element={
          <ProtectedRoute>
            <AppLayout><Account /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/billing"
        element={
          <ProtectedRoute>
            <AppLayout><Billing /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <AppLayout><Reports /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <AppLayout><Settings /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/support"
        element={
          <ProtectedRoute>
            <AppLayout><Support /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <AdminHostOnly>
            <AdminRoute>
              <AdminLayout><Admin /></AdminLayout>
            </AdminRoute>
          </AdminHostOnly>
        }
      />
      {/* Deliberately not linked anywhere in the app UI — reached only by
          typing this exact URL. No signup exists for this account. */}
      <Route path="/admin/login" element={<AdminHostOnly><AdminLogin /></AdminHostOnly>} />


      <Route path="/staff/login" element={<StaffHostOnly><StaffLogin /></StaffHostOnly>} />
      <Route
        path="/staff"
        element={
          <StaffHostOnly>
            <StaffRoute>
              <StaffLayout><StaffDashboard /></StaffLayout>
            </StaffRoute>
          </StaffHostOnly>
        }
      />

      <Route path="/share/:token" element={<ShareInvoice />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}