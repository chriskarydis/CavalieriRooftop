/**
 * Role-based permissions. Checked on the server before every management
 * action; hiding a link in the UI is never the control.
 */

export const STAFF_ROLES = ["MANAGER", "DEVELOPER"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const PERMISSIONS = [
  /** Reservations, walk-ins, live floor. */
  "operations",
  /** Tables, categories, fees, combinations, floor plan, menu, opening rules. */
  "configuration",
  /** Discretionary refunds outside the cancellation policy. */
  "refunds",
  "analytics",
  /** Staff accounts, system settings, logs, state corrections. */
  "system",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const GRANTS: Record<StaffRole, readonly Permission[]> = {
  MANAGER: ["operations", "configuration", "refunds", "analytics"],
  DEVELOPER: PERMISSIONS,
};

export function hasPermission(role: StaffRole, permission: Permission): boolean {
  return GRANTS[role].includes(permission);
}
