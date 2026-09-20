import { Outlet } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';
import { useAuth } from '@/hooks/use-auth';

/** Route guard for admin-only pages. Mirrors the server-side ADMIN+ RLS policies. */
export function AdminRoute() {
  const { hasRole, isLoading } = useAuth();

  if (isLoading) return null;

  if (!hasRole('ADMIN')) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Admins only"
        description="You don't have access to this page."
      />
    );
  }

  return <Outlet />;
}
