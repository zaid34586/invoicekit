import { type ReactNode, Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";

// Every route below is code-split (React.lazy) so the first page a visitor
// hits only downloads the JS it actually needs — a customer landing on the
// marketing page no longer pulls in the entire Admin panel or Staff
// dashboard bundle (previously ~2MB of JS on every single load).
const Landing = lazy(() => import("./pages/Landing"));
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const CheckEmail = lazy(() => import("./pages/CheckEmail"));
const BusinessSetup = lazy(() => import("./pages/BusinessSetup"));
const VerifyPhone = lazy(() => import("./pages/VerifyPhone"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));

const AppLayout = lazy(() => import("./components/AppLayout"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const NewInvoice = lazy(() => import("./pages/NewInvoice"));
const InvoicePreview = lazy(() => import("./pages/InvoicePreview"));
const Invoices = lazy(() => import("./pages/Invoices"));
const Clients = lazy(() => import("./pages/Clients"));
const Account = lazy(() => import("./pages/Account"));
const Billing = lazy(() => import("./pages/Billing"));
const Reports = lazy(() => import("./pages/Reports"));
const Settings = lazy(() => import("./pages/Settings"));
const TeamMembers = lazy(() => import("./pages/TeamMembers"));
const Support = lazy(() => import("./pages/Support"));
const KnowledgeBase = lazy(() => import("./pages/KnowledgeBase"));
const Business = lazy(() => import("./pages/Business"));
const AcceptInvitation = lazy(() => import("./pages/AcceptInvitation"));
const ChangeTemporaryPassword = lazy(() => import("./pages/ChangeTemporaryPassword"));
const Admin = lazy(() => import("./pages/Admin"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const StaffLogin = lazy(() => import("./pages/StaffLogin"));
const StaffDashboard = lazy(() => import("./pages/StaffDashboard"));
const AdminLayout = lazy(() => import("./components/AdminLayout"));
const StaffLayout = lazy(() => import("./components/StaffLayout"));
import StaffRoute from "./components/StaffRoute";
const ShareInvoice = lazy(() => import("./pages/ShareInvoice"));
import { ADMIN_EMAIL } from "./lib/constants";
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));
const RefundPolicy = lazy(() => import("./pages/RefundPolicy"));
const PricingPage = lazy(() => import("./pages/PricingPage"));
const About = lazy(() => import("./pages/About"));
const Contact = lazy(() => import("./pages/Contact"));
const Security = lazy(() => import("./pages/Security"));
const NotFound = lazy(() => import("./pages/NotFound"));
import ScrollToTop from "./components/ScrollToTop";
import AnalyticsTracker from "./components/AnalyticsTracker";
const MaintenancePage = lazy(() => import("./pages/MaintenancePage"));
import { usePlatformSettings } from "./lib/platformSettings";


// Single place that decides whether phone verification is "satisfied".
// True whenever the admin has turned the requirement off (Admin -> System
// Center -> Feature Flags -> "Phone (OTP) Verification"), regardless of
// what's actually stored on the profile — so nobody gets stuck at
// /verify-phone while the flag is off. profile.phone_verified itself is
// never modified by this, so re-enabling the flag later immediately goes
// back to requiring it exactly as before.
function phoneVerificationSatisfied(
  phoneVerified: boolean | undefined,
  settingsLoaded: boolean,
  phoneVerificationRequired: boolean
): boolean {
  if (settingsLoaded && !phoneVerificationRequired) return true;
  return Boolean(phoneVerified);
}

function getPortalHost() {
  const host = window.location.hostname.toLowerCase();
  return {
    isStaffHost: host === "staff.rivoxcloud.com" || host.startsWith("staff."),
    isAdminHost: host === "admin.rivoxcloud.com" || host.startsWith("admin."),
  };
}

function HostHomeRedirect() {
  const { isStaffHost, isAdminHost } = getPortalHost();
  if (isStaffHost) return <Navigate to="/staff/login" replace />;
  if (isAdminHost) return <Navigate to="/admin/login" replace />;

  const { user, loading } = useAuth();
  // If Supabase already established a session by the time we land here
  // (e.g. the email-confirmation link's redirect ended up on "/" instead of
  // "/login?confirmed=1" for any reason — dashboard allow-list mismatch,
  // stale link, etc.), don't silently show the marketing landing page.
  // Funnel straight into the login form with the confirmed banner instead,
  // so the user re-enters their credentials and the normal post-login flow
  // (business-setup → verify-phone → dashboard) takes over from there.
  if (!loading && user) {
    return <Navigate to="/login?confirmed=1" replace />;
  }

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
  const { settings, loaded } = usePlatformSettings();
  if (loading && !user) return <LoadingScreen />;
  if (!user) {
    if (loaded && settings.maintenance_mode) return <MaintenancePage message={settings.maintenance_message} />;
    if (loaded && !settings.public_signup && window.location.pathname === "/signup") {
      return <MaintenancePage message="New signups are temporarily closed. Please check back soon." />;
    }
    return <>{children}</>;
  }

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

if (!phoneVerificationSatisfied(profile.phone_verified, loaded, settings.phone_verification_required)) {
  return <Navigate to="/verify-phone" replace />;
}

return <Navigate to="/dashboard" replace />;
}

// Full auth: email confirmed + business country set + phone verified
function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, profile, loading, workspaceRole, workspaceStatus } = useAuth();
  const { settings, loaded } = usePlatformSettings();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  const isOwnerAccount = user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  if (loaded && settings.maintenance_mode && !(settings.allow_admin_bypass && isOwnerAccount)) {
    return <MaintenancePage message={settings.maintenance_message} />;
  }
  if (user.user_metadata?.force_password_change === true) return <Navigate to="/change-temporary-password" replace />;
  if (!user.email_confirmed_at) return <Navigate to="/check-email" replace />;
  if (workspaceStatus === "disabled" || workspaceStatus === "removed") return <>{children}</>;
  if (workspaceRole && workspaceRole !== "owner" && workspaceStatus === "active") return <>{children}</>;
  if (!profile?.country) return <Navigate to="/business-setup" replace />;
  if (!phoneVerificationSatisfied(profile?.phone_verified, loaded, settings.phone_verification_required)) {
    return <Navigate to="/verify-phone" replace />;
  }
  return <>{children}</>;
}

function SignedInRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

type WorkspaceRole = "owner" | "manager" | "accountant" | "staff";
function WorkspaceRoute({ children, allow, permission }: { children: ReactNode; allow: WorkspaceRole[]; permission?: string }) {
  const { workspaceRole, workspaceStatus, workspacePermissions, signOut } = useAuth();
  if (workspaceStatus === "disabled" || workspaceStatus === "removed") {
    return <div className="min-h-screen grid place-items-center bg-slate-100 px-4"><div className="card max-w-md p-8 text-center"><h1 className="text-2xl font-black text-slate-900">Workspace access unavailable</h1><p className="mt-3 text-slate-600">Your access was {workspaceStatus}. Contact the workspace owner if this was unexpected.</p><button className="btn-primary mt-6" onClick={() => void signOut()}>Sign out</button></div></div>;
  }
  if (workspaceRole && !allow.includes(workspaceRole)) return <Navigate to={workspaceRole === "accountant" || workspaceRole === "staff" ? "/clients" : "/dashboard"} replace />;
  if (workspaceRole && workspaceRole !== "owner" && permission && !workspacePermissions.includes("*") && !workspacePermissions.includes(permission)) {
    return <div className="min-h-screen grid place-items-center bg-slate-100 px-4"><div className="card max-w-md p-8 text-center"><h1 className="text-2xl font-black text-slate-900">Permission required</h1><p className="mt-3 text-slate-600">Your workspace role does not allow access to this page. Contact the workspace owner.</p><button className="btn-primary mt-6" onClick={() => void signOut()}>Sign out</button></div></div>;
  }
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
  const { settings, loaded } = usePlatformSettings();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.email_confirmed_at) return <Navigate to="/check-email" replace />;
  if (profile?.country) {
    return phoneVerificationSatisfied(profile.phone_verified, loaded, settings.phone_verification_required)
      ? <Navigate to="/dashboard" replace />
      : <Navigate to="/verify-phone" replace />;
  }
  return <BusinessSetup />;
}

