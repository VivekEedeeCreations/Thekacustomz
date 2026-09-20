/**
 * Mirrors the `public.user_role` Postgres enum (packages/shared/src/database.types.ts)
 * and its ordering (`supabase/migrations/20260907120100_auth_profiles_and_roles.sql`).
 * Enum values compare by definition order in Postgres — this array's order IS that order.
 */
export const USER_ROLES = ['VIEWER', 'STAFF', 'MANAGER', 'ADMIN', 'OWNER'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  VIEWER: 'Viewer',
  STAFF: 'Staff',
  MANAGER: 'Manager',
  ADMIN: 'Admin',
  OWNER: 'Owner',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  VIEWER: 'Read-only access to all application data.',
  STAFF: 'Manage catalog, vendors, inventory movements, and purchasing.',
  MANAGER: 'Staff permissions plus categories and locations configuration.',
  ADMIN: 'Manager permissions plus deleting records and managing user roles.',
  OWNER: 'Full access. Automatically granted to the first user who signs up.',
};

export function roleRank(role: UserRole): number {
  return USER_ROLES.indexOf(role);
}

/** Mirrors `public.has_min_role()`: does `role` meet or exceed `min`? */
export function roleAtLeast(role: UserRole | null | undefined, min: UserRole): boolean {
  if (!role) return false;
  return roleRank(role) >= roleRank(min);
}
