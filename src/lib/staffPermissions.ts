export type StaffRole = "full_access" | "limited" | "support" | "finance" | "viewer";

export interface StaffMember {
  id: string;
  auth_user_id: string | null;
  email: string;
  name: string | null;
  role: StaffRole;
  status: "active" | "disabled";
  notes: string | null;
  created_at: string;
}

export type StaffPermission =
  | "dashboard"
  | "users"
  | "tickets"
  | "tasks"
  | "finance"
  | "reports"
  | "communication"
  | "read_only";

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  full_access: "Full Access",
  limited: "Limited",
  support: "Support",
  finance: "Finance",
  viewer: "Viewer",
};

export const STAFF_ROLE_PERMISSIONS: Record<StaffRole, StaffPermission[]> = {
  full_access: ["dashboard", "users", "tickets", "tasks", "finance", "reports", "communication"],
  // Fix: "limited" previously had the exact same permissions as "support"
  // (dashboard, users, tickets, tasks, communication) — the two roles looked
  // and behaved identically in the staff portal, which is what looked like a
  // bug to a tester comparing them side by side. "limited" should be a more
  // restricted role than "support": no ticket/support-queue access.
  limited: ["dashboard", "users", "tasks", "communication"],
  support: ["dashboard", "users", "tickets", "tasks", "communication"],
  // Fix: automation engine (assignment_rules) routes billing/refund tickets
  // straight to Finance-role staff, but "finance" had no "tickets" permission
  // -- that staff member got the assignment + notification but the Tickets
  // page itself said "Access not available". Finance must be able to open
  // and work the tickets the engine assigns to them.
  finance: ["dashboard", "finance", "tickets", "reports", "tasks", "communication"],
  viewer: ["dashboard", "read_only", "reports", "communication"],
};

export const STAFF_PERMISSION_LABELS: Record<StaffPermission, string> = {
  dashboard: "Dashboard",
  users: "Users",
  tickets: "Support Tickets",
  tasks: "Tasks",
  finance: "Finance",
  reports: "Reports",
  communication: "Communication",
  read_only: "Read-only Access",
};

export function hasStaffPermission(role: StaffRole | null | undefined, permission: StaffPermission) {
  if (!role) return false;
  return STAFF_ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function getStaffPermissions(role: StaffRole | null | undefined) {
  if (!role) return [];
  return STAFF_ROLE_PERMISSIONS[role] ?? [];
}