// Phone verify route: email confirmed + country set, but phone not verified
function PhoneRoute() {
  const { user, profile, loading } = useAuth();
  const { settings, loaded } = usePlatformSettings();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.email_confirmed_at) return <Navigate to="/check-email" replace />;
  if (!profile?.country) return <Navigate to="/business-setup" replace />;
  if (phoneVerificationSatisfied(profile?.phone_verified, loaded, settings.phone_verification_required)) {
    return <Navigate to="/dashboard" replace />;
  }
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
    <>
      <ScrollToTop />
      <AnalyticsTracker />
      <Suspense fallback={<LoadingScreen />}>
      <Routes>
      <Route path="/" element={<HostHomeRedirect />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/refund-policy" element={<RefundPolicy />} />
      <Route path="/about" element={<About />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/security" element={<Security />} />

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

      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route path="/check-email" element={<CheckEmailRoute />} />
      <Route path="/business-setup" element={<BusinessSetupRoute />} />
      <Route path="/verify-phone" element={<PhoneRoute />} />
      <Route path="/accept-invitation" element={<AcceptInvitation />} />
      <Route path="/change-temporary-password" element={<SignedInRoute><ChangeTemporaryPassword /></SignedInRoute>} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <WorkspaceRoute allow={["owner","manager","accountant","staff"]} permission="dashboard.view"><AppLayout><Dashboard /></AppLayout></WorkspaceRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/new"
        element={
          <ProtectedRoute>
            <WorkspaceRoute allow={["owner","manager","accountant","staff"]} permission="invoices.create"><AppLayout><NewInvoice /></AppLayout></WorkspaceRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/invoice/:id"
        element={
          <ProtectedRoute>
            <WorkspaceRoute allow={["owner","manager","accountant","staff"]} permission="invoices.view"><AppLayout><InvoicePreview /></AppLayout></WorkspaceRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/invoices"
        element={
          <ProtectedRoute>
            <WorkspaceRoute allow={["owner","manager","accountant","staff"]} permission="invoices.view"><AppLayout><Invoices /></AppLayout></WorkspaceRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/clients"
        element={
          <ProtectedRoute>
            <WorkspaceRoute allow={["owner","manager","accountant","staff"]} permission="clients.view"><AppLayout><Clients /></AppLayout></WorkspaceRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/account"
        element={
          <ProtectedRoute>
            <WorkspaceRoute allow={["owner"]}><AppLayout><Account /></AppLayout></WorkspaceRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/billing"
        element={
          <ProtectedRoute>
            <WorkspaceRoute allow={["owner"]}><AppLayout><Billing /></AppLayout></WorkspaceRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/team-members"
        element={
          <ProtectedRoute>
            <WorkspaceRoute allow={["owner"]}><AppLayout><TeamMembers /></AppLayout></WorkspaceRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <WorkspaceRoute allow={["owner","manager","accountant","staff"]} permission="reports.view"><AppLayout><Reports /></AppLayout></WorkspaceRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <WorkspaceRoute allow={["owner"]}><AppLayout><Settings /></AppLayout></WorkspaceRoute>
          </ProtectedRoute>
        }
      />
      <Route path="/support" element={<ProtectedRoute><WorkspaceRoute allow={["owner","manager","accountant","staff"]}><AppLayout><Support /></AppLayout></WorkspaceRoute></ProtectedRoute>} />
      <Route path="/support/knowledge-base" element={<ProtectedRoute><WorkspaceRoute allow={["owner","manager","accountant","staff"]}><AppLayout><KnowledgeBase /></AppLayout></WorkspaceRoute></ProtectedRoute>} />
      <Route path="/business" element={<ProtectedRoute><WorkspaceRoute allow={["owner"]}><AppLayout><Business /></AppLayout></WorkspaceRoute></ProtectedRoute>} />
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
      <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
    </>
  );
}
