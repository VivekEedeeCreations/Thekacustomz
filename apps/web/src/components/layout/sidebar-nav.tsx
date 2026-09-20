import { NavLink } from 'react-router-dom';
import { Boxes } from 'lucide-react';

import { NAV_ITEMS } from '@/components/layout/nav-items';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { hasRole } = useAuth();

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex h-14 items-center gap-2 px-4 text-base font-semibold">
        <Boxes className="h-5 w-5" />
        Inventory System
      </div>
      <nav className="flex-1 space-y-1 px-2">
        {NAV_ITEMS.filter((item) => hasRole(item.minRole)).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.title}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
