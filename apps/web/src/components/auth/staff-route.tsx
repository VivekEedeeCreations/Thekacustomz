import { Outlet } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';
import { useAuth } from '@/hooks/use-auth';

/** Route guard for STAFF+ pages (write-capable operational tools). */
export function StaffRoute() {
  const { hasRole, isLoading } = useAuth();

  if (isLoading) return null;

  if (!hasRole('STAFF')) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Staff access required"
        description="You don't have access to this page."
      />
    );
  }

  return <Outlet />;
}
