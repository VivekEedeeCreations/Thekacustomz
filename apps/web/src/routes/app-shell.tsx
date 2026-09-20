import { Outlet, useLocation } from 'react-router-dom';

import { NAV_ITEMS } from '@/components/layout/nav-items';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { Topbar } from '@/components/layout/topbar';

function resolveTitle(pathname: string): string {
  if (pathname.startsWith('/products/new')) return 'New product';
  if (/^\/products\/[^/]+$/.test(pathname)) return 'Product';
  if (pathname.startsWith('/orders/new')) return 'New order';
  if (/^\/orders\/[^/]+$/.test(pathname)) return 'Order';

  const match = NAV_ITEMS.filter((item) => item.to !== '/' && pathname.startsWith(item.to)).sort(
    (a, b) => b.to.length - a.to.length,
  )[0];
  return match?.title ?? 'Dashboard';
}

export function AppShell() {
  const location = useLocation();

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 border-r lg:block print:hidden">
        <div className="fixed inset-y-0 left-0 w-64 border-r bg-background">
          <SidebarNav />
        </div>
      </aside>
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <div className="print:hidden">
          <Topbar title={resolveTitle(location.pathname)} />
        </div>
        <main className="min-w-0 flex-1 p-4 sm:p-6 print:p-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
