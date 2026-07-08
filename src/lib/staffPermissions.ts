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
  | "read_only";

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  full_access: "Full Access",
  limited: "Limited",
  support: "Support",
  finance: "Finance",
  viewer: "Viewer",
};

export const STAFF_ROLE_PERMISSIONS: Record<StaffRole, StaffPermission[]> = {
  full_access: ["dashboard", "users", "tickets", "tasks", "finance", "reports"],
  limited: ["dashboard", "users", "tickets", "tasks"],
  support: ["dashboard", "users", "tickets", "tasks"],
  finance: ["dashboard", "finance", "reports", "tasks"],
  viewer: ["dashboard", "read_only", "reports"],
};

export function hasStaffPermission(role: StaffRole | null | undefined, permission: StaffPermission) {
  if (!role) return false;
  return STAFF_ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function getStaffPermissions(role: StaffRole | null | undefined) {
  if (!role) return [];
  return STAFF_ROLE_PERMISSIONS[role] ?? [];
}
