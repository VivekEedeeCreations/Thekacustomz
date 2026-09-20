import type { ReactNode } from 'react';
import type { UserRole } from '@inventory/shared';

import { useAuth } from '@/hooks/use-auth';

/** Renders `children` only if the signed-in user's role meets `min`; otherwise `fallback` (default: nothing). */
export function RoleGate({
  min,
  children,
  fallback = null,
}: {
  min: UserRole;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { hasRole } = useAuth();
  return hasRole(min) ? <>{children}</> : <>{fallback}</>;
}
