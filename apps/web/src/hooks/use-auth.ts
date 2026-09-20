import { roleAtLeast, type UserRole } from '@inventory/shared';

import { useProfile } from '@/features/profile/queries';
import { useAuthContext } from '@/providers/auth-provider';

/**
 * Combines the Supabase session with the matching `profiles` row (which carries
 * the application role). Mirrors the server-side `current_app_role()` semantics:
 * a session with no active profile behaves as signed out for authorization
 * purposes, even though `user`/`session` are still set.
 */
export function useAuth() {
  const { session, user, isInitializing } = useAuthContext();
  const profileQuery = useProfile(user?.id);

  const profile = profileQuery.data ?? null;
  const role: UserRole | null = profile && profile.is_active ? profile.role : null;

  return {
    session,
    user,
    profile,
    role,
    isAuthenticated: !!session,
    /** True while checking the session or (once signed in) loading the profile. */
    isLoading: isInitializing || (!!user && profileQuery.isLoading),
    hasRole: (min: UserRole) => roleAtLeast(role, min),
  };
}
